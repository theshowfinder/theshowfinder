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
  sales?: {
    public?:   { startDateTime?: string; endDateTime?: string }
    presales?: Array<{ name?: string; startDateTime?: string; endDateTime?: string }>
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

const TM_BASE       = 'https://app.ticketmaster.com/discovery/v2'
const RATE_LIMIT_MS = 300   // ms between API calls

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

// Every TM fetch reports back what actually happened, not just the events —
// this is what lets the sync tell "Ticketmaster genuinely has nothing here"
// apart from "we got rate-limited and silently came back empty", which used
// to be indistinguishable and made real coverage gaps impossible to diagnose.
type FetchStatus = 'ok' | 'rate_limited' | 'http_error' | 'api_fault' | 'network_error'

interface FetchResult {
  events:      TMEvent[]
  totalPages:  number
  status:      FetchStatus
  detail?:     string   // present when status !== 'ok'
}

// Shared fetch + retry logic for both fetchTMPage and fetchOnSaleSoonPage.
// TM's Discovery API enforces a daily request quota; when it's exhausted,
// requests return 429s that previously were treated identically to "no
// events found", silently dropping whatever that request would have found.
// One retry after a short backoff absorbs a transient per-second rate-limit
// bump; a 429 that persists past the retry is reported as 'rate_limited' so
// the caller can log it distinctly instead of it vanishing into "0 events".
async function fetchWithRetry(url: URL, label: string): Promise<FetchResult> {
  for (let attempt = 0; attempt < 2; attempt++) {
    let res: Response
    try {
      res = await fetch(url.toString(), { cache: 'no-store' })
    } catch (err) {
      console.error(`[TM] Network error fetching ${label}:`, err)
      return { events: [], totalPages: 0, status: 'network_error', detail: String(err) }
    }

    if (res.status === 429) {
      if (attempt === 0) {
        console.warn(`[TM] 429 rate-limited on ${label} — retrying once after backoff`)
        await sleep(2000)
        continue
      }
      console.error(`[TM] 429 rate-limited on ${label} — still limited after retry`)
      return { events: [], totalPages: 0, status: 'rate_limited', detail: 'HTTP 429 after retry' }
    }

    if (!res.ok) {
      console.error(`[TM] HTTP ${res.status} for ${label}`)
      return { events: [], totalPages: 0, status: 'http_error', detail: `HTTP ${res.status}` }
    }

    const json: TMResponse = await res.json()

    if (json.fault) {
      console.error(`[TM] API fault for ${label}: ${json.fault.faultstring}`)
      return { events: [], totalPages: 0, status: 'api_fault', detail: json.fault.faultstring }
    }
    if (json.errors?.length) {
      console.error(`[TM] API error for ${label}: ${json.errors[0].detail}`)
      return { events: [], totalPages: 0, status: 'api_fault', detail: json.errors[0].detail }
    }

    return {
      events:     json._embedded?.events ?? [],
      totalPages: json.page?.totalPages  ?? 0,
      status:     'ok',
    }
  }
  // Unreachable, but keeps TS satisfied
  return { events: [], totalPages: 0, status: 'network_error', detail: 'unreachable' }
}

async function fetchTMPage(
  classificationName: string,
  page: number,
  startDateTime?: string,
): Promise<FetchResult> {
  const endDate = new Date()
  endDate.setFullYear(endDate.getFullYear() + 1)
  const endDateTime = endDate.toISOString().replace(/\.\d{3}Z$/, 'Z')

  const url = new URL(`${TM_BASE}/events.json`)
  url.searchParams.set('apikey',             process.env.TICKETMASTER_API_KEY!)
  url.searchParams.set('countryCode',        'GB')
  url.searchParams.set('classificationName', classificationName)
  url.searchParams.set('size',               '200')
  url.searchParams.set('page',               String(page))
  url.searchParams.set('locale',             'en-us')
  url.searchParams.set('sort',               'date,asc')
  url.searchParams.set('endDateTime',        endDateTime)
  if (startDateTime) url.searchParams.set('startDateTime', startDateTime)

  return fetchWithRetry(url, `"${classificationName}" page ${page}`)
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

// ── Sale data helpers ────────────────────────────────────────────────────────

interface PresaleInfo {
  presale_start: string | null
  presale_end:   string | null
  presale_name:  string | null
}

function buildPresaleInfo(tmEvent: TMEvent): PresaleInfo {
  const presales = tmEvent.sales?.presales ?? []
  if (!presales.length) return { presale_start: null, presale_end: null, presale_name: null }

  // Find the earliest presale by startDateTime
  let earliest = presales[0]
  for (const p of presales) {
    if (p.startDateTime && (!earliest.startDateTime || p.startDateTime < earliest.startDateTime)) {
      earliest = p
    }
  }

  return {
    presale_start: earliest.startDateTime ?? null,
    presale_end:   earliest.endDateTime   ?? null,
    presale_name:  earliest.name          ?? null,
  }
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

  const category    = mapCategory(tmEvent, defaultCategory)
  const price       = tmEvent.priceRanges?.find(p => p.type === 'standard') ?? tmEvent.priceRanges?.[0]
  const presaleInfo = buildPresaleInfo(tmEvent)
  const pubStart    = tmEvent.sales?.public?.startDateTime ?? null
  const pubEnd      = tmEvent.sales?.public?.endDateTime   ?? null

  // Slug uses TM event ID suffix → guaranteed unique
  const slug = `${slugify(tmEvent.name)}-${tmEvent.id.slice(-8)}`

  const eventData = {
    title:               tmEvent.name,
    slug,
    category,
    venue_id:            venueId,
    start_date:          startDate,
    onsale_date:         pubStart,           // backwards-compat alias
    public_onsale_start: pubStart,
    public_onsale_end:   pubEnd,
    presale_start:       presaleInfo.presale_start,
    presale_end:         presaleInfo.presale_end,
    presale_name:        presaleInfo.presale_name,
    last_synced_at:      new Date().toISOString(),
    image_url:           getBestImage(tmEvent.images),
    price_from:          price?.min      ?? null,
    price_to:            price?.max      ?? null,
    currency:            price?.currency ?? 'GBP',
    tickets_url:         tmEvent.url     ?? null,
    status:              mapStatus(tmEvent),
    is_featured:         false,
    ticketmaster_id:     tmEvent.id,
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

// ── On-sale-soon fetch ───────────────────────────────────────────────────────
// Fetches one page of UK events whose public-sale period STARTS within the
// given date range, filtered to a single classification. Paginated via the
// same pattern as fetchTMPage so the caller can walk all pages.

async function fetchOnSaleSoonPage(
  startDT: string,
  endDT: string,
  classificationName: string,
  page: number,
  eventStartDT: string,   // lower bound on event show date (required for banding)
  eventEndDT: string,     // upper bound on event show date (keeps each band < 1200 events)
): Promise<FetchResult> {
  const url = new URL(`${TM_BASE}/events.json`)
  url.searchParams.set('apikey',              process.env.TICKETMASTER_API_KEY!)
  url.searchParams.set('countryCode',         'GB')
  url.searchParams.set('onsaleStartDateTime', startDT)
  url.searchParams.set('onsaleEndDateTime',   endDT)
  url.searchParams.set('classificationName',  classificationName)
  url.searchParams.set('size',               '200')
  url.searchParams.set('page',               String(page))
  url.searchParams.set('locale',             'en-us')
  url.searchParams.set('sort',               'date,asc')
  url.searchParams.set('startDateTime',       eventStartDT)
  url.searchParams.set('endDateTime',         eventEndDT)

  return fetchWithRetry(url, `on-sale-soon "${classificationName}" page ${page}`)
}

// ── Public sync result type ──────────────────────────────────────────────────

export interface SyncResult {
  total:          number
  inserted:       number
  skipped:        number
  errors:         number
  byCategory:     Record<string, number>
  durationMs:     number
  flagsUpdated:   boolean
  rateLimited:    number   // count of classification/band segments that hit a
                            // 429 even after retry — the smoking gun for "TM
                            // quota exhausted mid-sync" as opposed to a
                            // genuine "no matching events" result
}

// Best-effort log of one classification (or classification+band) segment's
// outcome, reusing the existing sync_log table (its columns predate this
// classification/band-based sync design, hence the slightly generic names —
// `city` holds the segment label, not an actual city). Never throws: a
// logging failure must not take down the sync itself.
async function logSegment(
  db: DbClient,
  segment: {
    label:        string   // e.g. "music" or "music:+21d–+42d"
    startedAt:    string
    eventsFound:  number
    status:       'ok' | 'rate_limited' | 'error'
    error?:       string
  },
): Promise<void> {
  try {
    await db.from('sync_log').insert({
      city:          segment.label,
      started_at:    segment.startedAt,
      completed_at:  new Date().toISOString(),
      events_synced: segment.eventsFound,
      status:        segment.status,
      error:         segment.error ?? null,
    })
  } catch (err) {
    console.error(`[TM] sync_log write failed for "${segment.label}" (non-fatal):`, err)
  }
}

// Best-effort sync_state update (single row, id=1) — never throws.
async function updateSyncState(
  db: DbClient,
  fields: Record<string, unknown>,
): Promise<void> {
  try {
    await db.from('sync_state').update(fields).eq('id', 1)
  } catch (err) {
    console.error('[TM] sync_state update failed (non-fatal):', err)
  }
}

// Reduces a run of FetchResults (one per page within a segment) down to the
// single worst status seen, so a segment that succeeded on pages 1-2 but got
// rate-limited on page 3 is correctly logged as 'rate_limited', not 'ok'.
function worstStatus(results: FetchResult[]): { status: 'ok' | 'rate_limited' | 'error'; detail?: string } {
  const rateLimited = results.find(r => r.status === 'rate_limited')
  if (rateLimited) return { status: 'rate_limited', detail: rateLimited.detail }
  const errored = results.find(r => r.status !== 'ok')
  if (errored) return { status: 'error', detail: errored.detail }
  return { status: 'ok' }
}

// ── Main entry point ─────────────────────────────────────────────────────────

export async function syncTicketmasterEvents(opts?: { startDateTime?: string }): Promise<SyncResult> {
  const t0 = Date.now()
  const db = createAdminClient()

  await updateSyncState(db, { status: 'running', last_started_at: new Date().toISOString() })

  let total = 0, inserted = 0, skipped = 0, errors = 0, rateLimited = 0
  const byCategory: Record<string, number> = {}

  for (const { classificationName, dbCategory } of SEGMENT_QUERIES) {
    console.log(`\n[TM] ── Fetching "${classificationName}" ──`)
    const segmentStarted = new Date().toISOString()
    const segmentResults: FetchResult[] = []
    let segmentEventsFound = 0

    let totalPages = 1
    for (let page = 0; page < totalPages; page++) {
      const result = await fetchTMPage(classificationName, page, opts?.startDateTime)
      segmentResults.push(result)
      totalPages = Math.min(result.totalPages || 1, 6)  // TM API hard-caps at page 5 (0-indexed)
      console.log(`[TM]    page ${page}/${totalPages - 1}: ${result.events.length} events (${result.status})`)

      if (!result.events.length) break
      segmentEventsFound += result.events.length

      for (const tmEvent of result.events) {
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

        const upserted = await upsertEvent(db, tmEvent, venueId, dbCategory)
        if (upserted === 'inserted') {
          inserted++
          byCategory[dbCategory] = (byCategory[dbCategory] ?? 0) + 1
        } else if (upserted === 'skipped') {
          skipped++
        } else if (upserted === 'error') {
          errors++
        }
      }

      if (page + 1 < totalPages) await sleep(RATE_LIMIT_MS)
    }

    const segmentOutcome = worstStatus(segmentResults)
    if (segmentOutcome.status === 'rate_limited') rateLimited++
    await logSegment(db, {
      label:       classificationName,
      startedAt:   segmentStarted,
      eventsFound: segmentEventsFound,
      status:      segmentOutcome.status,
      error:       segmentOutcome.detail,
    })

    await sleep(RATE_LIMIT_MS)
  }

  // ── On-sale-soon pass ──────────────────────────────────────────────────────
  // Uses 3-week (21-day) show-date bands with both startDateTime and endDateTime
  // so each band stays under TM's 1200-event / 6-page hard cap. Without the
  // endDateTime bound, a single classification can return 6000+ events in one
  // band, burying far-future events past page 6. 18 bands × 21 days ≈ 12.5 months.
  await sleep(RATE_LIMIT_MS)
  const onSaleNow     = new Date()
  const onSaleStart   = new Date(onSaleNow.getTime() - 3  * 24 * 60 * 60 * 1000)  // 3 days back
  const onSaleEnd     = new Date(onSaleNow.getTime() + 14 * 24 * 60 * 60 * 1000)  // 14 days ahead
  const onSaleStartDT = onSaleStart.toISOString().replace(/\.\d{3}Z$/, 'Z')
  const onSaleEndDT   = onSaleEnd.toISOString().replace(/\.\d{3}Z$/, 'Z')

  const BAND_DAYS = 21
  const BAND_COUNT = 18  // 18 × 21 days ≈ 12.5 months
  const fmt = (d: Date) => d.toISOString().replace(/\.\d{3}Z$/, 'Z')
  const bands = Array.from({ length: BAND_COUNT }, (_, i) => ({
    label: `+${i * BAND_DAYS}d–+${(i + 1) * BAND_DAYS}d`,
    start: fmt(new Date(onSaleNow.getTime() + i       * BAND_DAYS * 86400000)),
    end:   fmt(new Date(onSaleNow.getTime() + (i + 1) * BAND_DAYS * 86400000)),
  }))

  console.log(`\n[TM] ── On-sale-soon pass (${onSaleStartDT} → ${onSaleEndDT}) ──`)

  for (const { classificationName, dbCategory } of SEGMENT_QUERIES) {
    for (const { label, start, end } of bands) {
      console.log(`[TM]    "${classificationName}" ${label}`)
      const segmentStarted = new Date().toISOString()
      const segmentResults: FetchResult[] = []
      let segmentEventsFound = 0

      let osTotal = 1
      for (let page = 0; page < osTotal; page++) {
        const result = await fetchOnSaleSoonPage(onSaleStartDT, onSaleEndDT, classificationName, page, start, end)
        segmentResults.push(result)
        osTotal = Math.min(result.totalPages || 1, 6)  // TM API hard-caps at page 5 (0-indexed)
        console.log(`[TM]      page ${page}/${osTotal - 1}: ${result.events.length} events (${result.status})`)
        if (!result.events.length) break
        segmentEventsFound += result.events.length

        for (const tmEvent of result.events) {
          total++
          const tmVenue = tmEvent._embedded?.venues?.[0]
          if (!tmVenue) { skipped++; continue }

          const venueId = await upsertVenue(db, tmVenue)
          if (!venueId) { errors++; continue }

          const category = mapCategory(tmEvent, dbCategory)
          const upserted = await upsertEvent(db, tmEvent, venueId, category)
          if (upserted === 'inserted') {
            inserted++
            byCategory[category] = (byCategory[category] ?? 0) + 1
          } else if (upserted === 'skipped') {
            skipped++
          } else if (upserted === 'error') {
            errors++
          }
        }

        if (page + 1 < osTotal) await sleep(RATE_LIMIT_MS)
      }

      const segmentOutcome = worstStatus(segmentResults)
      if (segmentOutcome.status === 'rate_limited') rateLimited++
      await logSegment(db, {
        label:       `${classificationName}:${label}`,
        startedAt:   segmentStarted,
        eventsFound: segmentEventsFound,
        status:      segmentOutcome.status,
        error:       segmentOutcome.detail,
      })

      await sleep(RATE_LIMIT_MS)
    }
  }

  // ── Flag calculation pass ─────────────────────────────────────────────────
  // Reset all boolean flags to false, then re-set based on current date.
  // Running this after every sync ensures stale flags are never left behind.
  console.log('\n[TM] ── Calculating event flags ──')
  let flagsUpdated = false
  try {
    const { error: flagErr } = await (db as unknown as { rpc: (fn: string) => Promise<{ error: unknown }> })
      .rpc('calculate_event_flags')
    if (flagErr) {
      console.error('[TM] Flag calculation failed (migration_014 may not be applied yet):', flagErr)
    } else {
      flagsUpdated = true
      console.log('[TM] Event flags updated successfully')
    }
  } catch (err) {
    console.error('[TM] Flag calculation threw:', err)
  }

  const durationMs = Date.now() - t0
  console.log(`\n[TM] ── Sync complete in ${(durationMs / 1000).toFixed(1)}s ──`)
  console.log(`[TM]    total=${total} inserted=${inserted} skipped=${skipped} errors=${errors} rateLimited=${rateLimited}`)
  console.log(`[TM]    by category:`, byCategory)
  console.log(`[TM]    flags updated: ${flagsUpdated}`)
  if (rateLimited > 0) {
    console.error(`[TM]    ⚠ ${rateLimited} segment(s) hit Ticketmaster's rate limit even after retrying — some events were very likely missed this run. Check the sync_log table for status='rate_limited' rows.`)
  }

  await updateSyncState(db, {
    status:              rateLimited > 0 ? 'completed_with_rate_limits' : 'idle',
    last_completed_at:   new Date().toISOString(),
    total_events_synced: total,
  })

  return { total, inserted, skipped, errors, byCategory, durationMs, flagsUpdated, rateLimited }
}
