// National Gigsberg catalogue sweep + exact verification of anything the sweep did not see.
//
// Why: the older catalogue sync visited ONE city per daily run, so a lap of the 40 UK cities took
// 40 days (and a single failed run stalled it on the same city), it never recorded when a row was
// last seen, and events Gigsberg had dropped stayed in the catalogue for ever. This sweep walks
// every UK city in one run (resuming from a cursor if the time budget runs out), stamps every row
// it sees, and then checks anything it did NOT see one by one: only a confirmed HTTP 404 on the
// event itself flags it as gone. Same modes and safeguards as the Ticketmaster sweep.
import { createAdminClient } from '@/lib/supabase/admin'
import { CITIES } from '@/lib/cities'
import { getGigsbergAffiliateEvent, searchGigsbergAffiliateEvents, type GigsbergAffiliateEvent } from '@/lib/gigsbergAffiliate'
import {
  catalogueRowChanged, fetchCityEvents, horizonIso, isUKEvent, todayIso, toCatalogueRow,
  type ExistingCatalogueRow,
} from '@/lib/gigsbergCatalogue'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = { from: (table: string) => any }

type Mode = 'off' | 'dry' | 'live'

interface StateRow {
  mode: Mode
  max_removals_per_run: number
  city_index: number
  cycle_started_at: string | null
  completed_at: string | null
  completed_cycle_started_at: string | null
  running_since: string | null
}

const LOCK_STALE_MS = 6 * 60_000
const STOP_MARGIN_MS = 30_000         // never start a city group with less than this left
const CITY_GROUP = 6                  // cities fetched in parallel
const PAGE_CONCURRENCY = 3            // extra pages of one big city (London) fetched in parallel
const PAGE_SIZE = 100
const IDLE_AFTER_COMPLETE_MS = 3 * 3_600_000
const UPSERT_BATCH = 100
const TOUCH_BATCH = 200
const EXISTING_COLUMNS = 'id, name, event_date, event_time, venue, city, country, performer1, performer2, tour, url, min_price, raw, gone_at'

export interface GigsbergSweepStats {
  cities: number
  pages: number
  seen: number
  inserted: number
  updated: number
  unchanged: number
  reappeared: number
  failedCities: number
  errors: number
  apiMs?: number               // total time spent waiting on Gigsberg's event search
  sampleNew?: string[]
}

export interface GigsbergSweepResult {
  status: 'complete' | 'partial' | 'idle' | 'busy' | 'disabled'
  mode?: Mode
  detail?: string
  cycleStartedAt: string | null
  stats: GigsbergSweepStats
  durationMs: number
}

const emptyStats = (): GigsbergSweepStats => ({ cities: 0, pages: 0, seen: 0, inserted: 0, updated: 0, unchanged: 0, reappeared: 0, failedCities: 0, errors: 0 })

type ExistingRow = ExistingCatalogueRow & { gone_at: string | null }

async function loadExisting(loose: Loose, ids: number[]): Promise<Map<number, ExistingRow>> {
  const map = new Map<number, ExistingRow>()
  for (let i = 0; i < ids.length; i += 500) {
    const { data, error } = await loose.from('gigsberg_catalogue_events').select(EXISTING_COLUMNS).in('id', ids.slice(i, i + 500))
    if (error) throw new Error(`Could not read the existing Gigsberg catalogue: ${error.message}`)
    for (const row of (data ?? []) as ExistingRow[]) map.set(row.id, row)
  }
  return map
}

/** One city's events. After page 1 reports the total, the remaining pages are fetched a few at a time. */
async function fetchCityFast(city: string, from: string, to: string, stats: GigsbergSweepStats): Promise<{ events: GigsbergAffiliateEvent[]; pages: number }> {
  const timed = async <T>(fn: () => Promise<T>): Promise<T> => {
    const t = Date.now()
    try { return await fn() } finally { stats.apiMs = (stats.apiMs ?? 0) + (Date.now() - t) }
  }
  const first = await timed(() => searchGigsbergAffiliateEvents({ city, date_from: from, date_to: to, page: 1, per_page: PAGE_SIZE }))
  const events = [...(first.items ?? [])]
  const total = Number(first.total)
  if (!Number.isFinite(total) || events.length < PAGE_SIZE || !first.nextPage) {
    // Unknown total or a single page: fall back to the sequential walker for anything beyond page 1.
    if (events.length >= PAGE_SIZE && first.nextPage) return fetchCityEvents(city, from, to)
    return { events, pages: 1 }
  }
  const lastPage = Math.ceil(total / PAGE_SIZE)
  for (let page = 2; page <= lastPage; page += PAGE_CONCURRENCY) {
    const batch = Array.from({ length: Math.min(PAGE_CONCURRENCY, lastPage - page + 1) }, (_, i) => page + i)
    const results = await Promise.all(batch.map(n => timed(() => searchGigsbergAffiliateEvents({ city, date_from: from, date_to: to, page: n, per_page: PAGE_SIZE }))))
    for (const r of results) events.push(...(r.items ?? []))
  }
  return { events, pages: lastPage }
}

/** Record one group of fetched events. Dry mode only counts; live mode upserts changed rows and stamps the rest as seen. */
async function recordEvents(loose: Loose, events: ReturnType<typeof toCatalogueRow>[], stats: GigsbergSweepStats, dry: boolean) {
  if (!events.length) return
  const existing = await loadExisting(loose, events.map(e => e.id))
  const toWrite: Array<ReturnType<typeof toCatalogueRow> & { gone_at?: null }> = []
  const toTouch: number[] = []

  for (const row of events) {
    const prev = existing.get(row.id)
    if (!prev) {
      stats.inserted++
      const sample = (stats.sampleNew ??= [])
      if (sample.length < 12) sample.push(`${row.name} | ${row.venue ?? ''} | ${row.event_date}`.slice(0, 120))
      toWrite.push(row)
    } else if (catalogueRowChanged(row, prev) || prev.gone_at) {
      if (prev.gone_at) stats.reappeared++
      stats.updated++
      toWrite.push({ ...row, gone_at: null })
    } else {
      stats.unchanged++
      toTouch.push(row.id)
    }
  }
  if (dry) return

  for (let i = 0; i < toWrite.length; i += UPSERT_BATCH) {
    const batch = toWrite.slice(i, i + UPSERT_BATCH)
    const { error } = await loose.from('gigsberg_catalogue_events').upsert(batch, { onConflict: 'id', ignoreDuplicates: false })
    if (error) { stats.errors += batch.length; console.error(`[gigsberg-sweep] upsert failed: ${error.message}`) }
  }
  // Unchanged rows are not rewritten (that would risk the match/review state); they are only stamped as seen.
  const seenAt = new Date().toISOString()
  for (let i = 0; i < toTouch.length; i += TOUCH_BATCH) {
    const { error } = await loose.from('gigsberg_catalogue_events').update({ last_seen_at: seenAt }).in('id', toTouch.slice(i, i + TOUCH_BATCH))
    if (error) { stats.errors++; console.error(`[gigsberg-sweep] touch failed: ${error.message}`) }
  }
}

export async function runGigsbergSweep(opts: { deadlineMs: number; force?: boolean }): Promise<GigsbergSweepResult> {
  const t0 = Date.now()
  const loose = createAdminClient() as unknown as Loose
  const stats = emptyStats()
  const result = (status: GigsbergSweepResult['status'], extra: Partial<GigsbergSweepResult> = {}): GigsbergSweepResult =>
    ({ status, cycleStartedAt: null, stats, durationMs: Date.now() - t0, ...extra })

  const staleLock = new Date(Date.now() - LOCK_STALE_MS).toISOString()
  const claim = await loose.from('gigsberg_sweep_state').update({ running_since: new Date().toISOString() })
    .eq('id', 1).or(`running_since.is.null,running_since.lt.${staleLock}`).select('*')
  const row = (claim.data?.[0] ?? null) as StateRow | null
  if (!row) return result('busy', { detail: claim.error?.message ?? 'another Gigsberg sweep run holds the lock' })

  const mode = row.mode ?? 'dry'
  if (mode === 'off') {
    await loose.from('gigsberg_sweep_state').update({ running_since: null }).eq('id', 1)
    return result('disabled', { mode, detail: 'sweep switched off in gigsberg_sweep_state.mode' })
  }
  const dry = mode === 'dry'

  let cityIdx = row.city_index
  let cycleStarted = row.cycle_started_at
  let completedAt = row.completed_at
  let completedCycleStartedAt = row.completed_cycle_started_at
  let status: GigsbergSweepResult['status'] = 'partial'
  let detail: string | undefined

  const persist = async (extra: Record<string, unknown> = {}) => {
    await loose.from('gigsberg_sweep_state').update({
      city_index: cityIdx, cycle_started_at: cycleStarted, completed_at: completedAt,
      completed_cycle_started_at: completedCycleStartedAt, ...extra,
    }).eq('id', 1)
  }

  try {
    const lapDone = Boolean(cycleStarted && completedAt && new Date(completedAt) >= new Date(cycleStarted))
    const recentlyDone = lapDone && Date.now() - new Date(completedAt as string).getTime() < IDLE_AFTER_COMPLETE_MS
    if (recentlyDone && !opts.force) {
      status = 'idle'; detail = 'latest sweep already complete'
    } else {
      if (!cycleStarted || lapDone) {
        cityIdx = 0; cycleStarted = new Date().toISOString()
        await persist()
      }
      const from = todayIso()
      const to = horizonIso()

      while (cityIdx < CITIES.length) {
        if (Date.now() + STOP_MARGIN_MS > opts.deadlineMs) { detail = 'time budget reached; resumes next run'; break }
        const group = CITIES.slice(cityIdx, cityIdx + CITY_GROUP)
        const settled = await Promise.allSettled(group.map(c => fetchCityFast(c.name, from, to, stats)))
        const unique = new Map<number, ReturnType<typeof toCatalogueRow>>()
        settled.forEach((r, i) => {
          if (r.status === 'rejected') {
            stats.failedCities++
            console.error(`[gigsberg-sweep] ${group[i].name} failed: ${r.reason instanceof Error ? r.reason.message : r.reason}`)
            return
          }
          stats.cities++
          stats.pages += r.value.pages
          for (const ev of r.value.events) if (isUKEvent(ev)) unique.set(ev.id, toCatalogueRow(ev))
        })
        stats.seen += unique.size
        await recordEvents(loose, [...unique.values()], stats, dry)
        cityIdx += group.length
        await persist()
      }

      if (cityIdx >= CITIES.length) {
        status = 'complete'
        completedAt = new Date().toISOString()
        // A dry run touched nothing, so it must not count as a refreshed lap (removals key off this).
        // Neither does a lap in which a city failed: its rows would look unseen.
        if (!dry && stats.failedCities === 0) completedCycleStartedAt = cycleStarted
        else if (stats.failedCities > 0) detail = `${stats.failedCities} city fetch(es) failed; this lap is not used for removals`
        cityIdx = 0
        await persist()
      }
    }
  } finally {
    await persist({ running_since: null, last_stats: { ...stats, mode, status, detail, at: new Date().toISOString() } })
  }
  return result(status, { mode, detail, cycleStartedAt: cycleStarted })
}

// ── Verification of rows the sweep did not see ──────────────────────────────

export interface GigsbergVerifyResult {
  mode?: Mode
  status: 'skipped' | 'done' | 'partial'
  detail?: string
  candidates: number
  refreshed: number
  removed: number
  errors: number
  /** Dry run only: of the sampled rows, how many Gigsberg still has / confirms gone. */
  sampleFound?: number
  sampleGone?: number
  sampleGoneTitles?: string[]
  durationMs: number
}

interface Candidate { id: number; name: string; url: string | null; matched_event_id: string | null }

type Lookup = 'found' | 'gone' | 'error'

async function lookup(id: number): Promise<Lookup> {
  try {
    await getGigsbergAffiliateEvent(id)
    return 'found'
  } catch (err) {
    return err instanceof Error && /HTTP 404\b/.test(err.message) ? 'gone' : 'error'
  }
}

export async function verifyStaleGigsbergEvents(opts: { deadlineMs: number; maxCandidates?: number }): Promise<GigsbergVerifyResult> {
  const t0 = Date.now()
  const loose = createAdminClient() as unknown as Loose
  const out: GigsbergVerifyResult = { status: 'done', candidates: 0, refreshed: 0, removed: 0, errors: 0, durationMs: 0 }
  const finish = (): GigsbergVerifyResult => ({ ...out, durationMs: Date.now() - t0 })

  const { data: st } = await loose.from('gigsberg_sweep_state').select('completed_cycle_started_at, mode, max_removals_per_run').eq('id', 1).maybeSingle()
  const state = st as { completed_cycle_started_at: string | null; mode: Mode; max_removals_per_run: number } | null
  const mode = state?.mode ?? 'dry'
  out.mode = mode
  if (mode === 'off') { out.status = 'skipped'; out.detail = 'switched off'; return finish() }
  const dry = mode === 'dry'
  const cutoff = state?.completed_cycle_started_at ?? null
  if (!dry && !cutoff) { out.status = 'skipped'; out.detail = 'no complete sweep yet'; return finish() }

  // Dry run samples the oldest-seen rows (the likely dead ones) without any gating or writes.
  let query = loose.from('gigsberg_catalogue_events')
    .select('id, name, url, matched_event_id')
    .gte('event_date', todayIso())
    .is('gone_at', null)
  if (!dry) query = query.lt('last_seen_at', cutoff)
  const { data: rows, error } = await query
    .order('last_seen_at', { ascending: true, nullsFirst: true })
    .limit(dry ? 40 : (opts.maxCandidates ?? 300))
  if (error) { out.status = 'partial'; out.detail = `candidate query failed: ${error.message}`; return finish() }
  const candidates = (rows ?? []) as Candidate[]
  out.candidates = candidates.length
  if (!candidates.length) return finish()

  // Control: a row that definitely exists must still be found, otherwise an outage could look like mass removal.
  const { data: ctl } = await loose.from('gigsberg_catalogue_events').select('id').gte('last_seen_at', cutoff ?? new Date(Date.now() - 3 * 86_400_000).toISOString()).limit(1)
  const controlId = (ctl as Array<{ id: number }> | null)?.[0]?.id
  const controlOk = controlId != null && (await lookup(controlId)) === 'found'
  const markingAllowed = !dry && controlOk
  if (!dry && !markingAllowed) out.detail = 'control check failed; refreshing only, nothing removed'
  if (dry) { out.sampleFound = 0; out.sampleGone = 0; out.sampleGoneTitles = [] }

  const maxRemovals = Math.max(0, state?.max_removals_per_run ?? 50)
  let checked = 0
  let goneSeen = 0
  let breaker = false
  const nowIso = new Date().toISOString()

  const markGone = async (c: Candidate) => {
    if (out.removed >= maxRemovals) { out.detail = `removal cap of ${maxRemovals} per run reached; remaining checked next run`; return }
    const { error: upErr } = await loose.from('gigsberg_catalogue_events').update({ gone_at: nowIso, inventory_status: null }).eq('id', c.id)
    if (upErr) { out.errors++; return }
    out.removed++
    // Drop only the Gigsberg link this catalogue row created; links from other sources are untouched.
    if (c.matched_event_id && c.url) {
      await loose.from('events').update({ gigsberg_affiliate_url: null, gigsberg_inventory_status: null }).eq('id', c.matched_event_id).eq('gigsberg_affiliate_url', c.url)
    }
  }

  const CONCURRENCY = 4
  for (let i = 0; i < candidates.length; i += CONCURRENCY) {
    if (Date.now() + STOP_MARGIN_MS > opts.deadlineMs) { out.status = 'partial'; out.detail = out.detail ?? 'time budget reached'; return finish() }
    const batch = candidates.slice(i, i + CONCURRENCY)
    const results = await Promise.all(batch.map(async c => ({ c, r: await lookup(c.id) })))
    for (const { c, r } of results) {
      checked++
      if (r === 'error') { out.errors++; continue }
      if (r === 'gone') goneSeen++
      if (dry) {
        if (r === 'found') out.sampleFound = (out.sampleFound ?? 0) + 1
        else { out.sampleGone = (out.sampleGone ?? 0) + 1; if ((out.sampleGoneTitles ??= []).length < 15) out.sampleGoneTitles.push(c.name.slice(0, 80)) }
        continue
      }
      if (r === 'found') {
        const { error: touchErr } = await loose.from('gigsberg_catalogue_events').update({ last_seen_at: nowIso }).eq('id', c.id)
        if (touchErr) out.errors++; else out.refreshed++
      } else if (markingAllowed && !breaker) {
        // Systemic breaker: if most of what we check is "gone", assume an API problem, not mass removal.
        if (checked >= 20 && goneSeen / checked > 0.6) { breaker = true; out.detail = 'more than 60% of checked rows reported gone; assuming an API problem, nothing removed'; continue }
        await markGone(c)
      }
    }
    await new Promise(r => setTimeout(r, 150))
  }
  return finish()
}
