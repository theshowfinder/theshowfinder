// National Ticketmaster sweep + exact verification of anything the sweep did not see.
//
// Why: the older main pass visits one city and one 90-day window per run, so a full lap of the
// country takes about a year and most listings are never refreshed. This sweep asks Ticketmaster
// for the whole UK by date window, halving any window that holds more than one query can return,
// so one lap is a few hundred API calls and can run every day. Events Ticketmaster no longer
// lists are then checked one by one (or in id batches); only a confirmed "not found" removes one.
import { isAttraction } from './eventMix.ts'
import { isPackageOrClassTitle } from './eventTitles.ts'
import { MAX_PERFORMANCES_PER_DAY, londonDay, normalizeSlotTitle } from './timeSlotCap.ts'
import { createAdminClient } from '@/lib/supabase/admin'
import type { EventCategory } from '@/lib/types/database'
import {
  EVENT_CONCURRENCY, EXISTING_EVENT_COLUMNS, RATE_LIMIT_MS, SEGMENT_QUERIES, TM_BASE,
  fetchTMPage, processEvent, sleep,
  type DbClient, type ExistingEventSnapshot, type TMEvent,
} from '@/lib/ticketmaster'
import {
  chunkEnd, decideCycle, horizonEnd, mayMarkGone, needsSplit, pagesNeeded, splitWindow,
  MAX_QUERY_RESULTS, type SweepCursor,
} from '@/lib/tmSweepPlan'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = { from: (table: string) => any; rpc: (fn: string) => Promise<{ error: unknown }> }

interface StateRow {
  mode: 'off' | 'dry' | 'live'
  max_removals_per_run: number
  segment_index: number
  window_start: string | null
  cycle_started_at: string | null
  completed_at: string | null
  completed_cycle_started_at: string | null
  running_since: string | null
}

const LOCK_STALE_MS = 6 * 60_000
const STOP_MARGIN_MS = 25_000          // never start a window with less than this left
const ID_BATCH = 50
const fmt = (ms: number) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z')

export interface SweepStats {
  windows: number
  splits: number
  pages: number
  seen: number
  changed: number
  unchanged: number
  errors: number
  failedWindows: number
  truncatedWindows: number
  /** Dry run only: events Ticketmaster returned that are not in our database yet / already are. */
  wouldInsert: number
  alreadyKnown: number
  /** Dry run only: how many of the would-insert events look like attraction tickets / packages, and a spread of examples. */
  newAttractionLike?: number
  newPackageLike?: number
  /** Dry run only: new events a live run would skip because they are extra time slots (same title, venue and day). */
  wouldSkipTimeSlots?: number
  sampleNew?: string[]
}

export interface SweepResult {
  mode?: 'off' | 'dry' | 'live'
  status: 'busy' | 'idle' | 'disabled' | 'partial' | 'complete' | 'rate_limited'
  detail?: string
  segment: string | null
  cycleStartedAt: string | null
  stats: SweepStats
  durationMs: number
}

const emptyStats = (): SweepStats => ({ windows: 0, splits: 0, pages: 0, seen: 0, changed: 0, unchanged: 0, errors: 0, failedWindows: 0, truncatedWindows: 0, wouldInsert: 0, alreadyKnown: 0 })

async function touchAll(loose: Loose, ids: string[]) {
  const nowIso = new Date().toISOString()
  for (let i = 0; i < ids.length; i += 100) {
    const { error } = await loose.from('events').update({ last_synced_at: nowIso }).in('id', ids.slice(i, i + 100))
    if (error) console.error('[sweep] batch freshness update failed:', error.message)
  }
}

/** Process a list of Ticketmaster events with one existing-row lookup per 100 and batched freshness updates. */
async function processEvents(
  db: DbClient,
  events: TMEvent[],
  categoryFor: (ev: TMEvent) => EventCategory,
  venueCache: Map<string, string>,
  artistCache: Map<string, string>,
  stats: Pick<SweepStats, 'changed' | 'unchanged' | 'errors'>,
): Promise<void> {
  const loose = db as unknown as Loose
  const eventCache = new Map<string, ExistingEventSnapshot | null>()
  for (let i = 0; i < events.length; i += 100) {
    const ids = events.slice(i, i + 100).map(e => e.id)
    const { data, error } = await loose.from('events').select(EXISTING_EVENT_COLUMNS).in('ticketmaster_id', ids)
    if (error) continue   // fall back to the per-event lookup inside upsertEvent
    const found = new Map<string, ExistingEventSnapshot>()
    for (const row of (data ?? []) as ExistingEventSnapshot[]) if (row.ticketmaster_id) found.set(row.ticketmaster_id, row)
    for (const id of ids) eventCache.set(id, found.get(id) ?? null)
  }
  const touchIds: string[] = []
  for (let i = 0; i < events.length; i += EVENT_CONCURRENCY) {
    const chunk = events.slice(i, i + EVENT_CONCURRENCY)
    const outcomes = await Promise.all(chunk.map(ev => processEvent(db, ev, categoryFor(ev), venueCache, artistCache, eventCache, touchIds)))
    for (const o of outcomes) {
      if (o === 'inserted' || o === 'updated') stats.changed++
      else if (o === 'error') stats.errors++
    }
  }
  stats.unchanged += touchIds.length
  await touchAll(loose, touchIds)
}

/** Dry run: look the page up in our database and count what a live run would add. Writes nothing. */
const slotCounts = new Map<string, number>()

async function countPage(db: DbClient, events: TMEvent[], stats: Pick<SweepStats, 'wouldInsert' | 'alreadyKnown' | 'newAttractionLike' | 'newPackageLike' | 'sampleNew' | 'wouldSkipTimeSlots'>): Promise<void> {
  const loose = db as unknown as Loose
  for (let i = 0; i < events.length; i += 100) {
    const ids = events.slice(i, i + 100).map(e => e.id)
    const { data, error } = await loose.from('events').select('ticketmaster_id').in('ticketmaster_id', ids)
    if (error) continue
    const known = new Set(((data ?? []) as Array<{ ticketmaster_id: string }>).map(r => r.ticketmaster_id))
    const byId = new Map(events.slice(i, i + 100).map(e => [e.id, e]))
    for (const id of ids) {
      if (known.has(id)) { stats.alreadyKnown++; continue }
      const ev = byId.get(id)
      const name = ev?.name ?? ''
      const venue = ev?._embedded?.venues?.[0]
      const venueName = venue?.name ?? ''
      const startIso = ev?.dates?.start?.dateTime ?? ev?.dates?.start?.localDate ?? ''
      const slotKey = `${venue?.id ?? venueName}|${normalizeSlotTitle(name)}|${startIso ? londonDay(startIso) : ''}`
      const slotCount = (slotCounts.get(slotKey) ?? 0) + 1
      slotCounts.set(slotKey, slotCount)
      if (slotCount > MAX_PERFORMANCES_PER_DAY) { stats.wouldSkipTimeSlots = (stats.wouldSkipTimeSlots ?? 0) + 1; continue }
      stats.wouldInsert++
      if (isAttraction({ title: name, venue_name: venueName })) stats.newAttractionLike = (stats.newAttractionLike ?? 0) + 1
      if (isPackageOrClassTitle(name)) stats.newPackageLike = (stats.newPackageLike ?? 0) + 1
      const sample = (stats.sampleNew ??= [])
      if (sample.length < 12 || (stats.wouldInsert % 150 === 0 && sample.length < 60)) {
        sample.push(`${name} | ${venueName} | ${ev?.dates?.start?.localDate ?? ''}`.slice(0, 120))
      }
    }
  }
}

async function recalcFlags(db: DbClient) {
  try {
    const { error } = await (db as unknown as Loose).rpc('calculate_event_flags')
    if (error) console.error('[sweep] flag calculation failed:', error)
  } catch (e) {
    console.error('[sweep] flag calculation threw:', e)
  }
}

export async function runTicketmasterSweep(opts: { deadlineMs: number }): Promise<SweepResult> {
  slotCounts.clear()   // dry-run time-slot accounting is per run
  const t0 = Date.now()
  const db = createAdminClient()
  const loose = db as unknown as Loose
  const stats = emptyStats()
  const result = (status: SweepResult['status'], extra: Partial<SweepResult> = {}): SweepResult =>
    ({ status, segment: null, cycleStartedAt: null, stats, durationMs: Date.now() - t0, ...extra })

  // Claim the single-row lock; a second overlapping invocation backs off.
  const staleLock = new Date(Date.now() - LOCK_STALE_MS).toISOString()
  const claim = await loose.from('tm_sweep_state').update({ running_since: new Date().toISOString() })
    .eq('id', 1).or(`running_since.is.null,running_since.lt.${staleLock}`).select('*')
  const row = (claim.data?.[0] ?? null) as StateRow | null
  if (!row) return result('busy', { detail: claim.error?.message ?? 'another sweep run holds the lock' })

  const mode = row.mode ?? 'dry'
  if (mode === 'off') {
    await loose.from('tm_sweep_state').update({ running_since: null }).eq('id', 1)
    return result('disabled', { mode, detail: 'sweep switched off in tm_sweep_state.mode' })
  }
  const dry = mode === 'dry'

  let segIdx = row.segment_index
  let cursorMs = row.window_start ? new Date(row.window_start).getTime() : Date.now()
  let cycleStarted = row.cycle_started_at
  let completedAt = row.completed_at
  let completedCycleStartedAt = row.completed_cycle_started_at
  let status: SweepResult['status'] = 'partial'
  let detail: string | undefined

  const persist = async (extra: Record<string, unknown> = {}) => {
    await loose.from('tm_sweep_state').update({
      segment_index: segIdx, window_start: new Date(cursorMs).toISOString(), cycle_started_at: cycleStarted,
      completed_at: completedAt, completed_cycle_started_at: completedCycleStartedAt, ...extra,
    }).eq('id', 1)
  }

  try {
    const cursor: SweepCursor = { segmentIndex: segIdx, windowStart: row.window_start, cycleStartedAt: cycleStarted, completedAt }
    const decision = decideCycle(cursor, new Date())
    if (decision.action === 'idle') {
      status = 'idle'; detail = decision.reason
    } else {
      if (decision.action === 'start') {
        segIdx = 0; cursorMs = Date.now(); cycleStarted = new Date(cursorMs).toISOString()
        await persist()
      }
      const cycleStartMs = new Date(cycleStarted as string).getTime()
      const hEnd = horizonEnd(new Date(cycleStartMs)).getTime()
      const venueCache = new Map<string, string>()
      const artistCache = new Map<string, string>()

      sweepLoop:
      while (segIdx < SEGMENT_QUERIES.length) {
        const seg = SEGMENT_QUERIES[segIdx]
        const stack: Array<[number, number]> = [[cursorMs, chunkEnd(cursorMs, hEnd)]]
        const chunkEndMs = stack[0][1]

        while (stack.length) {
          if (Date.now() + STOP_MARGIN_MS > opts.deadlineMs) { detail = 'time budget reached; resumes next run'; break sweepLoop }
          const [a, b] = stack.shift() as [number, number]
          stats.windows++

          let first = await fetchTMPage(seg.classificationName, 0, fmt(a), fmt(b))
          if (first.status === 'rate_limited') { status = 'rate_limited'; detail = 'Ticketmaster rate limit; resumes next run'; break sweepLoop }
          if (first.status !== 'ok') { await sleep(2000); first = await fetchTMPage(seg.classificationName, 0, fmt(a), fmt(b)) }
          if (first.status === 'rate_limited') { status = 'rate_limited'; detail = 'Ticketmaster rate limit; resumes next run'; break sweepLoop }
          if (first.status !== 'ok') { stats.failedWindows++; console.error(`[sweep] window failed ${seg.classificationName} ${fmt(a)}: ${first.detail}`); cursorMs = b; await persist(); continue }

          const total = first.totalElements ?? 0
          if (needsSplit(total, a, b)) {
            const [lo, hi] = splitWindow(a, b)
            stack.unshift(lo, hi)
            stats.splits++
            await sleep(RATE_LIMIT_MS)
            continue
          }
          if (total > MAX_QUERY_RESULTS) { stats.truncatedWindows++; console.error(`[sweep] ${seg.classificationName} ${fmt(a)}–${fmt(b)} holds ${total} events; only the first ${MAX_QUERY_RESULTS} fit one query`) }

          const pages = pagesNeeded(total)
          let leafFailed = false
          for (let page = 0; page < pages; page++) {
            const res = page === 0 ? first : await fetchTMPage(seg.classificationName, page, fmt(a), fmt(b))
            if (res.status === 'rate_limited') { status = 'rate_limited'; detail = 'Ticketmaster rate limit; resumes next run'; break sweepLoop }
            if (res.status !== 'ok') { leafFailed = true; break }
            stats.pages++
            stats.seen += res.events.length
            if (dry) await countPage(db, res.events, stats)
            else await processEvents(db, res.events, () => seg.dbCategory, venueCache, artistCache, stats)
            if (page + 1 < pages) await sleep(RATE_LIMIT_MS)
          }
          if (leafFailed) stats.failedWindows++
          cursorMs = b
          await persist()
          await sleep(RATE_LIMIT_MS)
        }

        // Window chunk finished; move on.
        cursorMs = chunkEndMs
        if (cursorMs >= hEnd) { segIdx++; cursorMs = cycleStartMs }
        await persist()
      }

      if (segIdx >= SEGMENT_QUERIES.length) {
        status = 'complete'
        completedAt = new Date().toISOString()
        // A dry run touched nothing, so it must not count as a refreshed lap (health alerts and removals key off this).
        if (!dry) completedCycleStartedAt = cycleStarted
        cursorMs = new Date(cycleStarted as string).getTime()
        segIdx = 0
        await persist()
      }
    }
  } finally {
    await persist({ running_since: null, last_stats: { ...stats, mode, status, detail, at: new Date().toISOString() } })
  }

  if (!dry && (stats.changed > 0 || status === 'complete')) await recalcFlags(db)
  return result(status, { mode, detail, segment: SEGMENT_QUERIES[Math.min(segIdx, SEGMENT_QUERIES.length - 1)]?.classificationName ?? null, cycleStartedAt: cycleStarted })
}

// ── Verification of events the sweep did not see ────────────────────────────

type FetchById = { kind: 'found'; event: TMEvent } | { kind: 'gone' } | { kind: 'rate_limited' } | { kind: 'error'; detail: string }

async function fetchEventById(id: string): Promise<FetchById> {
  const url = new URL(`${TM_BASE}/events/${encodeURIComponent(id)}.json`)
  url.searchParams.set('apikey', process.env.TICKETMASTER_API_KEY!)
  url.searchParams.set('locale', 'en-us')
  try {
    const res = await fetch(url.toString(), { cache: 'no-store' })
    if (res.status === 404) return { kind: 'gone' }
    if (res.status === 429) return { kind: 'rate_limited' }
    if (!res.ok) return { kind: 'error', detail: `HTTP ${res.status}` }
    const json = await res.json() as TMEvent & { fault?: unknown; errors?: unknown }
    if (json.fault || json.errors || !json.id) return { kind: 'error', detail: 'unexpected response' }
    return { kind: 'found', event: json }
  } catch (e) {
    return { kind: 'error', detail: String(e) }
  }
}

async function fetchEventsByIds(ids: string[]): Promise<{ ok: true; events: TMEvent[] } | { ok: false; rateLimited: boolean; info?: string }> {
  const url = new URL(`${TM_BASE}/events.json`)
  url.searchParams.set('apikey', process.env.TICKETMASTER_API_KEY!)
  url.searchParams.set('id', ids.join(','))
  url.searchParams.set('size', '200')
  url.searchParams.set('locale', 'en-us')
  try {
    const res = await fetch(url.toString(), { cache: 'no-store' })
    if (res.status === 429) {
      const h = res.headers
      const body = (await res.text().catch(() => '')).replace(/\s+/g, ' ').slice(0, 160)
      const info = ['rate-limit', 'rate-limit-available', 'rate-limit-over', 'rate-limit-reset', 'retry-after']
        .map(k => `${k}=${h.get(k) ?? '-'}`).join(' ') + ` body=${body}`
      return { ok: false, rateLimited: true, info }
    }
    if (!res.ok) return { ok: false, rateLimited: false, info: `HTTP ${res.status}` }
    const json = await res.json() as { _embedded?: { events?: TMEvent[] }; fault?: unknown; errors?: unknown }
    if (json.fault || json.errors) return { ok: false, rateLimited: false }
    return { ok: true, events: json._embedded?.events ?? [] }
  } catch {
    return { ok: false, rateLimited: false }
  }
}

export interface VerifyResult {
  mode?: 'off' | 'dry' | 'live'
  status: 'skipped' | 'done' | 'partial' | 'rate_limited'
  detail?: string
  candidates: number
  refreshed: number
  removed: number
  errors: number
  /** Dry run only: of the sampled candidates, how many Ticketmaster still has / confirms gone. */
  sampleFound?: number
  sampleGone?: number
  sampleBatchLookupWorked?: boolean
  sampleGoneTitles?: string[]
  durationMs: number
}

interface Candidate { id: string; ticketmaster_id: string; title?: string; category: EventCategory; details: Record<string, unknown> | null }

export async function verifyStaleTicketmasterEvents(opts: { deadlineMs: number; maxCandidates?: number }): Promise<VerifyResult> {
  const t0 = Date.now()
  const db = createAdminClient()
  const loose = db as unknown as Loose
  const out: VerifyResult = { status: 'done', candidates: 0, refreshed: 0, removed: 0, errors: 0, durationMs: 0 }
  const finish = (): VerifyResult => ({ ...out, durationMs: Date.now() - t0 })

  const { data: st } = await loose.from('tm_sweep_state').select('completed_cycle_started_at, mode, max_removals_per_run').eq('id', 1).maybeSingle()
  const state = st as { completed_cycle_started_at: string | null; mode: 'off' | 'dry' | 'live'; max_removals_per_run: number } | null
  const mode = state?.mode ?? 'dry'
  out.mode = mode
  if (mode === 'off') { out.status = 'skipped'; out.detail = 'switched off'; return finish() }
  const dry = mode === 'dry'
  const cutoff = state?.completed_cycle_started_at ?? null
  if (!dry && !cutoff) { out.status = 'skipped'; out.detail = 'no complete sweep yet'; return finish() }

  // Dry run samples the oldest-untouched events (the likely dead ones) without any gating or writes.
  let query = loose.from('events')
    .select('id, ticketmaster_id, title, category, details')
    .not('ticketmaster_id', 'is', null).is('source', null)
    .gte('start_date', new Date().toISOString())
    .in('status', ['upcoming', 'on_sale', 'sold_out', 'postponed'])
  if (!dry) query = query.or(`last_synced_at.is.null,last_synced_at.lt.${cutoff}`)
  const { data: rows, error } = await query
    .order('last_synced_at', { ascending: true, nullsFirst: true })
    .limit(dry ? 60 : (opts.maxCandidates ?? 600))
  if (error) { out.status = 'partial'; out.detail = `candidate query failed: ${error.message}`; return finish() }
  const candidates = (rows ?? []) as Candidate[]
  out.candidates = candidates.length
  if (!candidates.length) return finish()

  // Control: an event that definitely exists must still be found, otherwise an outage could look like mass removal.
  const { data: ctl } = await loose.from('events').select('ticketmaster_id').not('ticketmaster_id', 'is', null).is('source', null).gte('last_synced_at', cutoff ?? new Date(Date.now() - 3 * 86_400_000).toISOString()).limit(1)
  const controlId = (ctl as Array<{ ticketmaster_id: string }> | null)?.[0]?.ticketmaster_id
  const control = controlId ? await fetchEventById(controlId) : { kind: 'error' as const, detail: 'no control event' }
  const markingAllowed = !dry && mayMarkGone(control.kind === 'found')
  if (!dry && !markingAllowed) out.detail = 'control check failed; refreshing only, nothing removed'
  if (dry) { out.sampleFound = 0; out.sampleGone = 0; out.sampleGoneTitles = [] }
  const maxRemovals = Math.max(0, state?.max_removals_per_run ?? 100)
  let checked = 0
  let goneSeen = 0

  const venueCache = new Map<string, string>()
  const artistCache = new Map<string, string>()
  const byTmId = new Map(candidates.map(c => [c.ticketmaster_id, c]))
  const nowIso = new Date().toISOString()

  const markGone = async (c: Candidate) => {
    if (out.removed >= maxRemovals) { out.detail = `removal cap of ${maxRemovals} per run reached; remaining checked next run`; return }
    const { error: upErr } = await loose.from('events').update({
      status: 'cancelled', last_synced_at: nowIso,
      details: { ...(c.details ?? {}), removed_from_ticketmaster_at: nowIso },
    }).eq('id', c.id)
    if (upErr) out.errors++; else out.removed++
  }

  for (let i = 0; i < candidates.length; i += ID_BATCH) {
    if (Date.now() + STOP_MARGIN_MS > opts.deadlineMs) { out.status = 'partial'; out.detail = out.detail ?? 'time budget reached'; return finish() }
    const batch = candidates.slice(i, i + ID_BATCH)
    let res = await fetchEventsByIds(batch.map(c => c.ticketmaster_id))
    // A 429 straight after the sweep is usually a burst limit: wait and try again before giving up.
    for (let attempt = 0; attempt < 2 && !res.ok && res.rateLimited; attempt++) {
      await sleep(2500)
      res = await fetchEventsByIds(batch.map(c => c.ticketmaster_id))
    }
    await sleep(RATE_LIMIT_MS)
    if (!res.ok && res.rateLimited) { out.status = 'rate_limited'; out.detail = `Ticketmaster 429 after retries: ${res.info ?? ''}`; return finish() }

    let missing: Candidate[]
    if (dry && res.ok) out.sampleBatchLookupWorked = true
    if (dry && !res.ok && out.sampleBatchLookupWorked === undefined) out.sampleBatchLookupWorked = false
    if (res.ok) {
      const foundIds = new Set(res.events.map(e => e.id))
      checked += batch.length
      if (dry) out.sampleFound = (out.sampleFound ?? 0) + res.events.length
      const stats = { changed: 0, unchanged: 0, errors: 0 }
      if (dry) {
        missing = batch.filter(c => !foundIds.has(c.ticketmaster_id))
        for (const c of missing) {
          const one = await fetchEventById(c.ticketmaster_id)
          await sleep(RATE_LIMIT_MS)
          if (one.kind === 'gone') { out.sampleGone = (out.sampleGone ?? 0) + 1; if ((out.sampleGoneTitles?.length ?? 0) < 8) out.sampleGoneTitles?.push(c.title ?? c.ticketmaster_id) }
          else if (one.kind === 'found') out.sampleFound = (out.sampleFound ?? 0) + 1
        }
        continue
      }
      await processEvents(db, res.events, ev => byTmId.get(ev.id)?.category ?? 'concert', venueCache, artistCache, stats)
      out.refreshed += stats.changed + stats.unchanged
      out.errors += stats.errors
      missing = batch.filter(c => !foundIds.has(c.ticketmaster_id))
    } else {
      missing = batch   // id-list query unsupported or failed: check each one individually
      checked += batch.length
    }
    if (dry) {
      for (const c of missing) {
        const one = await fetchEventById(c.ticketmaster_id)
        await sleep(RATE_LIMIT_MS)
        if (one.kind === 'gone') { out.sampleGone = (out.sampleGone ?? 0) + 1; if ((out.sampleGoneTitles?.length ?? 0) < 8) out.sampleGoneTitles?.push(c.title ?? c.ticketmaster_id) }
        else if (one.kind === 'found') out.sampleFound = (out.sampleFound ?? 0) + 1
      }
      continue
    }

    for (const c of missing) {
      if (Date.now() + STOP_MARGIN_MS > opts.deadlineMs) { out.status = 'partial'; return finish() }
      const one = await fetchEventById(c.ticketmaster_id)
      await sleep(RATE_LIMIT_MS)
      if (one.kind === 'rate_limited') { out.status = 'rate_limited'; return finish() }
      if (one.kind === 'error') { out.errors++; continue }
      if (one.kind === 'gone') {
        goneSeen++
        // If most of what we look at is "gone", something systemic is wrong (outage, bad ids): remove nothing.
        const systemic = checked >= 20 && goneSeen / checked > 0.6
        if (systemic) { out.detail = 'over 60% of checked events reported gone; treated as systemic, nothing removed'; continue }
        if (markingAllowed) await markGone(c)
        continue
      }
      const stats = { changed: 0, unchanged: 0, errors: 0 }
      await processEvents(db, [one.event], () => c.category, venueCache, artistCache, stats)
      if (!one.event._embedded?.venues?.[0]) await touchAll(loose, [c.id])
      out.refreshed += stats.changed + stats.unchanged || 1
      out.errors += stats.errors
    }
  }
  if (!dry && (out.refreshed > 0 || out.removed > 0)) await recalcFlags(db)
  return finish()
}
