// Matches See Tickets feed rows to site events, then makes every event's See Tickets button agree with the matches.
// Scoring rules: src/lib/seeTicketsMatchRules.ts (tested).
//   - Only events visitors can see are link targets: live, and canonical (never a "Venue Premium" / "- Restaurant" /
//     duplicate / merged copy: event_canonical_map). A row linked to such a copy, or to a cancelled event, is re-scored.
//   - Manual decisions (approved_existing, approved_new, rejected) are never re-scored, not even by a full rescan.
//   - The button is set by reconcileSeeTicketsLinks() after matching: the event shows one of the rows matched to it
//     (manual first, else the current one, else the closest start time), and a See Tickets link left on an event no
//     row is matched to any more is taken off. Links that never came from the feed are left alone.
import { createAdminClient } from '@/lib/supabase/admin'
import { LIVE_EVENT_STATUSES } from '@/lib/listedEvents'
import { fetchAllPages } from '@/lib/pagedFetch'
import { chooseEventUrl, dateOnly, decide, type LinkedRow, type StEvent, type StRow } from '@/lib/seeTicketsMatchRules'

type CatalogueRow = StRow & {
  matched_event_id: string | null
  match_checked_at: string | null
  match_status: string | null
}

type ShowfinderEvent = StEvent & { created_at: string }

export type SeeTicketsMatchResult = {
  checked: number
  skippedUnchanged?: number
  autoMatched: number
  review: number
  noMatch: number
  /** Auto-matched rows moved to another event (off a premium / cancelled copy, or to the right performance). */
  moved?: number
  errors: number
  dryRun?: boolean
  nextCursor?: string | null
  hasMore?: boolean
  /** Stopped at the time limit with rows left: run it again, nothing is lost (checked rows are not re-scored). */
  incomplete?: boolean
  timings?: { catalogueMs: number; eventsMs: number; processMs: number; catalogueRows: number; eventRows: number }
  stalledBatch?: boolean
  links?: ReconcileResult
  samples?: string[]
}

export type ReconcileResult = { set: number; changed: number; cleared: number; samples: string[] }

const MATCHABLE = ['pending', 'review', 'no_match', 'auto_matched']
const CATALOGUE_COLUMNS = 'id, name, event_date, event_time, venue, city, primary_artist, second_artist, url, matched_event_id, match_checked_at, match_status'
type Db = ReturnType<typeof createAdminClient>
type Page<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>

async function loadEvents(db: Db): Promise<ShowfinderEvent[]> {
  const now = new Date().toISOString()
  const events: ShowfinderEvent[] = []
  // Keyset pagination: OFFSET paging over ~30k events with a venue join hit the statement timeout.
  let last: string | null = null
  for (;;) {
    let q = db.from('events').select('id, title, start_date, created_at, venue:venues(name, city)').gte('start_date', now).in('status', LIVE_EVENT_STATUSES).order('id', { ascending: true }).limit(1000)
    if (last) q = q.gt('id', last)
    const { data, error } = await q as unknown as { data: ShowfinderEvent[] | null; error: { message: string } | null }
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

export async function matchSeeTicketsCatalogue(fullRescan = false, options: { limit?: number; afterId?: string; skipUnchanged?: boolean; deadlineMs?: number; maxRows?: number; dryRun?: boolean } = {}): Promise<SeeTicketsMatchResult> {
  const t0 = Date.now()
  const db = createAdminClient()
  const dryRun = options.dryRun ?? false
  const today = new Date().toISOString().slice(0, 10)
  const limit = options.limit && options.limit > 0 ? Math.min(options.limit, 500) : null
  const catalogue: CatalogueRow[] = []
  for (let offset = 0; ; offset += 1000) {
    // Rows the feed has stopped listing, and shows that have already happened, are never matched.
    let query = db.from('see_tickets_catalogue_events').select(CATALOGUE_COLUMNS).is('gone_at', null).in('match_status', MATCHABLE).gte('event_date', today).order('id', { ascending: true })
    if (options.afterId) query = query.gt('id', options.afterId)
    query = query.range(offset, offset + (limit ? limit : 999))
    const { data, error } = await query as unknown as { data: CatalogueRow[] | null; error: { message: string } | null }
    if (error) throw new Error(error.message)
    const rows = data ?? []
    catalogue.push(...rows)
    if (rows.length < (limit ? limit + 1 : 1000)) break
    if (limit) break
  }
  const tCatalogue = Date.now()
  const events = await loadEvents(db)
  const tEvents = Date.now()
  const linkable = new Set(events.map(e => e.id))
  const eventsByDate = new Map<string, ShowfinderEvent[]>()
  const newestCreated = new Map<string, number>()
  for (const event of events) {
    const key = dateOnly(event.start_date)
    const made = new Date(event.created_at).getTime()
    if (made > (newestCreated.get(key) ?? 0)) newestCreated.set(key, made)
    const bucket = eventsByDate.get(key)
    if (bucket) bucket.push(event); else eventsByDate.set(key, [event])
  }
  const hasMore = Boolean(limit && catalogue.length > limit)
  const rowsToProcess = limit ? catalogue.slice(0, limit) : catalogue
  const result: SeeTicketsMatchResult = {
    checked: 0, skippedUnchanged: 0, autoMatched: 0, review: 0, noMatch: 0, moved: 0, errors: 0, dryRun, hasMore,
    nextCursor: rowsToProcess.length ? rowsToProcess[rowsToProcess.length - 1].id : null,
    timings: { catalogueMs: tCatalogue - t0, eventsMs: tEvents - tCatalogue, processMs: 0, catalogueRows: catalogue.length, eventRows: events.length },
    samples: [],
  }
  console.log(`[see-tickets-matching] loaded ${catalogue.length} catalogue rows and ${events.length} linkable events`)
  const stampIds: string[] = []
  async function flushStamps() {
    if (!stampIds.length || dryRun) { stampIds.length = 0; return }
    const ids = stampIds.splice(0, stampIds.length)
    const stampedAt = new Date().toISOString()
    const writes: Array<PromiseLike<{ error: unknown }>> = []
    for (let i = 0; i < ids.length; i += 150) writes.push(db.from('see_tickets_catalogue_events').update({ match_checked_at: stampedAt }).in('id', ids.slice(i, i + 150)))
    for (const r of await Promise.all(writes)) if (r.error) result.errors += 1
  }
  type Outcome = { errors: number; autoMatched: number; review: number; noMatch: number; skipped: number; moved: number }
  const none: Outcome = { errors: 0, autoMatched: 0, review: 0, noMatch: 0, skipped: 0, moved: 0 }

  async function processItem(item: CatalogueRow): Promise<Outcome> {
    // An automatic link to an event visitors can still see is kept as it is, except on a full rescan.
    if (item.match_status === 'auto_matched' && !fullRescan && item.matched_event_id && linkable.has(item.matched_event_id)) return { ...none, skipped: 1 }
    const candidates = eventsByDate.get(dateOnly(item.event_date)) ?? []
    // Nightly: a recent 'no_match' stays 'no_match' unless a new event has appeared on its date since.
    if (options.skipUnchanged && item.match_status === 'no_match' && item.match_checked_at) {
      const checkedAt = new Date(item.match_checked_at).getTime()
      const fresh = Date.now() - checkedAt < 7 * 86_400_000
      const newOnDate = (newestCreated.get(dateOnly(item.event_date)) ?? 0) > checkedAt
      if (fresh && !newOnDate) return { ...none, skipped: 1 }
    }
    const { status, best } = decide(item, candidates)
    const target = status === 'auto_matched' ? best!.event.id : null
    const counts: Outcome = { ...none, autoMatched: status === 'auto_matched' ? 1 : 0, review: status === 'review' ? 1 : 0, noMatch: status === 'no_match' ? 1 : 0 }
    if (item.match_status === status && item.matched_event_id === target) {
      stampIds.push(item.id)
      return counts
    }
    if (item.match_status === 'auto_matched' && item.matched_event_id && target && item.matched_event_id !== target) counts.moved = 1
    if (dryRun) {
      if (result.samples!.length < 40 && (counts.moved || item.match_status === 'auto_matched' || status === 'auto_matched'))
        result.samples!.push(`${item.match_status}->${status}: ${item.name} ${item.event_date} ${item.event_time ?? ''} @ ${item.venue} => ${best ? `${best.event.title} (${Math.round(best.detail.value * 100)}%)` : '-'}`)
      return counts
    }
    const { error } = await db.from('see_tickets_catalogue_events').update({
      matched_event_id: target,
      match_status: status,
      match_confidence: best ? Number(best.detail.value.toFixed(3)) : null,
      match_reason: best ? `${best.event.title} (${Math.round(best.detail.value * 100)}% match)` : 'No close Showfinder event found',
      match_checked_at: new Date().toISOString(),
    }).eq('id', item.id)
    return error ? { ...none, errors: 1 } : counts
  }

  const batchSize = 50
  const tProcess = Date.now()
  let worked = 0
  for (let offset = 0; offset < rowsToProcess.length; offset += batchSize) {
    if (options.deadlineMs && Date.now() > options.deadlineMs) { result.incomplete = true; result.hasMore = true; break }
    if (options.maxRows && worked >= options.maxRows) { result.incomplete = true; result.hasMore = true; break }
    let timer: ReturnType<typeof setTimeout> | undefined
    const stalled = new Promise<'stalled'>(resolve => { timer = setTimeout(() => resolve('stalled'), 40_000) })
    const raced = await Promise.race([Promise.all(rowsToProcess.slice(offset, offset + batchSize).map(processItem)), stalled])
    clearTimeout(timer)
    if (raced === 'stalled') { result.errors += 1; result.stalledBatch = true; result.incomplete = true; result.hasMore = true; console.error(`[see-tickets-matching] batch at ${offset} stalled`); break }
    result.checked += raced.length
    for (const o of raced) {
      result.errors += o.errors
      result.autoMatched += o.autoMatched
      result.review += o.review
      result.noMatch += o.noMatch
      result.moved! += o.moved
      result.skippedUnchanged = (result.skippedUnchanged ?? 0) + o.skipped
      if (!o.skipped) worked++
    }
    await flushStamps()
  }
  result.timings!.processMs = Date.now() - tProcess
  await flushStamps()
  // Admin batches (limit) only see part of the catalogue; the buttons are put right once the whole run is done.
  if (!limit) result.links = await reconcileSeeTicketsLinks({ dryRun })
  console.log(`[see-tickets-matching] ${JSON.stringify({ ...result, samples: undefined })}`)
  return result
}

/** Makes each future event's See Tickets button agree with the feed rows matched to it. */
export async function reconcileSeeTicketsLinks(options: { dryRun?: boolean } = {}): Promise<ReconcileResult> {
  const db = createAdminClient()
  const today = new Date().toISOString().slice(0, 10)
  const now = new Date().toISOString()
  type Row = { id: string; url: string; event_time: string | null; matched_event_id: string | null; match_status: string; gone_at: string | null }
  const rows = await fetchAllPages<Row>((from, to) =>
    db.from('see_tickets_catalogue_events').select('id, url, event_time, matched_event_id, match_status, gone_at').gte('event_date', today).order('id', { ascending: true }).range(from, to) as unknown as Page<Row>)
  const feedUrls = new Set(rows.map(r => r.url))
  const byEvent = new Map<string, LinkedRow[]>()
  for (const r of rows) {
    if (r.gone_at || !r.matched_event_id || !['auto_matched', 'approved_existing', 'approved_new'].includes(r.match_status)) continue
    const list = byEvent.get(r.matched_event_id) ?? []
    list.push({ id: r.id, url: r.url, event_time: r.event_time, manual: r.match_status !== 'auto_matched' })
    byEvent.set(r.matched_event_id, list)
  }
  type Ev = { id: string; start_date: string; see_tickets_affiliate_url: string | null; status: string; title: string }
  const withLink = await fetchAllPages<Ev>((from, to) =>
    db.from('events').select('id, start_date, see_tickets_affiliate_url, status, title').gte('start_date', now).not('see_tickets_affiliate_url', 'is', null).order('id', { ascending: true }).range(from, to) as unknown as Page<Ev>)
  const known = new Map(withLink.map(e => [e.id, e]))
  const missing = [...byEvent.keys()].filter(id => !known.has(id))
  for (let i = 0; i < missing.length; i += 200) {
    const { data } = await db.from('events').select('id, start_date, see_tickets_affiliate_url, status, title').in('id', missing.slice(i, i + 200)) as unknown as { data: Ev[] | null }
    for (const e of data ?? []) known.set(e.id, e)
  }
  const out: ReconcileResult = { set: 0, changed: 0, cleared: 0, samples: [] }
  const writes: Array<{ id: string; url: string | null; from: string | null; title: string }> = []
  for (const e of known.values()) {
    if (new Date(e.start_date).getTime() < Date.now()) continue
    const linked = byEvent.get(e.id)
    if (linked && LIVE_EVENT_STATUSES.includes(e.status)) {
      const want = chooseEventUrl(e.see_tickets_affiliate_url, e.start_date, linked)
      if (want !== e.see_tickets_affiliate_url) writes.push({ id: e.id, url: want, from: e.see_tickets_affiliate_url, title: e.title })
    } else if (!linked && e.see_tickets_affiliate_url && feedUrls.has(e.see_tickets_affiliate_url)) {
      // A feed link no matched row backs up any more (moved to the right event, or the row went to review).
      writes.push({ id: e.id, url: null, from: e.see_tickets_affiliate_url, title: e.title })
    }
  }
  for (const w of writes) {
    if (w.url === null) out.cleared++; else if (w.from === null) out.set++; else out.changed++
    if (out.samples.length < 30) out.samples.push(`${w.url === null ? 'clear' : w.from === null ? 'set' : 'change'}: ${w.title}`)
  }
  if (!options.dryRun) {
    for (let i = 0; i < writes.length; i += 25) {
      await Promise.all(writes.slice(i, i + 25).map(w => {
        // Only change the link if nobody else changed it meanwhile.
        let q = db.from('events').update({ see_tickets_affiliate_url: w.url }).eq('id', w.id)
        q = w.from === null ? q.is('see_tickets_affiliate_url', null) : q.eq('see_tickets_affiliate_url', w.from)
        return q
      }))
    }
  }
  return out
}
