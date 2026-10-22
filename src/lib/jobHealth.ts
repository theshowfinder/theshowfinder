// Pure logic for the site health panel and alert emails: decides, from job run history,
// listing staleness and news-feed errors, what needs a human. No '@/' imports so it runs
// under `node --test`.

/** The longest a job may go without a successful run before it counts as overdue. */
export const JOB_EXPECTATIONS: Record<string, { label: string; maxHoursSinceSuccess: number }> = {
  'sync-events':               { label: 'Ticketmaster main sync',        maxHoursSinceSuccess: 30 },
  'sync-ticketmaster-sweep':   { label: 'Ticketmaster national sweep',    maxHoursSinceSuccess: 16 },
  'sync-onsale':               { label: 'Ticketmaster on-sale / presale', maxHoursSinceSuccess: 16 },
  'expand-tours':              { label: 'Expand tours',                  maxHoursSinceSuccess: 30 },
  'enrich-artists':            { label: 'Enrich artists',                maxHoursSinceSuccess: 30 },
  'enrich-musicbrainz':        { label: 'MusicBrainz enrichment',        maxHoursSinceSuccess: 30 },
  'sync-gigsberg':             { label: 'Gigsberg sync',                 maxHoursSinceSuccess: 30 },
  'sync-gigsberg-sweep':       { label: 'Gigsberg national sweep',       maxHoursSinceSuccess: 16 },
  'match-gigsberg':            { label: 'Gigsberg matching',             maxHoursSinceSuccess: 30 },
  'check-gigsberg-inventory':  { label: 'Gigsberg inventory check',      maxHoursSinceSuccess: 14 },
  'sync-see-tickets':          { label: 'See Tickets feed',              maxHoursSinceSuccess: 30 },
  'import-feed-events':        { label: 'Import shows from Gigsberg / See Tickets', maxHoursSinceSuccess: 30 },
  'match-see-tickets':         { label: 'See Tickets matching',          maxHoursSinceSuccess: 30 },
  'sync-city-news':            { label: 'City news sync',                maxHoursSinceSuccess: 16 },
  'sync-council-events':       { label: 'Local events (all cities)',    maxHoursSinceSuccess: 6 },
  'detect-new-shows':          { label: 'New-show detection',            maxHoursSinceSuccess: 16 },
  'refresh-listings':          { label: 'Refresh listings',              maxHoursSinceSuccess: 18 },
  'indexnow':                  { label: 'IndexNow pings',                maxHoursSinceSuccess: 30 },
  'event-reminders':           { label: 'Event reminders',               maxHoursSinceSuccess: 30 },
  'follow-alerts':             { label: 'Follow alerts',                 maxHoursSinceSuccess: 30 },
  'news-alerts':               { label: 'Just-announced alerts',         maxHoursSinceSuccess: 16 },
  'health-check':              { label: 'Health check (this alert job)', maxHoursSinceSuccess: 14 },
  'weekly-digest':             { label: 'Weekly digest',                 maxHoursSinceSuccess: 192 },
}

export interface JobRunRow {
  job: string
  started_at: string
  finished_at: string | null
  status: 'running' | 'ok' | 'error' | string
  error?: string | null
}

export type JobIssue = 'never_ran' | 'overdue' | 'failing' | null

export interface JobStatus {
  job: string
  label: string
  lastRunAt: string | null
  lastSuccessAt: string | null
  lastStatus: 'ok' | 'error' | 'running' | 'none'
  lastError: string | null
  failuresLast24h: number
  hoursSinceSuccess: number | null
  issue: JobIssue
}

/** A run still "running" long after the function limit (5 min) was killed, i.e. failed. */
const STUCK_AFTER_MINUTES = 12

function effectiveStatus(run: JobRunRow, now: Date): 'ok' | 'error' | 'running' {
  if (run.status === 'ok') return 'ok'
  if (run.status === 'error') return 'error'
  const ageMin = (now.getTime() - new Date(run.started_at).getTime()) / 60_000
  return ageMin > STUCK_AFTER_MINUTES ? 'error' : 'running'
}

/**
 * `monitoringSince` is when run history began; a job is only called overdue or "never ran"
 * once monitoring has been on for longer than its allowed gap, so a fresh deploy does not
 * raise alarms for jobs that simply have not had their turn yet.
 */
export function evaluateJobs(
  runs: JobRunRow[],
  now: Date,
  monitoringSince: Date | null,
  expectations: typeof JOB_EXPECTATIONS = JOB_EXPECTATIONS,
): JobStatus[] {
  const byJob = new Map<string, JobRunRow[]>()
  for (const r of runs) byJob.set(r.job, [...(byJob.get(r.job) ?? []), r])
  const dayAgo = now.getTime() - 24 * 3_600_000

  return Object.entries(expectations).map(([job, exp]) => {
    const list = (byJob.get(job) ?? []).sort((a, b) => b.started_at.localeCompare(a.started_at))
    const last = list[0]
    const lastStatus = last ? effectiveStatus(last, now) : 'none'
    const success = list.find(r => effectiveStatus(r, now) === 'ok')
    const lastSuccessAt = success?.finished_at ?? success?.started_at ?? null
    const hoursSinceSuccess = lastSuccessAt ? (now.getTime() - new Date(lastSuccessAt).getTime()) / 3_600_000 : null
    const failuresLast24h = list.filter(r => effectiveStatus(r, now) === 'error' && new Date(r.started_at).getTime() >= dayAgo).length
    const monitoredHours = monitoringSince ? (now.getTime() - monitoringSince.getTime()) / 3_600_000 : 0
    const graceOver = monitoredHours > exp.maxHoursSinceSuccess

    let issue: JobIssue = null
    if (lastStatus === 'error') issue = 'failing'
    else if (hoursSinceSuccess !== null && hoursSinceSuccess > exp.maxHoursSinceSuccess && graceOver) issue = 'overdue'
    else if (!last && graceOver) issue = 'never_ran'

    return {
      job,
      label: exp.label,
      lastRunAt: last?.started_at ?? null,
      lastSuccessAt,
      lastStatus,
      lastError: lastStatus === 'error' ? (last?.error ?? 'Run did not finish (timed out?)') : null,
      failuresLast24h,
      hoursSinceSuccess,
      issue,
    }
  })
}

export interface CityStalenessRow {
  city: string
  future_events: number
  stale_14d: number
  stale_30d: number
  stale_60d: number
}

export const STALE_SHARE_ALERT = 0.10        // of ALL future events older than 60 days
export const CITY_STALE_SHARE_ALERT = 0.25   // of one big city's events older than 30 days
export const CITY_MIN_EVENTS = 200

export function stalenessSummary(rows: CityStalenessRow[]) {
  const total = rows.reduce((s, r) => s + Number(r.future_events), 0)
  const stale30 = rows.reduce((s, r) => s + Number(r.stale_30d), 0)
  const stale60 = rows.reduce((s, r) => s + Number(r.stale_60d), 0)
  return { total, stale30, stale60, share30: total ? stale30 / total : 0, share60: total ? stale60 / total : 0 }
}

export interface TmFreshness { future_tm: number; stale_48h: number; lap_completed: boolean; lap_completed_at: string | null }

/** Once a full national sweep has finished, more than this share of TM events older than 48h means it is not keeping up. */
export const TM_STALE_48H_ALERT = 0.03

export interface HealthIssue {
  key: string
  severity: 'high' | 'medium'
  message: string
}

export interface NewsErrorRow { city: string | null; error: string | null; started_at: string }

export function collectIssues(input: {
  jobs: JobStatus[]
  staleness: CityStalenessRow[]
  newsErrors: NewsErrorRow[]
  db?: { max_connections: number; connections: number } | null
  tmFreshness?: TmFreshness | null
}): HealthIssue[] {
  const issues: HealthIssue[] = []

  const f = input.tmFreshness
  if (f && f.lap_completed && f.future_tm > 0 && f.stale_48h / f.future_tm > TM_STALE_48H_ALERT) {
    issues.push({
      key: 'tm-not-daily',
      severity: 'high',
      message: `${f.stale_48h.toLocaleString('en-GB')} of ${f.future_tm.toLocaleString('en-GB')} Ticketmaster events (${Math.round((f.stale_48h / f.future_tm) * 100)}%) were not refreshed in the last 48 hours even though a full sweep has finished`,
    })
  }

  for (const j of input.jobs) {
    if (j.issue === 'failing') issues.push({ key: `job-failing:${j.job}`, severity: 'high', message: `${j.label} failed on its last run: ${(j.lastError ?? '').slice(0, 140)}` })
    else if (j.issue === 'overdue') issues.push({ key: `job-overdue:${j.job}`, severity: 'high', message: `${j.label} has not succeeded for ${Math.round(j.hoursSinceSuccess ?? 0)} hours` })
    else if (j.issue === 'never_ran') issues.push({ key: `job-never:${j.job}`, severity: 'medium', message: `${j.label} has no recorded run` })
  }

  const s = stalenessSummary(input.staleness)
  if (s.share60 > STALE_SHARE_ALERT) {
    issues.push({
      key: 'stale-listings',
      severity: 'medium',
      message: `${s.stale60.toLocaleString('en-GB')} of ${s.total.toLocaleString('en-GB')} future events (${Math.round(s.share60 * 100)}%) have not been refreshed from Ticketmaster in 60+ days`,
    })
  }
  for (const c of input.staleness) {
    if (Number(c.future_events) >= CITY_MIN_EVENTS && Number(c.stale_30d) / Number(c.future_events) > CITY_STALE_SHARE_ALERT) {
      issues.push({
        key: `stale-city:${c.city}`,
        severity: 'medium',
        message: `${c.city}: ${Math.round((Number(c.stale_30d) / Number(c.future_events)) * 100)}% of ${c.future_events} events not refreshed in 30+ days`,
      })
    }
  }

  const byCity = new Map<string, number>()
  for (const e of input.newsErrors) byCity.set(e.city ?? 'unknown', (byCity.get(e.city ?? 'unknown') ?? 0) + 1)
  for (const [city, n] of byCity) {
    if (n >= 2) issues.push({ key: `news-source:${city}`, severity: 'medium', message: `News source "${city}" failed ${n} times in the last 24 hours` })
  }

  if (input.db && input.db.max_connections > 0 && input.db.connections / input.db.max_connections > 0.8) {
    issues.push({ key: 'db-connections', severity: 'high', message: `Database connections ${input.db.connections}/${input.db.max_connections}` })
  }
  return issues
}

export const REPEAT_ALERT_HOURS = 72

/** Email only when something new is wrong, or the same problems have gone unfixed for 3 days. */
export function shouldSendAlert(
  previous: { keys: string[]; emailedAt?: string | null } | null,
  issues: HealthIssue[],
  now: Date,
): boolean {
  if (issues.length === 0) return false
  const prevKeys = new Set(previous?.keys ?? [])
  if (issues.some(i => !prevKeys.has(i.key))) return true
  if (!previous?.emailedAt) return true
  return (now.getTime() - new Date(previous.emailedAt).getTime()) / 3_600_000 >= REPEAT_ALERT_HOURS
}
