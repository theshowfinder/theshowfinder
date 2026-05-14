import { createAdminClient } from '@/lib/supabase/admin'
import type { EventCategory } from '@/lib/types/database'

type DbClient = ReturnType<typeof createAdminClient>

// ── Ticketmaster API types ──────────────────────────────────────────────────

interface TMVenue {
  id: string
  name: string
  address?: { line1?: string; line2?: string }
  city?: { name: string }
  state?: { name: string; stateCode: string }
  postalCode?: string
  location?: { latitude: string; longitude: string }
  url?: string
}

interface TMAttraction {
  id: string
  name: string
  images?: TMImage[]
  classifications?: TMClassification[]
}

interface TMClassification {
  primary?: boolean
  segment?: { id: string; name: string }
  genre?: { id: string; name: string }
  subGenre?: { id: string; name: string }
}

interface TMImage {
  url: string
  ratio?: string
  width?: number
  height?: number
  fallback?: boolean
}

interface TMPriceRange {
  type: string
  currency: string
  min: number
  max: number
}

interface TMEvent {
  id: string
  name: string
  url?: string
  dates?: {
    start?: { localDate?: string; localTime?: string; dateTime?: string }
    status?: { code: string }
  }
  images?: TMImage[]
  priceRanges?: TMPriceRange[]
  classifications?: TMClassification[]
  _embedded?: {
    venues?: TMVenue[]
    attractions?: TMAttraction[]
  }
}

interface TMResponse {
  _embedded?: { events?: TMEvent[] }
  page?: { size: number; totalElements: number; totalPages: number; number: number }
  fault?: { faultstring: string }
  errors?: Array<{ code: string; detail: string }>
}

// ── Config ──────────────────────────────────────────────────────────────────

const TM_BASE = 'https://app.ticketmaster.com/discovery/v2'
const MAX_PAGES_PER_CATEGORY = 2   // 2 × 200 = 400 events per category
const RATE_LIMIT_MS = 300          // ms between API calls

interface SegmentQuery {
  classificationName: string
  dbCategory: EventCategory
}

// Primary segment fetches (Music, Arts & Theatre, Sports, Family)
// Comedy is fetched separately as a genre search
const SEGMENT_QUERIES: SegmentQuery[] = [
  { classificationName: 'music',          dbCategory: 'concert' },
  { classificationName: 'arts & theatre', dbCategory: 'theatre' },
  { classificationName: 'sports',         dbCategory: 'sports'  },
  { classificationName: 'family',         dbCategory: 'family'  },
  { classificationName: 'comedy',         dbCategory: 'comedy'  },
]

// ── Helpers ─────────────────────────────────────────────────────────────────

function slugify(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 80)
}

function getBestImage(images: TMImage[] | undefined): string | null {
  if (!images?.length) return null
  const ok = (i: TMImage) => !i.fallback

  // Best: standard 1024×576 JPEG from Ticketmaster CDN (TABLET_LANDSCAPE_16_9)
  // Explicitly avoid the 2048px LARGE variant and raw SOURCE files.
  const standard = images.find(i =>
    ok(i) && i.ratio === '16_9' &&
    i.url.includes('TABLET_LANDSCAPE_16_9') && i.url.endsWith('.jpg')
  )
  if (standard) return standard.url

  // Second: any 16:9 JPEG between 640-1400px (medium quality, fast loading)
  const mid = images.find(i =>
    ok(i) && i.ratio === '16_9' &&
    (i.width ?? 0) >= 640 && (i.width ?? 9999) <= 1400 &&
    i.url.endsWith('.jpg')
  )
  if (mid) return mid.url

  // Third: any 16:9 JPEG at all
  const anyJpg = images.find(i => ok(i) && i.ratio === '16_9' && i.url.endsWith('.jpg'))
  if (anyJpg) return anyJpg.url

  // Fallback: CDN-transformed URLs (Universe.com etc.) — valid but no .jpg extension
  const any169 = images.find(i => ok(i) && i.ratio === '16_9')
  if (any169) return any169.url

  return images.find(ok)?.url ?? images[0]?.url ?? null
}

function mapCategory(event: TMEvent, defaultCategory: EventCategory): EventCategory {
  const cls     = event.classifications?.[0]
  const seg     = cls?.segment?.name ?? ''
  const genre   = (cls?.genre?.name ?? '').toLowerCase()
  const subGenre = (cls?.subGenre?.name ?? '').toLowerCase()

  if (genre.includes('comedy') || subGenre.includes('comedy')) return 'comedy'
  if (seg === 'Music')          return 'concert'
  if (seg === 'Sports')         return 'sports'
  if (seg === 'Family')         return 'family'
  if (seg === 'Arts & Theatre') return 'theatre'
  return defaultCategory
}

function buildStartDate(event: TMEvent): string | null {
  const start = event.dates?.start
  if (!start) return null
  if (start.dateTime) return start.dateTime
  if (start.localDate) {
    const time = start.localTime ?? '19:00:00'
    return `${start.localDate}T${time}`
  }
  return null
}

function mapStatus(event: TMEvent): 'upcoming' | 'on_sale' | 'sold_out' | 'cancelled' | 'postponed' {
  const code = (event.dates?.status?.code ?? '').toLowerCase()
  if (code === 'cancelled')  return 'cancelled'
  if (code === 'postponed')  return 'postponed'
  if (code === 'offsale')    return 'upcoming'
  if (event.priceRanges?.length) return 'on_sale'
  return 'upcoming'
}

function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms))
}

// ── Ticketmaster API fetch ───────────────────────────────────────────────────

async function fetchTMPage(
  classificationName: string,
  page: number,
): Promise<{ events: TMEvent[]; totalPages: number }> {
  const url = new URL(`${TM_BASE}/events.json`)
  url.searchParams.set('apikey',             process.env.TICKETMASTER_API_KEY!)
  url.searchParams.set('countryCode',        'GB')
  url.searchParams.set('classificationName', classificationName)
  url.searchParams.set('size',               '200')
  url.searchParams.set('page',               String(page))
  url.searchParams.set('locale',             'en-us')
  url.searchParams.set('sort',               'date,asc')

  let res: Response
  try {
    res = await fetch(url.toString(), { cache: 'no-store' })
  } catch (err) {
    console.error(`[TM] Network error fetching "${classificationName}" page ${page}:`, err)
    return { events: [], totalPages: 0 }
  }

  if (!res.ok) {
    console.error(`[TM] HTTP ${res.status} for "${classificationName}" page ${page}`)
    return { events: [], totalPages: 0 }
  }

  const json: TMResponse = await res.json()

  if (json.fault) {
    console.error(`[TM] API fault: ${json.fault.faultstring}`)
    return { events: [], totalPages: 0 }
  }
  if (json.errors?.length) {
    console.error(`[TM] API error: ${json.errors[0].detail}`)
    return { events: [], totalPages: 0 }
  }

  return {
    events:     json._embedded?.events ?? [],
    totalPages: json.page?.totalPages  ?? 0,
  }
}

// ── Venue upsert ─────────────────────────────────────────────────────────────

async function upsertVenue(db: DbClient, tmVenue: TMVenue): Promise<string | null> {
  if (!tmVenue.name) return null  // some TM venues have no name; skip them
  const city = tmVenue.city?.name ?? 'Unknown'
  const baseSlug = slugify(`${tmVenue.name}-${city}`)

  // 1. Look up by TM venue ID (fastest path on repeat runs)
  const { data: byTmId } = await db
    .from('venues')
    .select('id')
    .eq('ticketmaster_id', tmVenue.id)
    .maybeSingle()
  if (byTmId) return byTmId.id

  // 2. Look up by slug (covers venues from seed data)
  const { data: bySlug } = await db
    .from('venues')
    .select('id')
    .eq('slug', baseSlug)
    .maybeSingle()
  if (bySlug) {
    // Back-fill the ticketmaster_id if missing
    await db.from('venues').update({ ticketmaster_id: tmVenue.id }).eq('id', bySlug.id)
    return bySlug.id
  }

  // 3. Insert new venue
  const slug = baseSlug
  const venueData = {
    name:            tmVenue.name,
    slug,
    address:         tmVenue.address?.line1 ?? tmVenue.address?.line2 ?? 'See venue website',
    city,
    postcode:        tmVenue.postalCode ?? '',
    country:         'GB',
    lat:             tmVenue.location?.latitude  ? parseFloat(tmVenue.location.latitude)  : null,
    lng:             tmVenue.location?.longitude ? parseFloat(tmVenue.location.longitude) : null,
    website:         tmVenue.url ?? null,
    ticketmaster_id: tmVenue.id,
  }

  const { data, error } = await db.from('venues').insert(venueData).select('id').single()

  if (error) {
    if (error.code === '23505') {
      // Slug collision — append TM ID suffix and retry
      const fallbackSlug = `${baseSlug}-${tmVenue.id.slice(-6)}`
      const { data: retry } = await db
        .from('venues')
        .insert({ ...venueData, slug: fallbackSlug })
        .select('id')
        .single()
      return retry?.id ?? null
    }
    console.error(`[venue] insert failed for "${tmVenue.name}": ${error.message}`)
    return null
  }

  return data?.id ?? null
}

// ── Event upsert ─────────────────────────────────────────────────────────────

type UpsertResult = 'inserted' | 'updated' | 'skipped' | 'error'

async function upsertEvent(
  db: DbClient,
  tmEvent: TMEvent,
  venueId: string,
  defaultCategory: EventCategory,
): Promise<UpsertResult> {
  const startDate = buildStartDate(tmEvent)
  if (!startDate) return 'skipped'

  const category = mapCategory(tmEvent, defaultCategory)
  const price    = tmEvent.priceRanges?.find(p => p.type === 'standard') ?? tmEvent.priceRanges?.[0]

  // Slug uses TM event ID suffix → guaranteed unique
  const slug = `${slugify(tmEvent.name)}-${tmEvent.id.slice(-8)}`

  const eventData = {
    title:           tmEvent.name,
    slug,
    category,
    venue_id:        venueId,
    start_date:      startDate,
    image_url:       getBestImage(tmEvent.images),
    price_from:      price?.min  ?? null,
    price_to:        price?.max  ?? null,
    currency:        price?.currency ?? 'GBP',
    tickets_url:     tmEvent.url ?? null,
    status:          mapStatus(tmEvent),
    is_featured:     false,
    ticketmaster_id: tmEvent.id,
  }

  const { error } = await db
    .from('events')
    .upsert(eventData, { onConflict: 'ticketmaster_id' })

  if (error) {
    console.error(`[event] upsert failed for "${tmEvent.name}" (${tmEvent.id}): ${error.message}`)
    return 'error'
  }

  return 'inserted'
}

// ── Public sync result type ──────────────────────────────────────────────────

export interface SyncResult {
  total:          number
  inserted:       number
  skipped:        number
  errors:         number
  byCategory:     Record<string, number>
  durationMs:     number
}

// ── Main entry point ─────────────────────────────────────────────────────────

export async function syncTicketmasterEvents(): Promise<SyncResult> {
  const t0 = Date.now()
  const db = createAdminClient()

  let total = 0, inserted = 0, skipped = 0, errors = 0
  const byCategory: Record<string, number> = {}

  for (const { classificationName, dbCategory } of SEGMENT_QUERIES) {
    console.log(`\n[TM] ── Fetching "${classificationName}" ──`)

    for (let page = 0; page < MAX_PAGES_PER_CATEGORY; page++) {
      const { events, totalPages } = await fetchTMPage(classificationName, page)
      console.log(`[TM]    page ${page}: ${events.length} events (${totalPages} total pages)`)

      if (!events.length) break

      for (const tmEvent of events) {
        total++
        const tmVenue = tmEvent._embedded?.venues?.[0]

        if (!tmVenue) {
          console.warn(`[TM]    skip "${tmEvent.name}" — no venue`)
          skipped++
          continue
        }

        const venueId = await upsertVenue(db, tmVenue)
        if (!venueId) {
          errors++
          continue
        }

        const result = await upsertEvent(db, tmEvent, venueId, dbCategory)
        if (result === 'inserted') {
          inserted++
          byCategory[dbCategory] = (byCategory[dbCategory] ?? 0) + 1
        } else if (result === 'skipped') {
          skipped++
        } else if (result === 'error') {
          errors++
        }
      }

      if (page + 1 >= Math.min(totalPages, MAX_PAGES_PER_CATEGORY)) break
      await sleep(RATE_LIMIT_MS)
    }

    await sleep(RATE_LIMIT_MS)
  }

  const durationMs = Date.now() - t0
  console.log(`\n[TM] ── Sync complete in ${(durationMs / 1000).toFixed(1)}s ──`)
  console.log(`[TM]    total=${total} inserted=${inserted} skipped=${skipped} errors=${errors}`)
  console.log(`[TM]    by category:`, byCategory)

  return { total, inserted, skipped, errors, byCategory, durationMs }
}
