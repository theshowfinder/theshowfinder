// Loads everything the health panel and the alert job look at. Admin client only.
import { createAdminClient } from '@/lib/supabase/admin'
import {
  collectIssues, evaluateJobs,
  type CityStalenessRow, type HealthIssue, type JobRunRow, type JobStatus, type NewsErrorRow,
} from '@/lib/jobHealth'

export interface HealthSnapshot {
  now: Date
  jobs: JobStatus[]
  staleness: CityStalenessRow[]
  newsErrors: NewsErrorRow[]
  db: { max_connections: number; connections: number; active_connections: number; db_size_bytes: number } | null
  monitoringSince: Date | null
  issues: HealthIssue[]
}

export async function loadHealthSnapshot(now = new Date()): Promise<HealthSnapshot> {
  const db = createAdminClient()
  const since7d = new Date(now.getTime() - 7 * 86_400_000).toISOString()
  const since24h = new Date(now.getTime() - 24 * 3_600_000).toISOString()

  const [runsRes, firstRes, stalenessRes, newsRes, dbRes] = await Promise.all([
    db.from('job_runs').select('job, started_at, finished_at, status, error').gte('started_at', since7d).order('started_at', { ascending: false }).limit(3000),
    db.from('job_runs').select('started_at').order('started_at', { ascending: true }).limit(1),
    db.rpc('health_city_staleness'),
    db.from('sync_log').select('city, error, started_at').eq('status', 'error').gte('started_at', since24h).limit(500),
    db.rpc('health_db_stats'),
  ])

  const runs = (runsRes.data ?? []) as JobRunRow[]
  const first = (firstRes.data ?? [])[0] as { started_at: string } | undefined
  const monitoringSince = first ? new Date(first.started_at) : null
  const staleness = ((stalenessRes.data ?? []) as CityStalenessRow[]).map(r => ({
    city: r.city, future_events: Number(r.future_events), stale_14d: Number(r.stale_14d), stale_30d: Number(r.stale_30d), stale_60d: Number(r.stale_60d),
  }))
  const newsErrors = (newsRes.data ?? []) as NewsErrorRow[]
  const dbStats = ((dbRes.data ?? []) as HealthSnapshot['db'][])[0] ?? null

  const jobs = evaluateJobs(runs, now, monitoringSince)
  const issues = collectIssues({ jobs, staleness, newsErrors, db: dbStats })
  return { now, jobs, staleness, newsErrors, db: dbStats, monitoringSince, issues }
}
