// StubHub International event catalog (Impact catalog 17571): nightly import of UK shows, matching to site events,
// and the StubHub button on each matched event (a direct link to that StubHub event plus "from £X").
// Matching uses the same tested rules as See Tickets (src/lib/seeTicketsMatchRules.ts).
import { createAdminClient } from '@/lib/supabase/admin'
import { LIVE_EVENT_STATUSES } from '@/lib/listedEvents'
import { fetchAllPages } from '@/lib/pagedFetch'
import { chooseEventUrl, dateOnly, decide, type LinkedRow, type StEvent, type StRow } from '@/lib/seeTicketsMatchRules'
import { ukToday } from '@/lib/ukTime'

const CATALOG_ID = process.env.STUBHUB_IMPACT_CATALOG_ID || '17571'
// The catalog prices in US dollars; shown in pounds. Override with STUBHUB_USD_PER_GBP if the rate drifts.
const USD_PER_GBP = Number(process.env.STUBHUB_USD_PER_GBP) || 1.27
const REMOVAL_GRACE_MS = 30 * 3_600_000
const MIN_FEED_SHARE = 0.7

type Db = ReturnType<typeof createAdminClient>
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = { from: (table: string) => any }
type Page<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>

export type StubHubRow = {
  id: string; name: string; parent_name: string | null; category: string | null; labels: string[]
  event_start: string | null; event_date: string | null; event_time: string | null
  venue: string | null; city: string | null; url: string; min_price_usd: number | null; image_url: string | null
}

function credentials() {
  const sid = (process.env.IMPACT_ACCOUNT_SID ?? '').trim().replace(/^['"]|['"]$/g, '')
  const token = (process.env.IMPACT_AUTH_TOKEN ?? '').trim().replace(/^['"]|['"]$/g, '')
  if (!sid || !token) throw new Error('IMPACT_ACCOUNT_SID / IMPACT_AUTH_TOKEN not set')
  return { sid, auth: 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64') }
}

/** StubHub's own event page on the UK site; the Impact tracking is added by the /out/sh hop. */
export function ukEventUrl(impactUrl: string): string | null {
  try {
    const dest = new URL(impactUrl).searchParams.get('u')
    if (!dest) return null
    const u = new URL(dest)
    if (!/(^|\.)stubhub\.[a-z.]+$/i.test(u.hostname) || !/\/event\/\d+/.test(u.pathname)) return null
    return `https://www.stubhub.co.uk${u.pathname}`
  } catch { return null }
}

/** One catalog item to a row, or null when it is not a future UK show. */
export function toRow(item: Record<string, unknown>): StubHubRow | null {
  let place: { country_code?: string; city_name?: string; venue_name?: string } = {}
  try { place = JSON.parse(String(item.Text1 ?? '{}')) } catch { return null }
  if ((place.country_code ?? '').toUpperCase() !== 'GB') return null
  const start = String(item.Text3 ?? '')
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(start)
  if (!m) return null
  const url = ukEventUrl(String(item.Url ?? ''))
  const id = String(item.CatalogItemId ?? '')
  if (!url || !id) return null
  const price = Number(item.CurrentPrice)
  return {
    id, name: String(item.Name ?? '').trim(), parent_name: String(item.ParentName ?? '').trim() || null,
    category: String(item.Category ?? '') || null, labels: Array.isArray(item.Labels) ? (item.Labels as unknown[]).map(String) : [],
    event_start: new Date(start).toISOString(), event_date: m[1], event_time: m[2] === '00:00' ? null : m[2],
    venue: place.venue_name?.trim() || null, city: place.city_name?.trim() || null, url,
    min_price_usd: Number.isFinite(price) && price > 0 ? price : null,
    image_url: String(item.ImageUrl ?? '') || null,
  }
}

export function poundsFrom(usd: number | null): number | null {
  return usd && usd > 0 ? Math.round(usd / USD_PER_GBP) : null
}

export type StubHubSyncResult = {
  scanned: number; uk: number; complete: boolean; inserted: number; updated: number; errors: number
  gone: number; reappeared: number; durationMs: number; detail?: string
}

export async function syncStubHubCatalogue(options: { deadlineMs?: number } = {}): Promise<StubHubSyncResult> {
  const t0 = Date.now()
  const { sid, auth } = credentials()
  const deadline = options.deadlineMs ?? t0 + 200_000
  const rows = new Map<string, StubHubRow>()
  let scanned = 0
  let next: string | null = `/Mediapartners/${sid}/Catalogs/${CATALOG_ID}/Items?PageSize=1000&Page=1`
  const today = ukToday()
  while (next) {
    if (Date.now() > deadline) break
    const res = await fetch(`https://api.impact.com${next}`, { headers: { Authorization: auth, Accept: 'application/json' }, cache: 'no-store' })
    if (!res.ok) throw new Error(`Impact catalog returned ${res.status}: ${(await res.text()).slice(0, 200)}`)
    const body = await res.json() as { Items?: Record<string, unknown>[]; '@nextpageuri'?: string }
    for (const item of body.Items ?? []) {
      scanned++
      const row = toRow(item)
      if (row && row.event_date && row.event_date >= today) rows.set(row.id, row)
    }
    next = body['@nextpageuri'] || null
  }
  const complete = !next
  const db = createAdminClient() as unknown as Loose
  const ids = [...rows.keys()]
  const existing = new Map<string, Record<string, unknown>>()
  for (let i = 0; i < ids.length; i += 500) {
    const { data, error } = await db.from('stubhub_catalogue_events').select('id, name, parent_name, event_start, venue, city, url, min_price_usd, gone_at').in('id', ids.slice(i, i + 500))
    if (error) throw new Error(`Could not read stubhub_catalogue_events: ${error.message}`)
    for (const r of data ?? []) existing.set(r.id, r)
  }
  const now = new Date().toISOString()
  const result: StubHubSyncResult = { scanned, uk: rows.size, complete, inserted: 0, updated: 0, errors: 0, gone: 0, reappeared: 0, durationMs: 0 }
  const all = [...rows.values()]
  for (let i = 0; i < all.length; i += 200) {
    const batch = all.slice(i, i + 200).map(r => {
      const old = existing.get(r.id)
      const reappeared = Boolean(old?.gone_at)
      if (reappeared) result.reappeared++
      if (old) result.updated++; else result.inserted++
      // A changed name / place / time sends the row back for matching.
      const moved = old && (old.name !== r.name || old.venue !== r.venue || old.city !== r.city || new Date(String(old.event_start)).getTime() !== new Date(r.event_start!).getTime())
      return { ...r, last_seen_at: now, ...(reappeared ? { gone_at: null } : {}), ...(moved ? { match_status: 'pending', match_checked_at: null } : {}) }
    })
    const { error } = await db.from('stubhub_catalogue_events').upsert(batch, { onConflict: 'id', ignoreDuplicates: false })
    if (error) { result.errors += batch.length; console.error('[stubhub] upsert failed:', error.message) }
  }
  // Rows the catalog has stopped listing: only after a complete read that looks whole, and unseen for a day+.
  if (complete) {
    const held = await fetchAllPages<{ id: string; last_seen_at: string }>((from, to) =>
      db.from('stubhub_catalogue_events').select('id, last_seen_at').gte('event_date', today).is('gone_at', null).order('id', { ascending: true }).range(from, to) as Page<{ id: string; last_seen_at: string }>)
    if (held.length > 100 && rows.size < held.length * MIN_FEED_SHARE) {
      result.detail = `catalog has ${rows.size} UK rows against ${held.length} held; looks incomplete, nothing removed`
    } else {
      const cutoff = Date.now() - REMOVAL_GRACE_MS
      const gone = held.filter(h => !rows.has(h.id) && new Date(h.last_seen_at).getTime() < cutoff).map(h => h.id)
      for (let i = 0; i < gone.length; i += 200) {
        const { error } = await db.from('stubhub_catalogue_events').update({ gone_at: now }).in('id', gone.slice(i, i + 200))
        if (!error) result.gone += Math.min(200, gone.length - i)
      }
    }
  } else {
    result.detail = 'time limit reached before the whole catalog was read; nothing removed'
  }
  result.durationMs = Date.now() - t0
  return result
}

type CatRow = { id: string; name: string; parent_name: string | null; event_date: string | null; event_time: string | null; venue: string | null; city: string | null; url: string; matched_event_id: string | null; match_status: string; match_checked_at: string | null }
type SiteEvent = StEvent & { created_at: string }

async function loadEvents(db: Db): Promise<SiteEvent[]> {
  const now = new Date().toISOString()
  const events: SiteEvent[] = []
  let last: string | null = null
  for (;;) {
    let q = db.from('events').select('id, title, start_date, created_at, venue:venues(name, city)').gte('start_date', now).in('status', LIVE_EVENT_STATUSES).order('id', { ascending: true }).limit(1000)
    if (last) q = q.gt('id', last)
    const { data, error } = await q as unknown as { data: SiteEvent[] | null; error: { message: string } | null }
    if (error) throw new Error(error.message)
    const rows = data ?? []
    events.push(...rows)
    if (rows.length < 1000) break
    last = rows[rows.length - 1].id
  }
  const hidden = new Set((await fetchAllPages<{ id: string }>((from, to) =>
    db.from('event_canonical_map').select('id').eq('is_canonical', false).order('id', { ascending: true }).range(from, to) as unknown as Page<{ id: string }>,
  )).map(r => r.id))
  return events.filter(e => !hidden.has(e.id))
}

export type StubHubMatchResult = {
  checked: number; autoMatched: number; review: number; noMatch: number; unchanged: number; errors: number
  dryRun: boolean; samples: string[]; links?: StubHubLinkResult; durationMs: number
}

export async function matchStubHubCatalogue(options: { full?: boolean; dryRun?: boolean; deadlineMs?: number } = {}): Promise<StubHubMatchResult> {
  const t0 = Date.now()
  const dryRun = options.dryRun ?? false
  const db = createAdminClient()
  const loose = db as unknown as Loose
  const today = ukToday()
  const rows = await fetchAllPages<CatRow>((from, to) =>
    loose.from('stubhub_catalogue_events').select('id, name, parent_name, event_date, event_time, venue, city, url, matched_event_id, match_status, match_checked_at')
      .is('gone_at', null).gte('event_date', today).in('match_status', ['pending', 'review', 'no_match', 'auto_matched']).order('id', { ascending: true }).range(from, to) as Page<CatRow>)
  const events = await loadEvents(db)
  const linkable = new Set(events.map(e => e.id))
  const byDate = new Map<string, SiteEvent[]>()
  const newest = new Map<string, number>()
  for (const e of events) {
    const k = dateOnly(e.start_date)
    const list = byDate.get(k); if (list) list.push(e); else byDate.set(k, [e])
    newest.set(k, Math.max(newest.get(k) ?? 0, new Date(e.created_at).getTime()))
  }
  const out: StubHubMatchResult = { checked: 0, autoMatched: 0, review: 0, noMatch: 0, unchanged: 0, errors: 0, dryRun, samples: [], durationMs: 0 }
  const writes: Array<{ id: string; patch: Record<string, unknown> }> = []
  const stamp: string[] = []
  for (const row of rows) {
    if (options.deadlineMs && Date.now() > options.deadlineMs) break
    if (!options.full && row.match_status === 'auto_matched' && row.matched_event_id && linkable.has(row.matched_event_id)) { out.unchanged++; continue }
    if (!options.full && row.match_status === 'no_match' && row.match_checked_at) {
      const checked = new Date(row.match_checked_at).getTime()
      if (Date.now() - checked < 7 * 86_400_000 && (newest.get(row.event_date ?? '') ?? 0) <= checked) { out.unchanged++; continue }
    }
    out.checked++
    const st: StRow = { id: row.id, name: row.name, event_date: row.event_date, event_time: row.event_time, venue: row.venue, city: row.city, primary_artist: row.parent_name, second_artist: null, url: row.url }
    const { status, best } = decide(st, byDate.get(row.event_date ?? '') ?? [])
    if (status === 'auto_matched') out.autoMatched++; else if (status === 'review') out.review++; else out.noMatch++
    const target = status === 'auto_matched' ? best!.event.id : null
    if (out.samples.length < 40 && status !== 'no_match') out.samples.push(`${status}: ${row.name} ${row.event_date} @ ${row.venue} => ${best ? `${best.event.title} (${Math.round(best.detail.value * 100)}%)` : '-'}`)
    if (row.match_status === status && row.matched_event_id === target) { stamp.push(row.id); continue }
    writes.push({ id: row.id, patch: {
      matched_event_id: target, match_status: status,
      match_confidence: best ? Number(best.detail.value.toFixed(3)) : null,
      match_reason: best ? `${best.event.title} (${Math.round(best.detail.value * 100)}% match)` : 'No close Showfinder event found',
      match_checked_at: new Date().toISOString(),
    } })
  }
  if (!dryRun) {
    for (let i = 0; i < writes.length; i += 25) {
      const res = await Promise.all(writes.slice(i, i + 25).map(w => loose.from('stubhub_catalogue_events').update(w.patch).eq('id', w.id)))
      for (const r of res) if (r.error) out.errors++
    }
    const at = new Date().toISOString()
    for (let i = 0; i < stamp.length; i += 200) await loose.from('stubhub_catalogue_events').update({ match_checked_at: at }).in('id', stamp.slice(i, i + 200))
  }
  out.links = await reconcileStubHubLinks({ dryRun })
  out.durationMs = Date.now() - t0
  return out
}

export type StubHubLinkResult = { set: number; changed: number; cleared: number; samples: string[] }

/** Makes each future event's StubHub link and "from £" price agree with the catalog rows matched to it. */
export async function reconcileStubHubLinks(options: { dryRun?: boolean } = {}): Promise<StubHubLinkResult> {
  const db = createAdminClient() as unknown as Loose
  const today = ukToday()
  type Row = { id: string; url: string; event_time: string | null; matched_event_id: string | null; match_status: string; gone_at: string | null; min_price_usd: number | null }
  const rows = await fetchAllPages<Row>((from, to) =>
    db.from('stubhub_catalogue_events').select('id, url, event_time, matched_event_id, match_status, gone_at, min_price_usd').gte('event_date', today).order('id', { ascending: true }).range(from, to) as Page<Row>)
  const feedUrls = new Set(rows.map(r => r.url))
  const priceByUrl = new Map(rows.map(r => [r.url, r.min_price_usd]))
  const byEvent = new Map<string, LinkedRow[]>()
  for (const r of rows) {
    if (r.gone_at || !r.matched_event_id || !['auto_matched', 'approved_existing'].includes(r.match_status)) continue
    const list = byEvent.get(r.matched_event_id) ?? []
    list.push({ id: r.id, url: r.url, event_time: r.event_time, manual: r.match_status !== 'auto_matched' })
    byEvent.set(r.matched_event_id, list)
  }
  type Ev = { id: string; title: string; start_date: string; status: string; stubhub_url: string | null; stubhub_from: number | null }
  const now = new Date().toISOString()
  const withLink = await fetchAllPages<Ev>((from, to) =>
    db.from('events').select('id, title, start_date, status, stubhub_url, stubhub_from').gte('start_date', now).not('stubhub_url', 'is', null).order('id', { ascending: true }).range(from, to) as Page<Ev>)
  const known = new Map(withLink.map(e => [e.id, e]))
  const missing = [...byEvent.keys()].filter(id => !known.has(id))
  for (let i = 0; i < missing.length; i += 200) {
    const { data } = await db.from('events').select('id, title, start_date, status, stubhub_url, stubhub_from').in('id', missing.slice(i, i + 200))
    for (const e of (data ?? []) as Ev[]) known.set(e.id, e)
  }
  const out: StubHubLinkResult = { set: 0, changed: 0, cleared: 0, samples: [] }
  const writes: Array<{ id: string; from: string | null; url: string | null; price: number | null; title: string }> = []
  for (const e of known.values()) {
    if (new Date(e.start_date).getTime() < Date.now()) continue
    const linked = byEvent.get(e.id)
    if (linked && LIVE_EVENT_STATUSES.includes(e.status)) {
      const url = chooseEventUrl(e.stubhub_url, e.start_date, linked)
      const price = url ? poundsFrom(priceByUrl.get(url) ?? null) : null
      if (url !== e.stubhub_url || price !== (e.stubhub_from === null ? null : Number(e.stubhub_from))) writes.push({ id: e.id, from: e.stubhub_url, url, price, title: e.title })
    } else if (!linked && e.stubhub_url && feedUrls.has(e.stubhub_url)) {
      writes.push({ id: e.id, from: e.stubhub_url, url: null, price: null, title: e.title })
    }
  }
  for (const w of writes) {
    if (w.url === null) out.cleared++; else if (w.from === null) out.set++; else out.changed++
    if (out.samples.length < 30) out.samples.push(`${w.url === null ? 'clear' : w.from === null ? 'set' : 'update'}: ${w.title}${w.price ? ` from £${w.price}` : ''}`)
  }
  if (!options.dryRun) {
    for (let i = 0; i < writes.length; i += 25) {
      await Promise.all(writes.slice(i, i + 25).map(w => {
        // Only change the link if nobody else changed it meanwhile; never touch a hand-entered non-catalog link.
        let q = db.from('events').update({ stubhub_url: w.url, stubhub_from: w.price }).eq('id', w.id)
        q = w.from === null ? q.is('stubhub_url', null) : q.eq('stubhub_url', w.from)
        return q
      }))
    }
  }
  return out
}
