// Syncs "what's on" listings from UK council/venue-group sites that run their
// own event pages with schema.org Event markup (Derby Market Hall and Derby
// LIVE both use this pattern — same underlying council CMS, so this same
// module covers both without duplication). Distinct from the Ticketmaster
// sync: these are small, non-ticketed local listings (markets, workshops,
// festivals at council-run venues) that never appear on Ticketmaster, so
// they'd otherwise be invisible on the site entirely.
//
// Adding another city's council/venue site later is just another entry in
// COUNCIL_SOURCES below, as long as it follows the same pattern: a paginated
// "/whats-on/" listing linking to detail pages that carry a schema.org
// Event <script type="application/ld+json"> block. A source whose detail
// pages don't carry that markup won't be scraped by this module — see the
// note by SCRAPE_ONLY_JSONLD below before adding one that doesn't.
import { createHash } from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import type { EventStatus } from './types/database'

type DbClient = ReturnType<typeof createAdminClient>

const USER_AGENT =
  'Mozilla/5.0 (compatible; TheShowFinderBot/1.0; +https://theshowfinder.com)'
const FETCH_TIMEOUT_MS = 15000
const DETAIL_CONCURRENCY = 5
const REQUEST_DELAY_MS = 150
const MAX_LISTING_PAGES = 8  // safety cap — these sites run 30-45 live listings (3-4 pages of 12)

interface CouncilSource {
  key: string        // stable id, used in logging — e.g. 'derby_market_hall'
  label: string       // human label for sync_log
  cityName: string    // fallback venue city when the page doesn't say
  baseUrl: string      // e.g. 'https://www.derbymarkethall.co.uk'
  listingPath: string  // e.g. '/whats-on/'
}

// SCRAPE_ONLY_JSONLD: these two sites emit full schema.org Event JSON-LD on
// every single-occurrence event's detail page (checked directly against
// live pages before writing this) — that's what's actually parsed, not the
// listing-page HTML cards, which differ between the two sites' templates
// and would need separate brittle selectors each. Recurring multi-date
// listings (workshops, classes with several sessions) don't get an Event
// JSON-LD block on this CMS and are skipped for now rather than parsed from
// free-text date strings — see fetchEventDetail below.
const COUNCIL_SOURCES: CouncilSource[] = [
  {
    key:         'derby_market_hall',
    label:       'Derby Market Hall',
    cityName:    'Derby',
    baseUrl:     'https://www.derbymarkethall.co.uk',
    listingPath: '/whats-on/',
  },
  {
    key:         'derby_live',
    label:       'Derby LIVE',
    cityName:    'Derby',
    baseUrl:     'https://www.derbylive.co.uk',
    listingPath: '/whats-on/',
  },
]

function slugify(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 80)
}

function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms))
}

async function fetchText(url: string): Promise<string | null> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, 'Accept': 'text/html' },
      signal: controller.signal,
    })
    if (!res.ok) return null
    return await res.text()
  } catch {
    return null
  } finally {
    clearTimeout(timeout)
  }
}

/** Like fetchText but keeps the HTTP status, so a real 404/410 can be told apart from a timeout or a 5xx. */
async function fetchWithStatus(url: string): Promise<{ status: number | null; html: string | null }> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT, 'Accept': 'text/html' }, signal: controller.signal })
    return { status: res.status, html: res.ok ? await res.text() : null }
  } catch {
    return { status: null, html: null }
  } finally {
    clearTimeout(timeout)
  }
}

// ── Listing pages: collect detail-page URLs ─────────────────────────────────

function extractDetailPaths(html: string): string[] {
  const found = new Set<string>()
  const re = /href="(\/whats-on\/[a-z0-9][a-z0-9-]*\/)"/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html))) found.add(m[1])
  return [...found]
}

function extractTotalResults(html: string): number | null {
  const m = html.match(/Showing\s+\d+\s+to\s+\d+\s+of\s+(\d+)\s+results/i)
  return m ? parseInt(m[1], 10) : null
}

async function collectDetailUrls(source: CouncilSource): Promise<{ urls: string[]; complete: boolean }> {
  const listingUrl = `${source.baseUrl}${source.listingPath}`
  const first = await fetchText(listingUrl)
  if (!first) return { urls: [], complete: false }

  const paths = new Set(extractDetailPaths(first))
  const total = extractTotalResults(first)
  const pageCount = total ? Math.min(Math.ceil(total / 12), MAX_LISTING_PAGES) : 1

  // The listing only counts as complete if every page loaded and the page count was not cut off by the safety cap.
  let complete = Boolean(total) && Math.ceil((total ?? 0) / 12) <= MAX_LISTING_PAGES
  for (let page = 2; page <= pageCount; page++) {
    await sleep(REQUEST_DELAY_MS)
    const html = await fetchText(`${listingUrl}?ccm_paging_p=${page}`)
    if (!html) { complete = false; continue }
    for (const p of extractDetailPaths(html)) paths.add(p)
  }

  return { urls: [...paths].map(p => `${source.baseUrl}${p}`), complete: complete && paths.size > 0 }
}

// ── Detail pages: schema.org Event JSON-LD ──────────────────────────────────

interface SchemaEvent {
  '@type'?: string
  name?: string
  description?: string
  image?: string
  startDate?: string
  eventStatus?: string
  url?: string
  location?: {
    name?: string
    address?: {
      streetAddress?: string
      addressLocality?: string
      postalCode?: string
    }
    latitude?: string | number
    longitude?: string | number
  }
  offers?: { url?: string }[]
}

function extractEventJsonLd(html: string): SchemaEvent | null {
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html))) {
    let parsed: unknown
    try {
      parsed = JSON.parse(m[1])
    } catch {
      continue
    }
    const candidates = Array.isArray(parsed) ? parsed : [parsed]
    for (const c of candidates) {
      if (c && typeof c === 'object' && (c as SchemaEvent)['@type'] === 'Event') {
        return c as SchemaEvent
      }
    }
  }
  return null
}

function mapEventStatus(raw: string | undefined): EventStatus {
  if (!raw) return 'upcoming'
  if (/cancelled/i.test(raw))  return 'cancelled'
  if (/postponed/i.test(raw))  return 'postponed'
  return 'upcoming'
}

interface ScrapedEvent {
  title: string
  description: string | null
  imageUrl: string | null
  startDate: string
  status: EventStatus
  sourceUrl: string
  venueName: string
  address: string | null
  city: string
  postcode: string | null
  lat: number | null
  lng: number | null
  ticketUrl: string | null
}

async function fetchEventDetail(url: string, fallbackCity: string): Promise<ScrapedEvent | null> {
  const html = await fetchText(url)
  if (!html) return null

  const ev = extractEventJsonLd(html)
  // No Event JSON-LD → most likely a recurring multi-session listing (this
  // CMS only emits Event markup for single-occurrence events) or a non-event
  // page a listing link happened to point at. Skip rather than guess.
  if (!ev || !ev.name || !ev.startDate) return null

  const start = new Date(ev.startDate)
  if (Number.isNaN(start.getTime())) return null

  return {
    title:       ev.name,
    description: ev.description ?? null,
    imageUrl:    ev.image ?? null,
    startDate:   start.toISOString(),
    status:      mapEventStatus(ev.eventStatus),
    sourceUrl:   ev.url ?? url,
    venueName:   ev.location?.name ?? fallbackCity,
    address:     ev.location?.address?.streetAddress ?? null,
    city:        ev.location?.address?.addressLocality ?? fallbackCity,
    postcode:    ev.location?.address?.postalCode ?? null,
    lat:         ev.location?.latitude  != null ? Number(ev.location.latitude)  : null,
    lng:         ev.location?.longitude != null ? Number(ev.location.longitude) : null,
    ticketUrl:   ev.offers?.[0]?.url ?? ev.url ?? url,
  }
}

// ── Venue find-or-create ─────────────────────────────────────────────────────

async function findOrCreateVenue(db: DbClient, ev: ScrapedEvent): Promise<string | null> {
  const slug = slugify(`${ev.venueName}-${ev.city}`)

  const { data: existing } = await db.from('venues').select('id').eq('slug', slug).maybeSingle()
  if (existing) return existing.id

  const { data, error } = await db
    .from('venues')
    .insert({
      name:     ev.venueName,
      slug,
      address:  ev.address ?? 'See venue website',
      city:     ev.city,
      postcode: ev.postcode ?? '',
      country:  'GB',
      lat:      ev.lat,
      lng:      ev.lng,
    })
    .select('id')
    .single()

  if (error) {
    if (error.code === '23505') {
      const { data: retry } = await db.from('venues').select('id').eq('slug', slug).maybeSingle()
      return retry?.id ?? null
    }
    console.error(`[council] venue insert failed for "${ev.venueName}": ${error.message}`)
    return null
  }

  return data?.id ?? null
}

// ── Event upsert ──────────────────────────────────────────────────────────

async function upsertScrapedEvent(db: DbClient, ev: ScrapedEvent, source: CouncilSource): Promise<'inserted' | 'skipped' | 'error'> {
  const venueId = await findOrCreateVenue(db, ev)
  if (!venueId) return 'error'

  const idSuffix = createHash('md5').update(ev.sourceUrl).digest('hex').slice(0, 8)
  const slug = `${slugify(ev.title)}-${idSuffix}`

  const { error } = await db.from('events').upsert(
    {
      title:           ev.title,
      slug,
      description:     ev.description,
      category:        'local',
      venue_id:        venueId,
      start_date:      ev.startDate,
      image_url:       ev.imageUrl,
      currency:        'GBP',
      own_ticket_url:  ev.ticketUrl,
      status:          ev.status,
      is_featured:     false,
      source:          source.key.startsWith('derby') ? 'derby_council' : source.key,
      source_url:      ev.sourceUrl,
      last_synced_at:  new Date().toISOString(),
    },
    { onConflict: 'source_url' },
  )

  if (error) {
    console.error(`[council] event upsert failed for "${ev.title}" (${ev.sourceUrl}): ${error.message}`)
    return 'error'
  }
  return 'inserted'
}

// ── sync_log ─────────────────────────────────────────────────────────────

async function logRun(
  db: DbClient,
  label: string,
  startedAt: string,
  found: number,
  status: 'ok' | 'error',
  error?: string,
): Promise<void> {
  try {
    await db.from('sync_log').insert({
      city:          label,
      started_at:    startedAt,
      completed_at:  new Date().toISOString(),
      events_synced: found,
      status,
      error:         error ?? null,
    })
  } catch (err) {
    console.error(`[council] sync_log write failed for "${label}" (non-fatal):`, err)
  }
}

// ── Main entry point ─────────────────────────────────────────────────────

export async function syncCouncilEvents(): Promise<{
  sources: { key: string; label: string; found: number; inserted: number; skipped: number; errors: number }[]
  verify?: CouncilVerifyResult
}> {
  const db = createAdminClient()
  const results: { key: string; label: string; found: number; inserted: number; skipped: number; errors: number }[] = []

  // Cross-source dedupe within this run: Derby Market Hall and Derby LIVE
  // mirror a lot of the same events (both are Derby City Council venues),
  // so the same real-world event fetched from both sites would otherwise
  // write two rows. Keyed on title + calendar date; first source to see an
  // event wins and its source_url becomes the upsert key going forward.
  const seen = new Map<string, true>()
  // Every detail URL the listings showed this run (whether or not it parsed), and whether every listing was read in full.
  const listedUrls = new Set<string>()
  let allListingsComplete = true
  let totalFound = 0

  for (const source of COUNCIL_SOURCES) {
    const startedAt = new Date().toISOString()
    let found = 0, inserted = 0, skipped = 0, errors = 0

    try {
      const { urls: detailUrls, complete } = await collectDetailUrls(source)
      if (!complete) allListingsComplete = false
      for (const u of detailUrls) listedUrls.add(u)

      for (let i = 0; i < detailUrls.length; i += DETAIL_CONCURRENCY) {
        const batch = detailUrls.slice(i, i + DETAIL_CONCURRENCY)
        const details = await Promise.all(batch.map(u => fetchEventDetail(u, source.cityName)))

        for (const ev of details) {
          if (!ev) { skipped++; continue }
          found++

          // Only future events are worth writing — this CMS's sitemap-style
          // listing occasionally surfaces same-day events already finished.
          if (new Date(ev.startDate).getTime() < Date.now() - 6 * 60 * 60 * 1000) {
            skipped++
            continue
          }

          const dedupeKey = `${slugify(ev.title)}|${ev.startDate.slice(0, 10)}`
          if (seen.has(dedupeKey)) { skipped++; continue }
          seen.set(dedupeKey, true)

          const outcome = await upsertScrapedEvent(db, ev, source)
          if (outcome === 'inserted') inserted++
          else if (outcome === 'error') errors++
          else skipped++
        }

        await sleep(REQUEST_DELAY_MS)
      }

      await logRun(db, `council:${source.key}`, startedAt, found, errors > 0 ? 'error' : 'ok')
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error(`[council] fatal error syncing "${source.label}":`, message)
      await logRun(db, `council:${source.key}`, startedAt, found, 'error', message)
      errors++
    }

    totalFound += found
    results.push({ key: source.key, label: source.label, found, inserted, skipped, errors })
  }

  let verify: CouncilVerifyResult | undefined
  try {
    verify = await verifyDroppedCouncilEvents(db, { listedUrls, allListingsComplete, totalFound })
  } catch (err) {
    console.error('[council] dead-event check failed (non-fatal):', err instanceof Error ? err.message : err)
  }
  return { sources: results, verify }
}

export interface CouncilVerifyResult {
  mode: 'off' | 'dry' | 'live'
  status: 'skipped' | 'done'
  detail?: string
  candidates: number
  stillLive: number
  gone: number            // confirmed gone (live: cancelled; dry: would be cancelled)
  cancelledByCouncil: number
  unclear: number         // page loads but has no Event markup, or the check failed: left alone
  goneTitles: string[]
}

/**
 * Council events that were not on this run's listings are checked on their own page.
 * Only an HTTP 404/410 on the event's page removes one (status -> cancelled, reversible: if the council
 * lists it again the next sync restores its status). Skipped entirely unless every listing was read in full.
 */
async function verifyDroppedCouncilEvents(
  db: DbClient,
  ctx: { listedUrls: Set<string>; allListingsComplete: boolean; totalFound: number },
): Promise<CouncilVerifyResult> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const loose = db as unknown as { from: (t: string) => any }
  const { data: st } = await loose.from('council_sync_state').select('mode, max_removals_per_run').eq('id', 1).maybeSingle()
  const mode = ((st as { mode?: 'off' | 'dry' | 'live' } | null)?.mode) ?? 'dry'
  const cap = Math.max(0, (st as { max_removals_per_run?: number } | null)?.max_removals_per_run ?? 20)
  const out: CouncilVerifyResult = { mode, status: 'done', candidates: 0, stillLive: 0, gone: 0, cancelledByCouncil: 0, unclear: 0, goneTitles: [] }
  const save = async () => { await loose.from('council_sync_state').update({ last_stats: { ...out, at: new Date().toISOString() } }).eq('id', 1) }

  if (mode === 'off') { out.status = 'skipped'; out.detail = 'switched off'; return out }
  if (!ctx.allListingsComplete || ctx.totalFound === 0) {
    out.status = 'skipped'
    out.detail = 'a council listing could not be read in full this run; nothing checked or removed'
    await save()
    return out
  }

  const { data: rows } = await loose.from('events')
    .select('id, title, source_url')
    .like('source', '%_council')
    .not('source_url', 'is', null)
    .gte('start_date', new Date().toISOString())
    .in('status', ['upcoming', 'on_sale', 'sold_out', 'postponed'])
  const candidates = ((rows ?? []) as Array<{ id: string; title: string; source_url: string }>).filter(r => !ctx.listedUrls.has(r.source_url))
  out.candidates = candidates.length

  let checked = 0
  for (const row of candidates) {
    const { status, html } = await fetchWithStatus(row.source_url)
    checked++
    await sleep(REQUEST_DELAY_MS)
    if (status === 404 || status === 410) {
      // Systemic breaker: most of what we check being "gone" means the site changed shape, not that events vanished.
      if (checked >= 10 && out.gone / checked > 0.6) { out.detail = 'most dropped events returned 404; assuming the site changed, nothing removed'; break }
      out.gone++
      if (out.goneTitles.length < 15) out.goneTitles.push(row.title.slice(0, 80))
      if (mode === 'live' && out.gone <= cap) {
        await loose.from('events').update({ status: 'cancelled', last_synced_at: new Date().toISOString() }).eq('id', row.id)
      }
      continue
    }
    if (!html) { out.unclear++; continue }
    const ev = extractEventJsonLd(html)
    if (!ev) { out.unclear++; continue }
    if (mapEventStatus(ev.eventStatus) === 'cancelled') {
      out.cancelledByCouncil++
      if (mode === 'live') await loose.from('events').update({ status: 'cancelled', last_synced_at: new Date().toISOString() }).eq('id', row.id)
    } else {
      out.stillLive++
      if (mode === 'live') await loose.from('events').update({ last_synced_at: new Date().toISOString() }).eq('id', row.id)
    }
  }
  if (mode === 'live' && out.gone > cap) out.detail = `removal cap of ${cap} per run reached; ${out.gone - cap} left for the next run`
  await save()
  return out
}
