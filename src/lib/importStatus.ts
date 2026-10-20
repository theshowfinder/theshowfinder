// The "Morning import check": for each outside source we import from (Ticketmaster, See Tickets,
// Gigsberg, the council site, news) decide from the job history AND from the data itself whether
// today's import really happened, and describe the last run in plain words.
// Pure module (no '@/' imports) so it runs under `node --test`.

export type ImportSourceKey = 'ticketmaster' | 'see_tickets' | 'gigsberg' | 'council' | 'news'
export type SweepMode = 'off' | 'dry' | 'live'

export interface ImportJobDef { job: string; label: string; maxHours: number }
export interface ImportSourceDef {
  key: ImportSourceKey
  label: string
  what: string
  jobs: ImportJobDef[]
  /** Where the source's mode lives (sweeps only). */
  hasMode: boolean
  /** In dry mode the import itself writes nothing, so the source cannot count as done. */
  importNeedsLive: boolean
  /** What "the data is fresh" is measured on. */
  proofLabel: string
}

// maxHours = how long ago a successful run may be and still count as "done today".
export const IMPORT_SOURCES: ImportSourceDef[] = [
  {
    key: 'ticketmaster', label: 'Ticketmaster', what: 'Events, dates, venues, on-sales and presales',
    hasMode: true, importNeedsLive: true, proofLabel: 'Newest event refresh',
    jobs: [
      { job: 'sync-ticketmaster-sweep', label: 'National sweep', maxHours: 16 },
      { job: 'sync-onsale', label: 'On-sale / presale', maxHours: 16 },
    ],
  },
  {
    key: 'see_tickets', label: 'See Tickets', what: 'Feed of See Tickets shows, linked to our events',
    hasMode: true, importNeedsLive: false, proofLabel: 'Newest feed row seen',
    jobs: [
      { job: 'sync-see-tickets', label: 'Feed download', maxHours: 30 },
      { job: 'match-see-tickets', label: 'Linking to events', maxHours: 30 },
    ],
  },
  {
    key: 'gigsberg', label: 'Gigsberg', what: 'Gigsberg shows across 40 UK cities, linked to our events',
    hasMode: true, importNeedsLive: true, proofLabel: 'Newest catalogue row seen',
    jobs: [
      { job: 'sync-gigsberg-sweep', label: 'UK sweep', maxHours: 16 },
      { job: 'match-gigsberg', label: 'Linking to events', maxHours: 30 },
      { job: 'sync-gigsberg', label: 'Prices and listings', maxHours: 30 },
    ],
  },
  {
    key: 'council', label: 'Council events (Derby)', what: 'Derby LIVE and Market Hall listings',
    hasMode: true, importNeedsLive: false, proofLabel: 'Newest council event update',
    jobs: [{ job: 'sync-council-events', label: 'Council sync', maxHours: 30 }],
  },
  {
    key: 'news', label: 'City news', what: 'Headlines for 42 cities and national stories',
    hasMode: false, importNeedsLive: false, proofLabel: 'Newest story fetched',
    jobs: [{ job: 'sync-city-news', label: 'News sync', maxHours: 16 }],
  },
]

export interface RunRow {
  job: string
  started_at: string
  finished_at: string | null
  status: string
  error?: string | null
  summary?: unknown
}

/** A run still "running" long after the function limit was killed, i.e. it failed. */
const STUCK_AFTER_MINUTES = 12
const DATA_STALE_AFTER_HOURS = 26

type RunState = 'ok' | 'error' | 'running'
function runState(r: RunRow, now: Date): RunState {
  if (r.status === 'ok') return 'ok'
  if (r.status === 'error') return 'error'
  return (now.getTime() - new Date(r.started_at).getTime()) / 60_000 > STUCK_AFTER_MINUTES ? 'error' : 'running'
}

export type CardState = 'done' | 'failed' | 'stale' | 'running' | 'off'

export interface JobLine {
  job: string
  label: string
  state: 'ok' | 'failed' | 'overdue' | 'never' | 'running'
  lastRunAt: string | null
  lastOkAt: string | null
  /** Plain-English outcome of the most recent run. */
  outcome: string
}

export interface ImportCard {
  key: ImportSourceKey
  label: string
  what: string
  state: CardState
  headline: string
  notes: string[]
  mode: SweepMode | null
  hasMode: boolean
  proofLabel: string
  proofAt: string | null
  jobs: JobLine[]
}

export interface ImportInputs {
  runs: RunRow[]
  modes: Partial<Record<ImportSourceKey, SweepMode>>
  /** Newest timestamp in the imported data itself, per source (null = unknown). */
  proof: Partial<Record<ImportSourceKey, string | null>>
  now: Date
}

export function evaluateImports({ runs, modes, proof, now }: ImportInputs): ImportCard[] {
  return IMPORT_SOURCES.map(def => {
    const mode = def.hasMode ? (modes[def.key] ?? null) : null
    const proofAt = proof[def.key] ?? null
    const jobs: JobLine[] = def.jobs.map(j => {
      const list = runs.filter(r => r.job === j.job).sort((a, b) => b.started_at.localeCompare(a.started_at))
      const last = list[0]
      const ok = list.find(r => runState(r, now) === 'ok')
      const lastOkAt = ok ? (ok.finished_at ?? ok.started_at) : null
      const hoursSinceOk = lastOkAt ? (now.getTime() - new Date(lastOkAt).getTime()) / 3_600_000 : null
      const lastS = last ? runState(last, now) : null
      let state: JobLine['state']
      if (!last) state = 'never'
      else if (lastS === 'running') state = 'running'
      else if (lastS === 'error') state = 'failed'
      else if (hoursSinceOk !== null && hoursSinceOk > j.maxHours) state = 'overdue'
      else state = 'ok'
      const outcome = !last ? 'No run recorded yet'
        : lastS === 'error' ? `Failed: ${String(last.error ?? 'did not finish (timed out?)').slice(0, 200)}`
        : lastS === 'running' ? 'Running now'
        : describeRun(j.job, last.summary)
      return { job: j.job, label: j.label, state, lastRunAt: last?.started_at ?? null, lastOkAt, outcome }
    })

    const notes: string[] = []
    const proofHours = proofAt ? (now.getTime() - new Date(proofAt).getTime()) / 3_600_000 : null
    const dataStale = proofHours !== null && proofHours > DATA_STALE_AFTER_HOURS
    if (dataStale) notes.push(`The imported data was last refreshed ${Math.round(proofHours!)}h ago, even if a job reported OK.`)
    if (def.importNeedsLive && mode && mode !== 'live') notes.push(`Mode is ${mode.toUpperCase()}: the import is counted but nothing is saved. Go live to import.`)
    if (!def.importNeedsLive && mode === 'dry') notes.push('Imports normally; DRY only means dead events are reported, not removed yet.')
    if (mode === 'off') notes.push('Switched OFF.')

    let state: CardState
    let headline: string
    if (mode === 'off') { state = 'off'; headline = 'Switched off' }
    else if (jobs.some(j => j.state === 'running')) { state = 'running'; headline = 'Running now' }
    else if (jobs.some(j => j.state === 'failed')) { state = 'failed'; headline = `Failed: ${jobs.filter(j => j.state === 'failed').map(j => j.label).join(', ')}` }
    else if (jobs.some(j => j.state === 'overdue' || j.state === 'never') || dataStale || (def.importNeedsLive && mode !== null && mode !== 'live')) {
      state = 'stale'
      headline = def.importNeedsLive && mode !== null && mode !== 'live' ? 'Not importing (dry mode)'
        : dataStale ? 'Data not refreshed in over a day'
        : `Not done today: ${jobs.filter(j => j.state !== 'ok').map(j => j.label).join(', ')}`
    } else { state = 'done'; headline = 'Done: imported and confirmed' }

    return { key: def.key, label: def.label, what: def.what, state, headline, notes, mode, hasMode: def.hasMode, proofLabel: def.proofLabel, proofAt, jobs }
  })
}

export function importVerdict(cards: ImportCard[]): { ok: boolean; line: string } {
  const bad = cards.filter(c => c.state !== 'done')
  if (bad.length === 0) return { ok: true, line: `All ${cards.length} imports ran and are confirmed.` }
  return { ok: false, line: `${cards.length - bad.length} of ${cards.length} imports confirmed. Needs attention: ${bad.map(c => c.label).join(', ')}.` }
}

// ── plain-English description of one run ────────────────────────────────

type Rec = Record<string, unknown>
const isRec = (v: unknown): v is Rec => !!v && typeof v === 'object' && !Array.isArray(v)
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const fmt = (n: number | null) => (n === null ? '?' : n.toLocaleString('en-GB'))

/** `body` is the JSON a cron route returns (also what job_runs.summary stores). */
export function describeRun(job: string, body: unknown): string {
  if (!isRec(body)) return 'Finished'
  if (body.success === false) return `Failed: ${String(body.error ?? 'unknown error').slice(0, 200)}`
  try {
    switch (job) {
      case 'sync-ticketmaster-sweep': {
        const sweep = isRec(body.sweep) ? body.sweep : {}
        const stats = isRec(sweep.stats) ? sweep.stats : {}
        const verify = isRec(body.verify) ? body.verify : {}
        const lap = sweep.status === 'complete' || sweep.status === 'idle' ? 'lap complete' : `lap ${String(sweep.status ?? 'in progress')}`
        const seen = num(stats.seen)
        return `${lap}${seen ? `, ${fmt(seen)} events checked, ${fmt(num(stats.changed))} changed` : ''}; dead-event check ${fmt(num(verify.refreshed))} refreshed, ${fmt(num(verify.removed))} removed (${String(verify.status ?? 'n/a')})`
      }
      case 'sync-onsale':
        return `${fmt(num(body.total))} events received, ${fmt(num(body.inserted))} written, ${fmt(num(body.errors))} errors`
      case 'sync-see-tickets': {
        const sweep = isRec(body.sweep) ? body.sweep : null
        const parts = [`${fmt(num(body.fetched))} feed rows, ${fmt(num(body.eligible))} UK in range`]
        const ins = num(body.inserted); if (ins !== null) parts.push(`${fmt(ins)} new`)
        const upd = num(body.updated); if (upd !== null) parts.push(`${fmt(upd)} updated`)
        if (sweep) parts.push(`dead-show check ${String(sweep.mode)}: ${fmt(num(sweep.removed))} removed, ${fmt(num(sweep.absentFromFeed))} missing from feed`)
        return parts.join(', ')
      }
      case 'match-see-tickets':
      case 'match-gigsberg': {
        const m = isRec(body.matching) ? body.matching : body
        return `${fmt(num(m.checked))} checked, ${fmt(num(m.autoMatched))} newly linked, ${fmt(num(m.review))} to review, ${fmt(num(m.noMatch))} no match${num(m.errors) ? `, ${fmt(num(m.errors))} errors` : ''}${m.incomplete ? ' (stopped at the time limit: run again to finish the rest)' : ''}`
      }
      case 'sync-gigsberg-sweep': {
        const sweep = isRec(body.sweep) ? body.sweep : {}
        const s = isRec(sweep.stats) ? sweep.stats : {}
        const mode = String(sweep.mode ?? '?')
        const core = `${fmt(num(s.seen))} shows seen across ${fmt(num(s.cities))} cities, ${fmt(num(s.inserted))} new, ${fmt(num(s.updated))} updated`
        return mode === 'live' ? `${core} (saved)` : `${core} (${mode.toUpperCase()}: not saved)`
      }
      case 'sync-gigsberg':
        return `${fmt(num(body.listingsFetched))} listings, ${fmt(num(body.matched))} matched to events, ${fmt(num(body.unmatched))} unmatched`
      case 'sync-council-events': {
        const sources = Array.isArray(body.sources) ? body.sources.filter(isRec) : []
        const found = sources.reduce((n, s) => n + (num(s.found) ?? 0), 0)
        const inserted = sources.reduce((n, s) => n + (num(s.inserted) ?? 0), 0)
        return `${fmt(found)} events found, ${fmt(inserted)} new or updated`
      }
      case 'sync-city-news': {
        const per = Array.isArray(body.perCity) ? body.perCity.filter(isRec) : []
        const fetched = per.reduce((n, c) => n + (num(c.fetched) ?? 0), 0)
        return `${fmt(fetched)} stories fetched across ${per.length} cities, ${fmt(num(body.errors))} errors`
      }
      case 'import-feed-events': {
        const g = isRec(body.gigsberg) ? body.gigsberg : {}
        const t = isRec(body.see_tickets) ? body.see_tickets : {}
        const mode = String(body.mode ?? '?')
        if (mode === 'live') return `Gigsberg ${fmt(num(g.imported))} added, See Tickets ${fmt(num(t.imported))} added (saved)`
        return `${mode.toUpperCase()}: not saved. Would add ${fmt(num(g.wouldImport))} Gigsberg and ${fmt(num(t.wouldImport))} See Tickets shows`
      }
      default:
        return 'Finished OK'
    }
  } catch {
    return 'Finished'
  }
}
