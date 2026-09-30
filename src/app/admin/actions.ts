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

export async function createNewsCandidateAction(formData: FormData) {
  await checkAuth()
  const db = createAdminClient()
  const { cityTargets, ...fields } = parseNewsCandidateForm(formData)

  await checkForDuplicateUrl(db, fields.url, null)

  const { data, error } = await db
    .from('news_candidates')
    .insert({ ...fields, created_by: ADMIN_IDENTITY })
    .select('id')
    .single()
  if (error) throw newsCandidateDbError(error)

  await syncNewsCandidateCities(db, data.id, cityTargets)

  revalidatePath('/admin/news')
  redirect('/admin/news/' + data.id + '?created=1')
}

export async function updateNewsCandidateAction(id: string, formData: FormData) {
  await checkAuth()
  const db = createAdminClient()
  const { cityTargets, ...fields } = parseNewsCandidateForm(formData)

  await checkForDuplicateUrl(db, fields.url, id)

  const { error } = await db
    .from('news_candidates')
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw newsCandidateDbError(error)

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
  const { candidate, cityTargets } = await fetchCandidateWithCities(db, id)

  if (!canPublishCandidate(candidate.review_status)) {
    throw new Error('Only an approved candidate can be published — approve it first.')
  }

  const targets = resolveCityNewsTargets(candidate, cityTargets)
  if (!targets.length) throw new Error('Candidate is missing a city — cannot publish.')

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

  revalidatePath('/admin/news')
  revalidatePath('/admin/news/' + id)
  for (const path of revalidatePathsForCandidate(candidate, targets)) revalidatePath(path)
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
  const { candidate, cityTargets } = await fetchCandidateWithCities(db, id)

  if (!canUnpublishCandidate(candidate.review_status)) {
    throw new Error('This candidate isn\'t currently published.')
  }

  const targets = resolveCityNewsTargets(candidate, cityTargets)
  const deleteFilter = buildUnpublishDeleteFilter(candidate, targets)
  if (!deleteFilter) throw new Error('Candidate is missing a city — cannot unpublish.')

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
