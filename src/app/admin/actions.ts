'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { citySlug } from '@/lib/cityNews'
import { CITIES } from '@/lib/cities'
import type { NewsStoryType, NewsPriority, NewsReviewStatus } from '@/lib/types/database'
import {
  canPublishCandidate,
  canUnpublishCandidate,
  isBlockedTestContent,
  resolveCityNewsTargets,
  buildPublishUpsertRows,
  buildUnpublishDeleteFilter,
  buildPublishCandidatePatch,
  buildUnpublishCandidatePatch,
  revalidatePathsForCandidate,
  normalizeUrl,
  describeDuplicateUrl,
  type CandidateCityTarget,
} from '@/lib/newsPublishing'
import { fetchArticleHtml, extractArticleMetadata, UnsafeUrlError, FetchArticleError } from '@/lib/urlIntake'
import { requestAiSuggestions } from '@/lib/newsAiSuggestions'
import {
  buildSocialPackDraft,
  isEligibleForAutoSocialPack,
  resolveNewsCandidateContext,
  buildEventContext,
  canAdvanceSocialPackStatus,
} from '@/lib/socialPack'
import type { SocialPackStatus } from '@/lib/types/database'

// ── Auth ─────────────────────────────────────────────────────────────────────

export async function loginAction(formData: FormData) {
  const password = formData.get('password') as string
  if (password && password === process.env.ADMIN_PASSWORD) {
    const store = await cookies()
    store.set('admin_token', password, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7,
      path: '/',
    })
    redirect('/admin')
  }
  redirect('/admin/login?error=1')
}

export async function logoutAction() {
  const store = await cookies()
  store.delete('admin_token')
  redirect('/admin/login')
}

async function checkAuth() {
  const store = await cookies()
  const token = store.get('admin_token')?.value
  if (!token || token !== process.env.ADMIN_PASSWORD) {
    redirect('/admin/login')
  }
}

// ── Artists ──────────────────────────────────────────────────────────────────

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').substring(0, 80)
}

const MONTHS: Record<string, string> = {
  Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06',
  Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12',
}

// Parse bulk paste format: "06 Dec 2026, 19:30, Venue Name, City"
function parseBulkDates(raw: string) {
  return raw
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean)
    .flatMap(line => {
      const parts = line.split(',').map(p => p.trim())
      if (parts.length < 4) return []
      const dateStr    = parts[0]                              // "06 Dec 2026"
      const timeStr    = parts[1]                              // "19:30"
      const city       = parts[parts.length - 1]              // last field
      const venue_name = parts.slice(2, -1).join(', ')        // everything between time and city
      if (!venue_name || !city) return []
      const [day, mon, year] = dateStr.split(' ')
      const month = MONTHS[mon]
      if (!month || !day || !year) return []
      const date = `${year}-${month}-${day.padStart(2, '0')}T${timeStr}:00.000Z`
      return [{ date, venue_name, city }]
    })
}

export async function createArtistAction(formData: FormData) {
  await checkAuth()
  const db = createAdminClient()

  const name            = (formData.get('name') as string).trim()
  const slug            = ((formData.get('slug') as string) || slugify(name)).trim()
  const image_url       = (formData.get('image_url')       as string) || null
  const description     = (formData.get('description')     as string) || null
  const tour_name       = (formData.get('tour_name')       as string) || null
  const onsale_str      = formData.get('onsale_date') as string
  const onsale_date     = onsale_str ? new Date(onsale_str).toISOString() : null
  const is_featured     = formData.get('is_featured')     === 'on'
  const featured_onsale = formData.get('featured_onsale') === 'on'

  // Ticket URLs — only include if non-empty so missing columns don't cause errors
  const str = (key: string) => (formData.get(key) as string) || null
  const urlFields: Record<string, string | null> = {}
  for (const key of [
    'tickets_url', 'see_tickets_url', 'eventim_url', 'axs_url', 'gigantic_url',
    'gigsberg_url', 'viagogo_url', 'stubhub_url', 'vivid_seats_url',
  ]) {
    const v = str(key)
    if (v) urlFields[key] = v
  }

  const { data: artist, error } = await db
    .from('artists')
    .insert({ name, slug, image_url, description, tour_name, onsale_date, is_featured, featured_onsale, ...urlFields })
    .select('id, slug')
    .single()

  if (error) throw new Error(error.message)

  // Create tour and dates if tour_name provided
  if (tour_name) {
    const { data: tour } = await db
      .from('tours')
      .insert({ artist_id: artist.id, tour_name, onsale_date })
      .select('id')
      .single()

    if (tour) {
      const mode = (formData.get('dates_mode') as string) || 'bulk'
      let rows: { tour_id: string; date: string; venue_name: string; city: string }[] = []

      if (mode === 'bulk') {
        const raw = (formData.get('dates_bulk') as string) || ''
        rows = parseBulkDates(raw).map(r => ({ ...r, tour_id: tour.id }))
      } else {
        const count = parseInt(formData.get('tour_date_count') as string) || 0
        for (let i = 0; i < count; i++) {
          const dateStr = formData.get(`tour_date_${i}_date`)  as string
          const timeStr = (formData.get(`tour_date_${i}_time`) as string) || '19:30'
          const venue   = ((formData.get(`tour_date_${i}_venue`) as string) || '').trim()
          const city    = ((formData.get(`tour_date_${i}_city`)  as string) || '').trim()
          if (dateStr && venue && city) {
            rows.push({
              tour_id: tour.id,
              date: new Date(`${dateStr}T${timeStr}:00`).toISOString(),
              venue_name: venue,
              city,
            })
          }
        }
      }

      if (rows.length) await db.from('tour_dates').insert(rows)
    }
  }

  revalidatePath('/admin')
  revalidatePath('/')
  revalidatePath('/on-sale-this-week')
  revalidatePath('/artists/' + slug)
  redirect('/admin/artists/' + slug + '?created=1')
}

export async function updateArtistAction(id: string, formData: FormData) {
  await checkAuth()
  const db = createAdminClient()

  const name        = (formData.get('name') as string).trim()
  const slug        = ((formData.get('slug') as string) || slugify(name)).trim()
  const image_url   = (formData.get('image_url') as string) || null
  const description = (formData.get('description') as string) || null
  const tour_name   = (formData.get('tour_name') as string) || null
  const onsale_str  = formData.get('onsale_date') as string
  const onsale_date = onsale_str ? new Date(onsale_str).toISOString() : null
  const tickets_url = (formData.get('tickets_url') as string) || null
  const is_featured = formData.get('is_featured') === 'on'

  const { error } = await db
    .from('artists')
    .update({ name, slug, image_url, description, tour_name, onsale_date, tickets_url, is_featured })
    .eq('id', id)

  if (error) throw new Error(error.message)

  // Upsert the tour record (update most-recent tour, or create one)
  if (tour_name) {
    const { data: existing } = await db.from('tours').select('id').eq('artist_id', id).order('created_at', { ascending: false }).limit(1).maybeSingle()
    if (existing) {
      await db.from('tours').update({ tour_name, onsale_date }).eq('id', existing.id)
    } else {
      await db.from('tours').insert({ artist_id: id, tour_name, onsale_date })
    }
  }

  revalidatePath('/admin')
  revalidatePath('/admin/artists/' + slug)
  revalidatePath('/artists/' + slug)
  redirect('/admin/artists/' + slug + '?saved=1')
}

export async function toggleFeaturedAction(id: string, is_featured: boolean) {
  await checkAuth()
  const db = createAdminClient()
  await db.from('artists').update({ is_featured }).eq('id', id)
  revalidatePath('/admin')
  revalidatePath('/')
}

export async function toggleFeaturedOnsaleAction(id: string, featured_onsale: boolean) {
  await checkAuth()
  const db = createAdminClient()
  await db.from('artists').update({ featured_onsale }).eq('id', id)
  revalidatePath('/admin')
  revalidatePath('/')
  revalidatePath('/on-sale-this-week')
}

// ── Tour dates ────────────────────────────────────────────────────────────────

export async function addTourDateAction(tourId: string, artistSlug: string, formData: FormData) {
  await checkAuth()
  const db = createAdminClient()

  const dateStr    = formData.get('date') as string
  const timeStr    = formData.get('time') as string
  const venue_name = (formData.get('venue_name') as string).trim()
  const city       = (formData.get('city') as string).trim()
  const date       = new Date(`${dateStr}T${timeStr || '19:00'}:00`).toISOString()

  await db.from('tour_dates').insert({ tour_id: tourId, date, venue_name, city })

  revalidatePath('/admin/artists/' + artistSlug)
  revalidatePath('/artists/' + artistSlug)
}

export async function deleteTourDateAction(id: string, artistSlug: string) {
  await checkAuth()
  const db = createAdminClient()
  await db.from('tour_dates').delete().eq('id', id)
  revalidatePath('/admin/artists/' + artistSlug)
  revalidatePath('/artists/' + artistSlug)
}

// ── Events ───────────────────────────────────────────────────────────────────

export async function updateEventOwnTicketUrlAction(id: string, slug: string, formData: FormData) {
  await checkAuth()
  const db = createAdminClient()

  const own_ticket_url = ((formData.get('own_ticket_url') as string) || '').trim() || null

  const { error } = await db
    .from('events')
    .update({ own_ticket_url })
    .eq('id', id)

  if (error) throw new Error(error.message)

  revalidatePath('/admin/events')
  revalidatePath('/admin/events/' + slug)
  revalidatePath('/events/' + slug)
  redirect('/admin/events/' + slug + '?saved=1')
}

// Local events (markets, art fairs, community events) — hand-curated, not
// synced from Ticketmaster. Finds-or-creates a venue for the location typed
// in, then creates the event with category 'local'.
export async function createLocalEventAction(formData: FormData) {
  await checkAuth()
  const db = createAdminClient()

  const title       = (formData.get('title')       as string).trim()
  const city        = (formData.get('city')        as string).trim()
  const venue_name  = (formData.get('venue_name')  as string).trim()
  const address     = ((formData.get('address')  as string) || '').trim() || `${venue_name}, ${city}`
  const postcode    = ((formData.get('postcode') as string) || '').trim()
  const dateStr     = formData.get('date') as string
  const timeStr     = (formData.get('time') as string) || '10:00'
  const description = ((formData.get('description') as string) || '').trim() || null
  const info_url    = ((formData.get('info_url')     as string) || '').trim() || null
  const is_free     = formData.get('is_free') === 'on'

  const start_date = new Date(`${dateStr}T${timeStr}:00`).toISOString()

  // Find-or-create the venue (slugged per-city so the same location name in
  // two different cities doesn't collide).
  const venueSlug = slugify(`${venue_name}-${city}`)
  const { data: existingVenue } = await db
    .from('venues')
    .select('id')
    .eq('slug', venueSlug)
    .maybeSingle()

  let venueId = existingVenue?.id as string | undefined

  if (!venueId) {
    const { data: newVenue, error: venueError } = await db
      .from('venues')
      .insert({ name: venue_name, slug: venueSlug, address, city, postcode, country: 'GB' })
      .select('id')
      .single()
    if (venueError) throw new Error(venueError.message)
    venueId = newVenue.id
  }

  // Unique event slug — markets recur weekly, so fold the date in and fall
  // back to a numbered suffix on the rare collision.
  const baseSlug = slugify(`${title}-${dateStr}`)
  let eventSlug = baseSlug
  for (let i = 2; i < 10; i++) {
    const { data: clash } = await db.from('events').select('id').eq('slug', eventSlug).maybeSingle()
    if (!clash) break
    eventSlug = `${baseSlug}-${i}`
  }

  const { error } = await db.from('events').insert({
    title,
    slug: eventSlug,
    description: is_free ? [description, 'Free entry.'].filter(Boolean).join(' ') : description,
    category: 'local',
    venue_id: venueId,
    start_date,
    currency: 'GBP',
    own_ticket_url: info_url,
    status: 'upcoming',
  })

  if (error) throw new Error(error.message)

  revalidatePath('/admin/events')
  revalidatePath('/events')
  revalidatePath('/cities/' + encodeURIComponent(city))
  revalidatePath('/')
  redirect('/admin/events?created=1')
}

// ── Local businesses ─────────────────────────────────────────────────────────

export async function createLocalBusinessAction(formData: FormData) {
  await checkAuth()
  const db = createAdminClient()

  const city            = (formData.get('city') as string).trim()
  const name             = (formData.get('name') as string).trim()
  const category         = formData.get('category') as string
  const description      = ((formData.get('description') as string) || '').trim() || null
  const website_url      = ((formData.get('website_url') as string) || '').trim() || null
  const is_sponsored     = formData.get('is_sponsored') === 'on'
  const is_lusso_client  = formData.get('is_lusso_client') === 'on'
  const display_order    = parseInt(formData.get('display_order') as string) || 0

  const { error } = await db.from('local_businesses').insert({
    city, name, category, description, website_url, is_sponsored, is_lusso_client, display_order,
  })

  if (error) throw new Error(error.message)

  revalidatePath('/admin/local-businesses')
  revalidatePath('/cities/' + encodeURIComponent(city))
  redirect('/admin/local-businesses?created=1')
}

export async function deleteLocalBusinessAction(id: string, city: string) {
  await checkAuth()
  const db = createAdminClient()
  await db.from('local_businesses').delete().eq('id', id)
  revalidatePath('/admin/local-businesses')
  revalidatePath('/cities/' + encodeURIComponent(city))
}
// ── News candidates (News Intelligence Inbox) ───────────────────────────────
// Phase 1: manual editorial queue for presale/tour-announcement/ticket news
// the RSS pipeline (src/lib/cityNews.ts) hasn't picked up yet, single-city
// targeting, no unpublish. Phase 2 (this section, see
// supabase/migration_027_news_candidate_multi_city_provenance.sql): a
// candidate can target more than one city, a canonicalized-URL duplicate
// check runs before every save (against both other candidates and
// already-published city_news rows, RSS or editorial), and created_by/
// reviewed_by are recorded — currently always the literal 'admin', since
// this site has one shared admin password and no per-person login (see
// src/lib/admin-auth.ts). No AI classification or automated source
// monitoring here either — still explicitly out of scope.

const ADMIN_IDENTITY = 'admin'

function isValidHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

// city_name values here are strictly whatever the client sent — validate
// against the real 36-city list before trusting any of it (the <select>
// in NewsCandidateForm already constrains this in the browser, but a
// server action must never trust the browser alone).
function isSupportedCityName(name: string): boolean {
  return CITIES.some(c => c.name === name)
}

interface ParsedNewsCandidateForm {
  scope_type: 'national' | 'city'
  city_slug: string | null
  city_name: string | null
  cityTargets: CandidateCityTarget[]
  publish_to_homepage: boolean
  publish_to_news_page: boolean
  headline: string
  source: string | null
  source_url: string | null
  url: string
  published_at: string | null
  story_type: NewsStoryType
  artist_name: string | null
  artist_id: string | null
  summary: string | null
  editorial_note: string | null
  priority: NewsPriority
  review_status: NewsReviewStatus
}

function parseNewsCandidateForm(formData: FormData): ParsedNewsCandidateForm {
  const scope_type   = (formData.get('scope_type') as string) === 'city' ? 'city' : 'national'

  // Multi-select — NewsCandidateForm submits one 'city_names' entry per
  // selected city. Order is preserved so the first selection can serve as
  // the "primary" city for the legacy single-city columns.
  const rawCityNames = formData.getAll('city_names').map(v => String(v).trim()).filter(Boolean)
  const cityNames = [...new Set(rawCityNames)]

  const headline        = ((formData.get('headline') as string) || '').trim()
  const source           = ((formData.get('source') as string) || '').trim() || null
  const source_url         = ((formData.get('source_url') as string) || '').trim() || null
  const rawUrl               = ((formData.get('url') as string) || '').trim()
  const publishedStr           = (formData.get('published_at') as string) || ''
  const published_at            = publishedStr ? new Date(publishedStr).toISOString() : null
  const story_type                = ((formData.get('story_type') as string) || 'general_entertainment') as NewsStoryType
  const artist_name                 = ((formData.get('artist_name') as string) || '').trim() || null
  const artist_id                    = ((formData.get('artist_id') as string) || '').trim() || null
  const summary                       = ((formData.get('summary') as string) || '').trim() || null
  const editorial_note                  = ((formData.get('editorial_note') as string) || '').trim() || null
  const priority                         = ((formData.get('priority') as string) || 'normal') as NewsPriority
  const requestedStatus                     = ((formData.get('review_status') as string) || 'pending') as NewsReviewStatus

  // Publishing destinations (migration_029) — independent of scope_type/
  // cities. Plain HTML checkboxes only submit a value when checked, so
  // absence from the FormData means false, not "unspecified".
  const publish_to_homepage  = formData.get('publish_to_homepage') === 'on'
  const publish_to_news_page = formData.get('publish_to_news_page') === 'on'

  if (!headline) throw new Error('Headline is required.')
  if (!rawUrl) throw new Error('Article URL is required.')
  if (!isValidHttpUrl(rawUrl)) throw new Error('Enter a valid http(s) article URL.')
  if (source_url && !isValidHttpUrl(source_url)) throw new Error('Enter a valid http(s) source URL, or leave it blank.')
  if (scope_type === 'city' && cityNames.length === 0) throw new Error('Select at least one city for a city-scoped story.')

  for (const name of cityNames) {
    if (!isSupportedCityName(name)) throw new Error(`"${name}" isn't one of TheShowFinder's supported cities.`)
  }

  const url = normalizeUrl(rawUrl)
  const cityTargets: CandidateCityTarget[] = scope_type === 'city'
    ? cityNames.map(name => ({ city_slug: citySlug(name), city_name: name }))
    : []

  // 'published' is only ever reached through publishNewsCandidateAction,
  // which is the one place that also writes the city_news row(s) — never
  // let the plain edit form set it directly, or the two would drift out
  // of sync.
  const review_status = requestedStatus === 'published' ? 'pending' : requestedStatus

  return {
    scope_type,
    // Legacy single-city columns: kept as the "primary" (first-selected)
    // city for simple display (the admin list table's Scope/City column)
    // and backward compatibility. The real target list — what publish/
    // unpublish actually use — is cityTargets, persisted to
    // news_candidate_cities below.
    city_slug: cityTargets[0]?.city_slug ?? null,
    city_name: cityTargets[0]?.city_name ?? null,
    cityTargets,
    publish_to_homepage,
    publish_to_news_page,
    headline,
    source,
    source_url,
    url,
    published_at,
    story_type,
    artist_name,
    artist_id,
    summary,
    editorial_note,
    priority,
    review_status,
  }
}

function newsCandidateDbError(error: { code?: string; message: string }): Error {
  if (error.code === '23505') return new Error('A candidate with this URL has already been added.')
  return new Error(error.message)
}

// Proactive duplicate check, run before every insert/update — catches the
// same collision the DB's UNIQUE(url) constraint would (a second
// candidate with the same URL), plus one the constraint can't see at all
// (the URL is already live in city_news, RSS-sourced or a previously
// published candidate). `excludeCandidateId` is the row being edited, so
// saving a candidate's other fields doesn't trip over itself.
async function checkForDuplicateUrl(
  db: ReturnType<typeof createAdminClient>,
  url: string,
  excludeCandidateId: string | null
) {
  let candidateQuery = db.from('news_candidates').select('id, headline').eq('url', url).limit(1)
  if (excludeCandidateId) candidateQuery = candidateQuery.neq('id', excludeCandidateId)
  const [{ data: candidateMatches }, { data: cityNewsMatches }] = await Promise.all([
    candidateQuery,
    db.from('city_news').select('headline, city_name').eq('url', url).limit(1),
  ])

  const duplicate = describeDuplicateUrl(
    (candidateMatches?.[0] as { headline: string } | undefined) ?? null,
    (cityNewsMatches?.[0] as { headline: string; city_name: string } | undefined) ?? null
  )
  if (!duplicate) return

  if (duplicate.source === 'candidate') {
    throw new Error(`This URL is already queued as a candidate: "${duplicate.headline}".`)
  }
  throw new Error(`This URL is already live on the site${duplicate.cityName ? ` (${duplicate.cityName})` : ''}: "${duplicate.headline}".`)
}

// Replaces this candidate's full set of target-city rows to match
// cityTargets — delete-then-insert rather than a diff, since the set is
// always small (a handful of cities at most) and this only runs on an
// explicit admin save, not on any hot path.
async function syncNewsCandidateCities(
  db: ReturnType<typeof createAdminClient>,
  candidateId: string,
  cityTargets: CandidateCityTarget[]
) {
  const { error: deleteError } = await db.from('news_candidate_cities').delete().eq('candidate_id', candidateId)
  if (deleteError) throw new Error(deleteError.message)

  if (!cityTargets.length) return

  const { error: insertError } = await db.from('news_candidate_cities').insert(
    cityTargets.map(t => ({ candidate_id: candidateId, city_slug: t.city_slug, city_name: t.city_name }))
  )
  if (insertError) throw new Error(insertError.message)
}

// Validation/duplicate errors redirect back to the form with a message in
// the query string (the same pattern this page already uses for the
// created=1/saved=1 success banners) rather than throwing into Next.js's
// generic error boundary — that's what makes requirement 2's "show a
// clear message when a duplicate is found" actually show up as a message
// instead of a crash screen. Known limitation: because this is a redirect
// to a fresh page load, whatever the admin had typed is lost on error —
// only the URL (which the error is usually about) survives, echoed back
// via ?url= so the form pre-fills at least that field.
export async function createNewsCandidateAction(formData: FormData) {
  await checkAuth()
  const db = createAdminClient()

  let cityTargets: CandidateCityTarget[]
  let fields: Omit<ParsedNewsCandidateForm, 'cityTargets'>
  try {
    ;({ cityTargets, ...fields } = parseNewsCandidateForm(formData))
    await checkForDuplicateUrl(db, fields.url, null)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Something went wrong.'
    const url = (formData.get('url') as string) || ''
    redirect('/admin/news/new?error=' + encodeURIComponent(message) + (url ? '&url=' + encodeURIComponent(url) : ''))
  }

  const { data, error } = await db
    .from('news_candidates')
    .insert({ ...fields, created_by: ADMIN_IDENTITY })
    .select('id')
    .single()
  if (error) redirect('/admin/news/new?error=' + encodeURIComponent(newsCandidateDbError(error).message))

  await syncNewsCandidateCities(db, data.id, cityTargets)

  revalidatePath('/admin/news')
  redirect('/admin/news/' + data.id + '?created=1')
}

// ── News candidates: AI-assisted URL intake (Phase 3) ───────────────────────
// Paste-a-URL alternative to the manual form above. Fetches the page
// server-side (SSRF-guarded — see src/lib/urlIntake.ts), extracts basic
// metadata, runs the exact same duplicate check as the manual flow
// (checkForDuplicateUrl, reused unchanged), asks Claude for a structured
// editorial suggestion (src/lib/newsAiSuggestions.ts — degrades gracefully
// to no suggestion if ANTHROPIC_API_KEY isn't set or the call fails), and
// inserts a normal 'pending' news_candidates row pre-filled with the
// suggestion as an editable draft. From this point on it's a completely
// ordinary candidate — the exact same approve/reject/publish/unpublish/
// republish actions below apply to it unchanged, and it renders through
// the exact same NewsCandidateForm as a manually-entered one. The only
// permanent difference is intake_method='url_import' plus the read-only
// extracted_content/ai_suggestions reference data shown on the detail page.
export async function createNewsCandidateFromUrlAction(formData: FormData) {
  await checkAuth()
  const db = createAdminClient()

  const rawUrl = ((formData.get('url') as string) || '').trim()

  if (!rawUrl) {
    redirect('/admin/news/from-url?error=' + encodeURIComponent('Paste an article URL first.'))
  }
  if (!isValidHttpUrl(rawUrl)) {
    redirect('/admin/news/from-url?error=' + encodeURIComponent('Enter a valid http(s) URL.') + '&url=' + encodeURIComponent(rawUrl))
  }

  const url = normalizeUrl(rawUrl)

  try {
    await checkForDuplicateUrl(db, url, null)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Something went wrong.'
    redirect('/admin/news/from-url?error=' + encodeURIComponent(message) + '&url=' + encodeURIComponent(rawUrl))
  }

  let html: string
  let finalUrl: string
  try {
    const fetched = await fetchArticleHtml(rawUrl)
    html = fetched.html
    finalUrl = fetched.finalUrl
  } catch (err) {
    const message =
      err instanceof UnsafeUrlError || err instanceof FetchArticleError
        ? err.message
        : 'Could not fetch that page.'
    redirect('/admin/news/from-url?error=' + encodeURIComponent(message) + '&url=' + encodeURIComponent(rawUrl))
  }

  const extracted = extractArticleMetadata(html!, finalUrl!)

  // A second duplicate check against the final (post-redirect) URL — the
  // admin-typed URL and the page's real URL can differ (a shortlink, a
  // tracking redirect); both are worth catching before we insert anything.
  const normalizedFinalUrl = normalizeUrl(finalUrl!)
  if (normalizedFinalUrl !== url) {
    try {
      await checkForDuplicateUrl(db, normalizedFinalUrl, null)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Something went wrong.'
      redirect('/admin/news/from-url?error=' + encodeURIComponent(message) + '&url=' + encodeURIComponent(rawUrl))
    }
  }

  const { suggestion, warnings, model } = await requestAiSuggestions(extracted)

  const cityTargets: CandidateCityTarget[] = suggestion.scope_type === 'city'
    ? suggestion.cities.map(name => ({ city_slug: citySlug(name), city_name: name }))
    : []

  const headline = suggestion.headline || extracted.headline || extracted.title || 'Untitled — needs a headline'

  const { data, error } = await db
    .from('news_candidates')
    .insert({
      scope_type: suggestion.scope_type,
      city_slug: cityTargets[0]?.city_slug ?? null,
      city_name: cityTargets[0]?.city_name ?? null,
      // Destinations (migration_029) always start unset for a URL-imported
      // candidate — Homepage/Main News page are an explicit editorial
      // decision, never inferred from the AI's scope/city suggestion. The
      // admin opts in via the two new checkboxes when reviewing/editing.
      publish_to_homepage: false,
      publish_to_news_page: false,
      headline,
      source: extracted.sourceDomain,
      source_url: `https://${extracted.sourceDomain}`,
      url: normalizedFinalUrl,
      published_at: suggestion.suggested_published_at ?? extracted.publishedAt ?? null,
      story_type: suggestion.category,
      summary: suggestion.summary ?? extracted.description ?? null,
      priority: suggestion.priority,
      review_status: 'pending', // always — requirement 7/8: never auto-published, whatever the AI's confidence
      created_by: ADMIN_IDENTITY,
      intake_method: 'url_import',
      extracted_content: extracted,
      ai_suggestions: { ...suggestion, warnings },
      ai_model: model,
      ai_generated_at: model ? new Date().toISOString() : null,
      ai_review_status: model ? 'unreviewed' : 'not_applicable',
    })
    .select('id')
    .single()

  if (error) redirect('/admin/news/from-url?error=' + encodeURIComponent(newsCandidateDbError(error).message) + '&url=' + encodeURIComponent(rawUrl))

  await syncNewsCandidateCities(db, data.id, cityTargets)

  revalidatePath('/admin/news')
  redirect('/admin/news/' + data.id + '?created=1')
}

export async function updateNewsCandidateAction(id: string, formData: FormData) {
  await checkAuth()
  const db = createAdminClient()

  let cityTargets: CandidateCityTarget[]
  let fields: Omit<ParsedNewsCandidateForm, 'cityTargets'>
  try {
    ;({ cityTargets, ...fields } = parseNewsCandidateForm(formData))
    await checkForDuplicateUrl(db, fields.url, id)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Something went wrong.'
    redirect('/admin/news/' + id + '?error=' + encodeURIComponent(message))
  }

  // A URL-imported candidate's AI suggestion starts 'unreviewed' — the
  // admin editing and saving the candidate at all (whether or not they
  // changed anything AI-suggested) is treated as having reviewed it. Manual
  // candidates are always 'not_applicable' already and this is a no-op for
  // them.
  const { data: existing } = await db.from('news_candidates').select('ai_review_status').eq('id', id).maybeSingle()
  const aiReviewPatch = existing?.ai_review_status === 'unreviewed' ? { ai_review_status: 'reviewed' as const } : {}

  const { error } = await db
    .from('news_candidates')
    .update({ ...fields, ...aiReviewPatch, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) redirect('/admin/news/' + id + '?error=' + encodeURIComponent(newsCandidateDbError(error).message))

  await syncNewsCandidateCities(db, id, cityTargets)

  revalidatePath('/admin/news')
  revalidatePath('/admin/news/' + id)
  redirect('/admin/news/' + id + '?saved=1')
}

async function setNewsCandidateReviewStatus(id: string, review_status: NewsReviewStatus, extra: Record<string, unknown> = {}) {
  const db = createAdminClient()
  const { error } = await db
    .from('news_candidates')
    .update({ review_status, updated_at: new Date().toISOString(), ...extra })
    .eq('id', id)
  if (error) throw new Error(error.message)
}

export async function approveNewsCandidateAction(id: string) {
  await checkAuth()
  await setNewsCandidateReviewStatus(id, 'approved', { reviewed_at: new Date().toISOString(), reviewed_by: ADMIN_IDENTITY })
  revalidatePath('/admin/news')
  revalidatePath('/admin/news/' + id)
}

export async function rejectNewsCandidateAction(id: string) {
  await checkAuth()
  await setNewsCandidateReviewStatus(id, 'rejected', { reviewed_at: new Date().toISOString(), reviewed_by: ADMIN_IDENTITY })
  revalidatePath('/admin/news')
  revalidatePath('/admin/news/' + id)
}

// Sends a reviewed (approved/rejected/published) candidate back to
// pending — this does NOT retract an already-published city_news row;
// use Unpublish for that. Clears reviewed_at/reviewed_by too: reopening
// means the review no longer stands.
export async function reopenNewsCandidateAction(id: string) {
  await checkAuth()
  await setNewsCandidateReviewStatus(id, 'pending', { reviewed_at: null, reviewed_by: null })
  revalidatePath('/admin/news')
  revalidatePath('/admin/news/' + id)
}

// Fetches the candidate plus its full target-city list (news_candidate_cities)
// together — every publish/unpublish action needs both.
async function fetchCandidateWithCities(db: ReturnType<typeof createAdminClient>, id: string) {
  const [{ data: candidate, error: fetchError }, { data: cityRows }] = await Promise.all([
    db.from('news_candidates').select('*').eq('id', id).single(),
    db.from('news_candidate_cities').select('city_slug, city_name').eq('candidate_id', id),
  ])
  if (fetchError || !candidate) throw new Error(fetchError?.message || 'Candidate not found.')
  return { candidate, cityTargets: (cityRows ?? []) as CandidateCityTarget[] }
}

// Creates a Draft Social Pack for a just-published candidate, only when
// it targets at least one city (isEligibleForAutoSocialPack) — a
// national-only story has no single city for the pack's "city name"
// field, so it's left out rather than guessing one. Uses the city page
// itself as the destination (TheShowFinder's own property, not the
// external source article) so tracked clicks actually land back on the
// site. `ignoreDuplicates: true` on the upsert is what makes this safe
// to call on every publish/re-publish without ever overwriting an
// admin's own edits to a pack that already exists for this candidate.
async function findOrCreateSocialPackForCandidate(
  db: ReturnType<typeof createAdminClient>,
  candidate: { id: string; headline: string; summary: string | null },
  cityTargets: CandidateCityTarget[],
): Promise<void> {
  const cityNames = cityTargets.map(t => t.city_name)
  if (!isEligibleForAutoSocialPack(cityNames)) return

  const cityName = cityNames[0]
  const draft = buildSocialPackDraft({
    sourceType: 'news_candidate',
    sourceId: candidate.id,
    cityName,
    headline: candidate.headline,
    context: resolveNewsCandidateContext(candidate),
    destinationPath: `/cities/${encodeURIComponent(cityName)}`,
    hashtagSeed: cityNames,
  })

  const { error } = await db
    .from('social_packs')
    .upsert(draft, { onConflict: 'source_type,source_id', ignoreDuplicates: true })
  if (error) throw new Error(error.message)
}

// Publishes an approved candidate into the existing city_news table — one
// row per target city (or the single national row) — so it renders
// through the exact same public card design as an RSS story, no second
// news system. Idempotent: publishing an already-published candidate
// re-upserts the same city_news row(s) (on the city_slug+url unique
// constraint from migration_021_city_news.sql) instead of erroring or
// duplicating them. See src/lib/newsPublishing.ts for the pure row-shape/
// state-transition logic this calls into (also covered by
// src/lib/newsPublishing.test.ts).
export async function publishNewsCandidateAction(id: string) {
  await checkAuth()
  const db = createAdminClient()

  try {
    const { candidate, cityTargets } = await fetchCandidateWithCities(db, id)

    if (!canPublishCandidate(candidate.review_status)) {
      throw new Error('Only an approved candidate can be published — approve it first.')
    }

    // Blocks a leftover seed/test row (e.g. "Showfinder Phase 1 Test —
    // Do Not Share") from ever actually going public, regardless of its
    // review_status — see isBlockedTestContent's own comment.
    if (isBlockedTestContent(candidate.headline)) {
      throw new Error('This candidate\u2019s headline marks it as internal/test content ("Do Not Share"/"Do Not Publish") and has been blocked from publishing. Rename it first if this is genuine editorial content.')
    }

    const targets = resolveCityNewsTargets(candidate, cityTargets)
    // migration_029 safeguard: a candidate with no Homepage, no Main News
    // page and no city targets would upsert zero city_news rows — i.e.
    // "publish" successfully while appearing nowhere on the public site.
    // Blocked here with a clear, redirect-based message (matching the
    // create/update error pattern below) rather than letting it either
    // silently no-op or throw into Next's generic crash screen. Saving a
    // candidate with no destinations selected is still always allowed —
    // this check only ever runs at the point of publishing.
    if (!targets.length) {
      throw new Error('This candidate has no publishing destination selected — it won’t appear anywhere on the site. Choose Homepage, Main News page, or at least one city before publishing.')
    }

    const now = new Date().toISOString()
    const upsertRows = buildPublishUpsertRows(candidate, targets, now)

    const { error: upsertError } = await db
      .from('city_news')
      .upsert(upsertRows, { onConflict: 'city_slug,url' })
    if (upsertError) throw new Error(upsertError.message)

    const { error: updateError } = await db
      .from('news_candidates')
      .update(buildPublishCandidatePatch(now))
      .eq('id', id)
    if (updateError) throw new Error(updateError.message)

    // Social Pack (Phase 7) — best-effort, never fatal to the publish
    // itself: a city-targeted story gets a Draft-status pack prepared for
    // manual review, exactly the "connect approved content to a manual-
    // review Social Pack" requirement. Idempotent via the
    // (source_type, source_id) unique constraint — re-publishing never
    // creates a second pack or overwrites an admin's edits to an
    // existing one.
    try {
      await findOrCreateSocialPackForCandidate(db, candidate, targets)
    } catch (err) {
      console.error('[social-pack] auto-create on publish failed (non-fatal):', err)
    }

    revalidatePath('/admin/news')
    revalidatePath('/admin/news/' + id)
    for (const path of revalidatePathsForCandidate(candidate, targets)) revalidatePath(path)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Something went wrong while publishing.'
    redirect('/admin/news/' + id + '?error=' + encodeURIComponent(message))
  }

  // A distinct query param from plain '?saved=1' (used by update/unpublish)
  // so the candidate page can show a specific "live at: ..." confirmation
  // rather than the generic "saved" banner — requirement 4's "show the
  // resulting live URLs after publication".
  redirect('/admin/news/' + id + '?published=1')
}

// Removes every city_news row a published candidate created (one per
// target city), without touching the candidate itself or any RSS/other-
// editorial row (the delete filter includes is_editorial: true — see
// buildUnpublishDeleteFilter). Idempotent: rows already gone simply don't
// match — zero deleted is success, not an error. Returns the candidate to
// 'approved' (its state before it went live) and clears publish-specific
// metadata; it does not touch reviewed_at/reviewed_by, since the review
// itself still stands.
export async function unpublishNewsCandidateAction(id: string) {
  await checkAuth()
  const db = createAdminClient()

  try {
    const { candidate, cityTargets } = await fetchCandidateWithCities(db, id)

    if (!canUnpublishCandidate(candidate.review_status)) {
      throw new Error('This candidate isn\'t currently published.')
    }

    const targets = resolveCityNewsTargets(candidate, cityTargets)
    const deleteFilter = buildUnpublishDeleteFilter(candidate, targets)
    if (!deleteFilter) throw new Error('Candidate has no publishing destination recorded — nothing to unpublish.')

    const { error: deleteError } = await db
      .from('city_news')
      .delete()
      .in('city_slug', deleteFilter.city_slugs)
      .eq('url', deleteFilter.url)
      .eq('is_editorial', deleteFilter.is_editorial)
    if (deleteError) throw new Error(deleteError.message)

    const now = new Date().toISOString()
    const { error: updateError } = await db
      .from('news_candidates')
      .update(buildUnpublishCandidatePatch(now))
      .eq('id', id)
    if (updateError) throw new Error(updateError.message)

    revalidatePath('/admin/news')
    revalidatePath('/admin/news/' + id)
    for (const path of revalidatePathsForCandidate(candidate, targets)) revalidatePath(path)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Something went wrong while unpublishing.'
    redirect('/admin/news/' + id + '?error=' + encodeURIComponent(message))
  }

  redirect('/admin/news/' + id + '?saved=1')
}

// Delete stays in the queue only — a published candidate already has
// standalone city_news row(s) (see publishNewsCandidateAction), so
// deleting the candidate here would silently orphan the audit trail
// without removing anything public. Reopen it first if it genuinely needs
// removing. news_candidate_cities rows are cleaned up automatically (ON
// DELETE CASCADE, see migration_027).
export async function deleteNewsCandidateAction(id: string) {
  await checkAuth()
  const db = createAdminClient()

  const { data: candidate } = await db
    .from('news_candidates')
    .select('review_status')
    .eq('id', id)
    .maybeSingle()

  if (candidate?.review_status === 'published') {
    throw new Error('This candidate has already been published — reopen it first if you want to delete it.')
  }

  const { error } = await db.from('news_candidates').delete().eq('id', id)
  if (error) throw new Error(error.message)

  revalidatePath('/admin/news')
  redirect('/admin/news?deleted=1')
}

// ── Social Pack (Phase 7) ───────────────────────────────────────────────────
//
// Manual-review only, same as everywhere else in this file calling
// buildSocialPackDraft: nothing here posts to Facebook/Instagram/TikTok,
// and a fresh pack always starts at status 'draft' (see socialPack.ts's
// own comment on buildSocialPackDraft for why that's structurally
// guaranteed, not just a convention).

interface SocialPackEventRow {
  id: string; title: string; slug: string; start_date: string
  venue: { name: string; city: string } | null
}

// The manual trigger for "an important Manchester event update" — there's
// no reliable automatic signal for "important" in the data (see the
// Phase 7 pre-coding report), so this is a judgement call an admin makes
// on a specific event, from its own admin page, rather than a fabricated
// significance score.
export async function createSocialPackForEventAction(eventId: string) {
  await checkAuth()
  const db = createAdminClient()

  // redirect() throws internally (a NEXT_REDIRECT control-flow signal) —
  // it must never be called from inside this try block, or the catch
  // below would swallow it and misreport it as a generic failure. So the
  // success path only computes the pack id here and redirects after the
  // try/catch, matching publishNewsCandidateAction's own structure.
  let packId: string
  try {
    const { data: event, error: fetchError } = await db
      .from('events')
      .select('id, title, slug, start_date, venue:venues(name, city)')
      .eq('id', eventId)
      .single() as unknown as { data: SocialPackEventRow | null; error: { message: string } | null }

    if (fetchError || !event) throw new Error(fetchError?.message || 'Event not found.')
    if (!event.venue) throw new Error('This event has no venue on record — cannot build a Social Pack without one.')

    const cityName = event.venue.city
    const dateLabel = new Date(event.start_date).toLocaleDateString('en-GB', {
      timeZone: 'Europe/London', day: 'numeric', month: 'long', year: 'numeric',
    })

    const draft = buildSocialPackDraft({
      sourceType: 'event',
      sourceId: event.id,
      cityName,
      headline: event.title,
      context: buildEventContext({ title: event.title, venueName: event.venue.name, startDateLabel: dateLabel }),
      destinationPath: `/events/${event.slug}`,
      hashtagSeed: [cityName, event.title],
      imageDateLabel: dateLabel,
    })

    const { data: pack, error: upsertError } = await db
      .from('social_packs')
      .upsert(draft, { onConflict: 'source_type,source_id', ignoreDuplicates: false })
      .select('id')
      .single()
    if (upsertError) throw new Error(upsertError.message)

    revalidatePath('/admin/social')
    packId = pack.id
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Something went wrong while preparing the Social Pack.'
    redirect('/admin/events/' + eventId + '?error=' + encodeURIComponent(message))
  }

  redirect('/admin/social/' + packId)
}

// Edits the three platform drafts, hashtags and headline/context by hand
// before approval — the same "editable text before approval" requirement
// the existing Share Kit already meets for news copy, just persisted
// this time. Links/UTM parameters are not editable here (they're derived
// from the source and destination, not free text) — regenerate the pack
// instead if the destination genuinely needs to change.
export async function updateSocialPackAction(id: string, formData: FormData) {
  await checkAuth()
  const db = createAdminClient()

  const headline = (formData.get('headline') as string)?.trim()
  const context = (formData.get('context') as string)?.trim()
  const facebookText = (formData.get('facebook_text') as string) ?? ''
  const instagramText = (formData.get('instagram_text') as string) ?? ''
  const tiktokText = (formData.get('tiktok_text') as string) ?? ''
  const hashtagsRaw = (formData.get('hashtags') as string) ?? ''
  const hashtags = hashtagsRaw.split(/\s+/).map(h => h.trim()).filter(Boolean)

  if (!headline || !context) {
    redirect('/admin/social/' + id + '?error=' + encodeURIComponent('Headline and context cannot be empty.'))
  }

  const { error } = await db
    .from('social_packs')
    .update({
      headline, context,
      facebook_text: facebookText, instagram_text: instagramText, tiktok_text: tiktokText,
      hashtags,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)

  if (error) {
    redirect('/admin/social/' + id + '?error=' + encodeURIComponent(error.message))
  }

  revalidatePath('/admin/social/' + id)
  redirect('/admin/social/' + id + '?saved=1')
}

// Draft -> Ready for review -> Approved -> Posted, one step at a time, or
// freely backward to correct a mistake (canAdvanceSocialPackStatus).
// 'posted' is only ever reached by an admin confirming here, by hand,
// that they posted it themselves — this action makes no network call to
// any platform.
export async function advanceSocialPackStatusAction(id: string, to: SocialPackStatus) {
  await checkAuth()
  const db = createAdminClient()

  const { data: pack, error: fetchError } = await db
    .from('social_packs')
    .select('status')
    .eq('id', id)
    .single()
  if (fetchError || !pack) {
    redirect('/admin/social/' + id + '?error=' + encodeURIComponent('Social Pack not found.'))
  }

  if (!canAdvanceSocialPackStatus(pack.status, to)) {
    redirect('/admin/social/' + id + '?error=' + encodeURIComponent(`Can't move from "${pack.status}" to "${to}" directly.`))
  }

  const now = new Date().toISOString()
  const patch: Record<string, unknown> = { status: to, updated_at: now }
  if (to === 'approved') patch.approved_at = now
  if (to === 'posted') patch.posted_at = now
  if (to === 'draft' || to === 'ready_for_review') { patch.approved_at = null; patch.posted_at = null }

  const { error: updateError } = await db.from('social_packs').update(patch).eq('id', id)
  if (updateError) {
    redirect('/admin/social/' + id + '?error=' + encodeURIComponent(updateError.message))
  }

  revalidatePath('/admin/social')
  revalidatePath('/admin/social/' + id)
  redirect('/admin/social/' + id + '?saved=1')
}
