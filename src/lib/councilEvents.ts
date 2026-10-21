// Local events sweep: "what's on" listings from council, venue-group and tourist-board sites, for every city we have a
// source for. Sources live in the local_event_sources table (see /admin/local-events); each is either a paginated
// listing page (Derby's council sites) or an XML sitemap of event pages (the Visit-X tourist boards). Every event page
// is read for its schema.org Event markup — pages without it (articles, recurring listings) are remembered and skipped.
//
// These are non-ticketed local events (markets, festivals, workshops, community nights) that never appear on
// Ticketmaster. They are stored with category 'local' and events.source = '<city>_council'.
//
// Keeping it clean: a ledger (local_event_urls) remembers every page already read so a large sitemap is worked
// through once and afterwards only new and due pages are fetched. An event whose own page returns 404/410, or is
// marked cancelled, is set to status 'cancelled' (reversible: if the site lists it again the next sweep restores it).
// Removal is capped per source per run, and a site where most checked pages vanish at once is treated as "the site
// changed", not "the events went", and nothing is removed.
import { createHash } from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import type { EventStatus } from './types/database'
import {
  eventFromPage, parseSitemap, matchesDetailPattern, chooseUrlsToFetch, sameShow,
  type ScrapedLocalEvent, type SitemapEntry, type LedgerRow,
} from './localEventParsing'
import { resolveEventCity } from './localEventCity'

type DbClient = ReturnType<typeof createAdminClient>
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = { from: (t: string) => any }

const USER_AGENT = 'Mozilla/5.0 (compatible; TheShowFinderBot/1.0; +https://theshowfinder.com)'
const FETCH_TIMEOUT_MS = 15000
const DETAIL_CONCURRENCY = 6
const REQUEST_DELAY_MS = 120
const MAX_CHILD_SITEMAPS = 40
const DEFAULT_BUDGET_MS = 140_000
const MAX_VERIFY_PER_SOURCE = 60
const LIVE_STATUSES = ['upcoming', 'on_sale', 'sold_out', 'postponed']

export interface LocalEventSource {
  id: string
  key: string
  city: string
  label: string
  event_source: string
  base_url: string
  discovery: 'listing' | 'sitemap'
  discovery_url: string
  detail_pattern: string
  sitemap_child_pattern: string | null
  page_param: string | null
  page_size: number | null
  max_pages: number
  max_details_per_run: number
  enabled: boolean
  last_run_at: string | null
  last_stats: SourceStats | null
}

export interface SourceStats {
  at: string
  mode: 'off' | 'dry' | 'live'
  action: 'refresh' | 'clean'
  discovered: number
  listComplete: boolean
  fetched: number
  events: number          // pages that were a usable, future event and were written
  duplicates: number      // already on the site as a ticketed show
  noEvent: number
  past: number
  gone: number            // event pages that returned 404/410 (event cancelled in live mode)
  cancelled: number       // events set to cancelled this run
  restored: number
  errors: number
  unseenLeft: number      // discovered pages not yet read (a large sitemap is worked through over several runs)
  stoppedEarly: boolean
  detail?: string
  goneTitles: string[]
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }

function slugify(str: string): string {
  return str.toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/[\s_]+/g, '-').replace(/-{2,}/g, '-').replace(/^-|-$/g, '').substring(0, 80)
}

/** Fetch with the real HTTP status, so a 404/410 can be told apart from a timeout, a 403 or a 5xx. */
async function fetchWithStatus(url: string, accept = 'text/html'): Promise<{ status: number | null; body: string | null }> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: accept }, signal: controller.signal, redirect: 'follow' })
    return { status: res.status, body: res.ok ? await res.text() : null }
  } catch {
    return { status: null, body: null }
  } finally {
    clearTimeout(timeout)
  }
}

// ── Registry ─────────────────────────────────────────────────────────────────

export async function loadSources(db: DbClient, filter: { city?: string; key?: string } = {}): Promise<LocalEventSource[]> {
  const loose = db as unknown as Loose
  const { data, error } = await loose.from('local_event_sources').select('*').eq('enabled', true)
  if (error) throw new Error(`could not read local_event_sources: ${error.message}`)
  let rows = (data ?? []) as LocalEventSource[]
  if (filter.city) rows = rows.filter(r => r.city.toLowerCase() === filter.city!.toLowerCase())
  if (filter.key) rows = rows.filter(r => r.key === filter.key)
  // Longest-waiting source first, so a short time budget still rotates through every source.
  return rows.sort((a, b) => (a.last_run_at ?? '').localeCompare(b.last_run_at ?? ''))
}

// ── Discovery: which event pages does this source list? ──────────────────────

function absolute(base: string, path: string): string {
  try { return new URL(path, base).toString() } catch { return path }
}

function extractListingLinks(html: string, source: LocalEventSource): string[] {
  const found = new Set<string>()
  const re = /href="([^"#]+)"/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html))) {
    const url = absolute(source.base_url, m[1].replace(/&amp;/g, '&')).split('?')[0]
    if (matchesDetailPattern(url, source.detail_pattern) && url.startsWith(source.base_url)) found.add(url)
  }
  return [...found]
}

async function discoverListing(source: LocalEventSource): Promise<{ entries: SitemapEntry[]; complete: boolean }> {
  const listingUrl = absolute(source.base_url, source.discovery_url)
  const first = await fetchWithStatus(listingUrl)
  if (!first.body) return { entries: [], complete: false }
  const urls = new Set(extractListingLinks(first.body, source))

  const totalMatch = first.body.match(/Showing\s+\d+\s+to\s+\d+\s+of\s+(\d+)\s+results/i)
  const total = totalMatch ? parseInt(totalMatch[1], 10) : null
  const pageSize = source.page_size ?? 12
  const wantedPages = total ? Math.ceil(total / pageSize) : source.max_pages
  const pageCount = Math.min(wantedPages, source.max_pages)

  // Only "complete" when the listing said how many results there were and every page of them was read.
  let complete = Boolean(total) && wantedPages <= source.max_pages
  if (source.page_param) {
    for (let page = 2; page <= pageCount; page++) {
      await sleep(REQUEST_DELAY_MS)
      const res = await fetchWithStatus(`${listingUrl}${listingUrl.includes('?') ? '&' : '?'}${source.page_param}=${page}`)
      if (!res.body) { complete = false; continue }
      for (const u of extractListingLinks(res.body, source)) urls.add(u)
    }
  }
  return { entries: [...urls].map(url => ({ url, lastmod: null })), complete: complete && urls.size > 0 }
}

async function discoverSitemap(source: LocalEventSource): Promise<{ entries: SitemapEntry[]; complete: boolean }> {
  const root = await fetchWithStatus(absolute(source.base_url, source.discovery_url), 'application/xml,text/xml,*/*')
  if (!root.body) return { entries: [], complete: false }
  const parsed = parseSitemap(root.body)
  let complete = true
  let all: SitemapEntry[] = []

  if (parsed.isIndex) {
    const childRe = source.sitemap_child_pattern ? new RegExp(source.sitemap_child_pattern, 'i') : null
    const children = parsed.entries.filter(e => !childRe || childRe.test(e.url))
    if (children.length > MAX_CHILD_SITEMAPS) complete = false
    for (const child of children.slice(0, MAX_CHILD_SITEMAPS)) {
      await sleep(REQUEST_DELAY_MS)
      const res = await fetchWithStatus(child.url, 'application/xml,text/xml,*/*')
      if (!res.body) { complete = false; continue }
      all = all.concat(parseSitemap(res.body).entries)
    }
  } else {
    all = parsed.entries
  }

  const seen = new Set<string>()
  const entries = all.filter(e => {
    if (seen.has(e.url) || !matchesDetailPattern(e.url, source.detail_pattern)) return false
    seen.add(e.url)
    return true
  })
  return { entries, complete: complete && entries.length > 0 }
}

// ── Venues and events ────────────────────────────────────────────────────────

const venueCache = new Map<string, string>()

async function findOrCreateVenue(db: DbClient, ev: ScrapedLocalEvent, city: string): Promise<string | null> {
  const slug = slugify(`${ev.venueName}-${city}`)
  const cached = venueCache.get(slug)
  if (cached) return cached
  const { data: existing } = await db.from('venues').select('id').eq('slug', slug).maybeSingle()
  if (existing) { venueCache.set(slug, existing.id); return existing.id }

  const { data, error } = await db
    .from('venues')
    .insert({ name: ev.venueName, slug, address: ev.address ?? 'See venue website', city, postcode: ev.postcode ?? '', country: 'GB', lat: ev.lat, lng: ev.lng })
    .select('id')
    .single()

  if (error) {
    if (error.code === '23505') {
      const { data: retry } = await db.from('venues').select('id').eq('slug', slug).maybeSingle()
      if (retry?.id) venueCache.set(slug, retry.id)
      return retry?.id ?? null
    }
    console.error(`[local-events] venue insert failed for "${ev.venueName}": ${error.message}`)
    return null
  }
  if (data?.id) venueCache.set(slug, data.id)
  return data?.id ?? null
}

/** The same show already on the site as a ticketed event (Ticketmaster, See Tickets…) is not added a second time. */
async function isTicketedDuplicate(db: DbClient, ev: ScrapedLocalEvent, city: string): Promise<boolean> {
  const t = new Date(ev.startDate).getTime()
  const { data } = await (db as unknown as Loose)
    .from('listed_events_with_venue')
    .select('title')
    .ilike('venue_city', city)
    .neq('category', 'local')
    .gte('start_date', new Date(t - 4 * 3_600_000).toISOString())
    .lte('start_date', new Date(t + 4 * 3_600_000).toISOString())
    .limit(60)
  return ((data ?? []) as Array<{ title: string }>).some(r => sameShow(r.title, ev.title))
}

async function upsertLocalEvent(db: DbClient, ev: ScrapedLocalEvent, source: LocalEventSource, city: string): Promise<'written' | 'error'> {
  const venueId = await findOrCreateVenue(db, ev, city)
  if (!venueId) return 'error'

  const idSuffix = createHash('md5').update(ev.sourceUrl).digest('hex').slice(0, 8)
  const slug = `${slugify(ev.title)}-${idSuffix}`
  const { error } = await db.from('events').upsert(
    {
      title: ev.title,
      slug,
      description: ev.description,
      category: 'local',
      venue_id: venueId,
      start_date: ev.startDate,
      image_url: ev.imageUrl,
      currency: 'GBP',
      own_ticket_url: ev.ticketUrl,
      status: ev.status as EventStatus,
      is_featured: false,
      source: source.event_source,
      source_url: ev.sourceUrl,
      last_synced_at: new Date().toISOString(),
    },
    { onConflict: 'source_url' },
  )
  if (error) {
    console.error(`[local-events] event upsert failed for "${ev.title}" (${ev.sourceUrl}): ${error.message}`)
    return 'error'
  }
  return 'written'
}

// ── Ledger ───────────────────────────────────────────────────────────────────

async function loadLedger(loose: Loose, sourceKey: string): Promise<Map<string, LedgerRow>> {
  const map = new Map<string, LedgerRow>()
  for (let from = 0; ; from += 1000) {
    const { data, error } = await loose.from('local_event_urls').select('url, state, checked_at, start_date').eq('source_key', sourceKey).range(from, from + 999)
    if (error || !data || data.length === 0) break
    for (const r of data as Array<LedgerRow & { url: string }>) map.set(r.url, { state: r.state, checked_at: r.checked_at, start_date: r.start_date })
    if (data.length < 1000) break
  }
  return map
}

async function writeLedger(loose: Loose, sourceKey: string, rows: Array<{ url: string; state: LedgerRow['state']; start_date?: string | null }>): Promise<void> {
  if (rows.length === 0) return
  const checked_at = new Date().toISOString()
  const { error } = await loose.from('local_event_urls').upsert(rows.map(r => ({ url: r.url, source_key: sourceKey, state: r.state, start_date: r.start_date ?? null, checked_at })), { onConflict: 'url' })
  if (error) console.error(`[local-events] ledger write failed for ${sourceKey}: ${error.message}`)
}

/** source_urls already on the site for this source (so an event we already list is refreshed, never mistaken for a duplicate). */
async function loadExistingUrls(loose: Loose, source: LocalEventSource): Promise<Set<string>> {
  const out = new Set<string>()
  for (let from = 0; ; from += 1000) {
    const { data } = await loose.from('events').select('source_url').eq('source', source.event_source).like('source_url', `${source.base_url}%`).range(from, from + 999)
    if (!data || data.length === 0) break
    for (const r of data as Array<{ source_url: string | null }>) if (r.source_url) out.add(r.source_url)
    if (data.length < 1000) break
  }
  return out
}

// ── Settings shared by every source ──────────────────────────────────────────

interface Settings { mode: 'off' | 'dry' | 'live'; cap: number }

async function loadSettings(loose: Loose): Promise<Settings> {
  const { data } = await loose.from('council_sync_state').select('mode, max_removals_per_run').eq('id', 1).maybeSingle()
  const st = data as { mode?: 'off' | 'dry' | 'live'; max_removals_per_run?: number } | null
  return { mode: st?.mode ?? 'dry', cap: Math.max(0, st?.max_removals_per_run ?? 20) }
}

function emptyStats(mode: Settings['mode'], action: SourceStats['action']): SourceStats {
  return {
    at: new Date().toISOString(), mode, action, discovered: 0, listComplete: false, fetched: 0, events: 0, duplicates: 0, noEvent: 0,
    past: 0, gone: 0, cancelled: 0, restored: 0, errors: 0, unseenLeft: 0, stoppedEarly: false, goneTitles: [],
  }
}

/** Shared by refresh and clean: set one event to cancelled (live mode only, within the per-run cap). */
async function cancelEvent(loose: Loose, id: string, title: string, stats: SourceStats, settings: Settings): Promise<void> {
  stats.gone++
  if (stats.goneTitles.length < 15) stats.goneTitles.push(title.slice(0, 80))
  if (settings.mode === 'live' && stats.cancelled < settings.cap) {
    stats.cancelled++   // counted before the write so parallel checks cannot overshoot the cap
    await loose.from('events').update({ status: 'cancelled', last_synced_at: new Date().toISOString() }).eq('id', id)
  } else if (settings.mode === 'live') {
    stats.detail = `removal cap of ${settings.cap} per run reached; the rest are removed on the next run`
  }
}

// ── Refresh one source ───────────────────────────────────────────────────────

async function refreshSource(db: DbClient, source: LocalEventSource, settings: Settings, deadline: number, seen: Set<string>): Promise<SourceStats> {
  const loose = db as unknown as Loose
  const stats = emptyStats(settings.mode, 'refresh')

  const found = source.discovery === 'sitemap' ? await discoverSitemap(source) : await discoverListing(source)
  stats.discovered = found.entries.length
  stats.listComplete = found.complete
  if (found.entries.length === 0) {
    stats.errors++
    stats.detail = 'could not read the site\'s event list this run; nothing changed'
    return stats
  }

  const ledger = await loadLedger(loose, source.key)
  const existingUrls = await loadExistingUrls(loose, source)
  const toFetch = chooseUrlsToFetch(found.entries, ledger, Date.now(), source.max_details_per_run)

  const now = Date.now()
  const written = new Set<string>()
  let knownChecked = 0, knownGone = 0, breakerTripped = false
  for (let i = 0; i < toFetch.length; i += DETAIL_CONCURRENCY) {
    if (Date.now() > deadline) { stats.stoppedEarly = true; break }
    const batch = toFetch.slice(i, i + DETAIL_CONCURRENCY)
    const pages = await Promise.all(batch.map(async url => ({ url, ...(await fetchWithStatus(url)) })))
    const ledgerRows: Array<{ url: string; state: LedgerRow['state']; start_date?: string | null }> = []

    await Promise.all(pages.map(async page => {
      stats.fetched++
      const wasEvent = ledger.get(page.url)?.state === 'event'
      if (wasEvent) knownChecked++
      if (page.status === 404 || page.status === 410) {
        ledgerRows.push({ url: page.url, state: 'gone' })
        const { data: ex } = await loose.from('events').select('id, title, status').eq('source_url', page.url).maybeSingle()
        const row = ex as { id: string; title: string; status: string } | null
        if (row && LIVE_STATUSES.includes(row.status)) {
          knownGone++
          // Systemic breaker: most known events vanishing together means the site changed shape, not that the events went.
          if (knownChecked >= 10 && knownGone / knownChecked > 0.6) breakerTripped = true
          if (breakerTripped) { stats.gone++; stats.detail = 'most known events returned 404 at once; assuming the site changed, nothing removed'; return }
          await cancelEvent(loose, row.id, row.title, stats, settings)
        } else {
          stats.gone++
        }
        return
      }
      if (!page.body) { stats.errors++; return }   // timeout / 403 / 5xx: say nothing, look again next time

      const ev = eventFromPage(page.body, page.url, source.city)
      if (!ev) { stats.noEvent++; ledgerRows.push({ url: page.url, state: 'noevent' }); return }
      if (new Date(ev.startDate).getTime() < now - 6 * 3_600_000) { stats.past++; ledgerRows.push({ url: page.url, state: 'past', start_date: ev.startDate }); return }

      const city = resolveEventCity(ev.city, source.city, { lat: ev.lat, lng: ev.lng })
      if (!city) {   // too far from every city we cover: not shown (and taken down if an earlier run had listed it)
        stats.noEvent++
        ledgerRows.push({ url: page.url, state: 'noevent', start_date: ev.startDate })
        if (existingUrls.has(page.url) && settings.mode === 'live') await loose.from('events').update({ status: 'cancelled', last_synced_at: new Date().toISOString() }).eq('source_url', page.url)
        return
      }
      const key = `${source.event_source}|${ev.title.toLowerCase().replace(/[^a-z0-9]+/g, '')}|${ev.startDate.slice(0, 10)}`
      if (seen.has(key)) { stats.duplicates++; ledgerRows.push({ url: page.url, state: 'noevent', start_date: ev.startDate }); return }
      seen.add(key)

      if (!existingUrls.has(ev.sourceUrl) && await isTicketedDuplicate(db, ev, city)) { stats.duplicates++; ledgerRows.push({ url: page.url, state: 'noevent', start_date: ev.startDate }); return }

      if (await upsertLocalEvent(db, ev, source, city) === 'written') {
        stats.events++
        ledgerRows.push({ url: page.url, state: 'event', start_date: ev.startDate })
      } else {
        stats.errors++
      }
    }))

    await writeLedger(loose, source.key, ledgerRows)
    for (const r of ledgerRows) written.add(r.url)
    await sleep(REQUEST_DELAY_MS)
  }

  stats.unseenLeft = found.entries.filter(e => !ledger.has(e.url) && !written.has(e.url)).length

  // Events the site no longer lists at all (only trusted when the whole list was read this run).
  if (found.complete && Date.now() < deadline) {
    const listed = new Set(found.entries.map(e => e.url))
    const { data: rows } = await loose.from('events')
      .select('id, title, source_url')
      .eq('source', source.event_source)
      .like('source_url', `${source.base_url}%`)
      .gte('start_date', new Date().toISOString())
      .in('status', LIVE_STATUSES)
      .order('last_synced_at', { ascending: true, nullsFirst: true })
      .limit(2000)
    const dropped = ((rows ?? []) as Array<{ id: string; title: string; source_url: string }>).filter(r => !listed.has(r.source_url)).slice(0, MAX_VERIFY_PER_SOURCE)
    await verifyEvents(loose, dropped, stats, settings, deadline)
  }
  return stats
}

/** Check events directly on their own page: 404/410 or a "cancelled" marker removes them; a live page is stamped as refreshed. */
async function verifyEvents(
  loose: Loose,
  rows: Array<{ id: string; title: string; source_url: string }>,
  stats: SourceStats,
  settings: Settings,
  deadline: number,
): Promise<{ checked: number; stillLive: number; unclear: number; cancelledByPage: number }> {
  const out = { checked: 0, stillLive: 0, unclear: 0, cancelledByPage: 0, gone: 0 }
  if (settings.mode === 'off') return out
  for (const row of rows) {
    if (Date.now() > deadline) { stats.stoppedEarly = true; break }
    const res = await fetchWithStatus(row.source_url)
    out.checked++
    await sleep(REQUEST_DELAY_MS)
    if (res.status === 404 || res.status === 410) {
      out.gone++
      if (out.checked >= 10 && out.gone / out.checked > 0.6) { stats.detail = 'most checked events returned 404; assuming the site changed, nothing removed'; break }
      await cancelEvent(loose, row.id, row.title, stats, settings)
      continue
    }
    if (!res.body) { out.unclear++; continue }
    const ev = eventFromPage(res.body, row.source_url, '')
    if (!ev) { out.unclear++; continue }
    if (ev.status === 'cancelled') {
      out.cancelledByPage++
      stats.gone++
      if (stats.goneTitles.length < 15) stats.goneTitles.push(row.title.slice(0, 80))
      if (settings.mode === 'live' && stats.cancelled < settings.cap) {
        await loose.from('events').update({ status: 'cancelled', last_synced_at: new Date().toISOString() }).eq('id', row.id)
        stats.cancelled++
      }
    } else {
      out.stillLive++
      if (settings.mode === 'live') {
        // A rescheduled event keeps its row; only its date moves.
        await loose.from('events').update({ start_date: ev.startDate, last_synced_at: new Date().toISOString() }).eq('id', row.id)
      }
    }
  }
  return out
}

// ── Clean one source: re-check every upcoming event it supplied ──────────────

async function cleanSource(db: DbClient, source: LocalEventSource, settings: Settings, deadline: number): Promise<SourceStats> {
  const loose = db as unknown as Loose
  const stats = emptyStats(settings.mode, 'clean')
  const { data: rows } = await loose.from('events')
    .select('id, title, source_url')
    .eq('source', source.event_source)
    .like('source_url', `${source.base_url}%`)
    .gte('start_date', new Date().toISOString())
    .in('status', LIVE_STATUSES)
    .order('last_synced_at', { ascending: true, nullsFirst: true })
    .limit(600)
  const list = (rows ?? []) as Array<{ id: string; title: string; source_url: string }>
  stats.discovered = list.length
  const result = await verifyEvents(loose, list, stats, settings, deadline)
  stats.fetched = result.checked
  stats.events = result.stillLive
  stats.errors = result.unclear
  stats.listComplete = !stats.stoppedEarly
  return stats
}

// ── sync_log ─────────────────────────────────────────────────────────────────

async function logRun(db: DbClient, label: string, startedAt: string, found: number, status: 'ok' | 'error', error?: string): Promise<void> {
  try {
    await db.from('sync_log').insert({ city: label, started_at: startedAt, completed_at: new Date().toISOString(), events_synced: found, status, error: error ?? null })
  } catch (err) {
    console.error(`[local-events] sync_log write failed for "${label}" (non-fatal):`, err)
  }
}

// ── Try a new source before saving it ────────────────────────────────────────

export interface CandidateSource {
  base_url: string
  discovery: 'listing' | 'sitemap'
  discovery_url: string
  detail_pattern: string
  sitemap_child_pattern?: string | null
  page_param?: string | null
  page_size?: number | null
}

export function slugKey(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

/** Reads a candidate site the way the sweep would and reports what it found, so a source is only saved if it works. */
export async function probeCandidateSource(c: CandidateSource, city: string): Promise<{
  discovered: number
  complete: boolean
  sample: Array<{ url: string; ok: boolean; title?: string; start?: string; venue?: string; city?: string; reason?: string }>
}> {
  const source: LocalEventSource = {
    id: 'probe', key: 'probe', city, label: 'probe', event_source: `${slugKey(city)}_council`, base_url: c.base_url.replace(/\/$/, ''),
    discovery: c.discovery, discovery_url: c.discovery_url, detail_pattern: c.detail_pattern,
    sitemap_child_pattern: c.sitemap_child_pattern || null, page_param: c.page_param || null, page_size: c.page_size ?? null,
    max_pages: 3, max_details_per_run: 0, enabled: true, last_run_at: null, last_stats: null,
  }
  const found = source.discovery === 'sitemap' ? await discoverSitemap(source) : await discoverListing(source)
  const step = Math.max(1, Math.floor(found.entries.length / 6))
  const picks = found.entries.filter((_, i) => i % step === 0).slice(0, 6)
  const sample = await Promise.all(picks.map(async e => {
    const res = await fetchWithStatus(e.url)
    if (!res.body) return { url: e.url, ok: false, reason: `HTTP ${res.status ?? 'no response'}` }
    const ev = eventFromPage(res.body, e.url, city)
    if (!ev) return { url: e.url, ok: false, reason: 'page has no schema.org Event markup' }
    return { url: e.url, ok: true, title: ev.title, start: ev.startDate, venue: ev.venueName, city: resolveEventCity(ev.city, city, { lat: ev.lat, lng: ev.lng }) ?? '(outside our cities)' }
  }))
  return { discovered: found.entries.length, complete: found.complete, sample }
}

// ── Entry point ──────────────────────────────────────────────────────────────

export interface SweepOptions {
  city?: string
  key?: string
  /** 'refresh' (default) reads new/due pages and removes dead events; 'clean' only re-checks the events already on the site. */
  action?: 'refresh' | 'clean'
  budgetMs?: number
}

export interface CouncilVerifyResult {
  mode: 'off' | 'dry' | 'live'
  status: 'skipped' | 'done'
  detail?: string
  candidates: number
  stillLive: number
  gone: number
  cancelledByCouncil: number
  unclear: number
  goneTitles: string[]
}

export async function syncCouncilEvents(opts: SweepOptions = {}): Promise<{
  sources: Array<{ key: string; label: string; city: string } & SourceStats>
  verify?: CouncilVerifyResult
  note?: string
}> {
  const db = createAdminClient()
  const loose = db as unknown as Loose
  const settings = await loadSettings(loose)
  const sources = await loadSources(db, { city: opts.city, key: opts.key })
  const deadline = Date.now() + (opts.budgetMs ?? DEFAULT_BUDGET_MS)
  const action = opts.action ?? 'refresh'
  const seen = new Set<string>()   // same event on two sites of one source (Derby Market Hall + Derby LIVE) is written once per run
  const results: Array<{ key: string; label: string; city: string } & SourceStats> = []

  for (const source of sources) {
    if (Date.now() > deadline) break
    const startedAt = new Date().toISOString()
    let stats: SourceStats
    try {
      stats = action === 'clean' ? await cleanSource(db, source, settings, deadline) : await refreshSource(db, source, settings, deadline, seen)
      await logRun(db, `council:${source.key}`, startedAt, stats.events, stats.errors > 0 && stats.events === 0 ? 'error' : 'ok')
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error(`[local-events] fatal error in "${source.label}":`, message)
      stats = { ...emptyStats(settings.mode, action), errors: 1, detail: `failed: ${message.slice(0, 200)}` }
      await logRun(db, `council:${source.key}`, startedAt, 0, 'error', message)
    }
    await loose.from('local_event_sources').update({ last_run_at: new Date().toISOString(), last_stats: stats }).eq('id', source.id)
    results.push({ key: source.key, label: source.label, city: source.city, ...stats })
  }

  const verify: CouncilVerifyResult = {
    mode: settings.mode,
    status: results.length ? 'done' : 'skipped',
    detail: results.length ? undefined : 'no sources ran',
    candidates: results.reduce((n, r) => n + r.fetched, 0),
    stillLive: results.reduce((n, r) => n + r.events, 0),
    gone: results.reduce((n, r) => n + r.gone, 0),
    cancelledByCouncil: results.reduce((n, r) => n + r.cancelled, 0),
    unclear: results.reduce((n, r) => n + r.errors, 0),
    goneTitles: results.flatMap(r => r.goneTitles).slice(0, 15),
  }
  try {
    await loose.from('council_sync_state').update({ last_stats: { ...verify, at: new Date().toISOString(), action, sources: results.length } }).eq('id', 1)
  } catch (err) {
    console.error('[local-events] could not save summary (non-fatal):', err instanceof Error ? err.message : err)
  }
  return { sources: results, verify, note: results.length < sources.length ? `time budget reached: ${sources.length - results.length} source(s) left for the next run` : undefined }
}
