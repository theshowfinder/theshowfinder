import { test } from 'node:test'
import assert from 'node:assert/strict'
import { collectIssues, evaluateJobs, shouldSendAlert, stalenessSummary, type JobRunRow } from './jobHealth.ts'

const now = new Date('2026-10-20T12:00:00Z')
const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000).toISOString()
const run = (job: string, h: number, status: string, error?: string): JobRunRow => ({ job, started_at: hoursAgo(h), finished_at: hoursAgo(h - 0.05), status, error })
const find = (rows: ReturnType<typeof evaluateJobs>, job: string) => rows.find(r => r.job === job)!

test('fresh monitoring raises no overdue or never-ran alarms', () => {
  const rows = evaluateJobs([run('sync-events', 1, 'ok')], now, new Date(hoursAgo(2)))
  assert.equal(find(rows, 'sync-events').issue, null)
  assert.equal(find(rows, 'sync-onsale').issue, null)
})

test('a job that has not succeeded within its window is overdue', () => {
  const rows = evaluateJobs([run('sync-events', 40, 'ok'), run('sync-onsale', 1, 'ok')], now, new Date(hoursAgo(100)))
  assert.equal(find(rows, 'sync-events').issue, 'overdue')
  assert.equal(find(rows, 'sync-onsale').issue, null)
  assert.equal(find(rows, 'sync-gigsberg').issue, 'never_ran')
})

test('a failing last run is flagged and carries its error', () => {
  const rows = evaluateJobs([run('sync-events', 30, 'ok'), run('sync-events', 2, 'error', 'boom')], now, new Date(hoursAgo(100)))
  assert.equal(find(rows, 'sync-events').issue, 'failing')
  assert.equal(find(rows, 'sync-events').lastError, 'boom')
  assert.equal(find(rows, 'sync-events').failuresLast24h, 1)
})

test('a run stuck in running state is treated as a failure, a recent one is not', () => {
  const stuck: JobRunRow = { job: 'sync-events', started_at: hoursAgo(1), finished_at: null, status: 'running' }
  const fresh: JobRunRow = { job: 'sync-onsale', started_at: new Date(now.getTime() - 2 * 60_000).toISOString(), finished_at: null, status: 'running' }
  const rows = evaluateJobs([stuck, fresh], now, new Date(hoursAgo(2)))
  assert.equal(find(rows, 'sync-events').issue, 'failing')
  assert.equal(find(rows, 'sync-onsale').issue, null)
})

test('staleness and news issues are raised with stable keys', () => {
  const staleness = [
    { city: 'London', future_events: 1000, stale_14d: 500, stale_30d: 400, stale_60d: 300 },
    { city: 'Derby', future_events: 100, stale_14d: 90, stale_30d: 90, stale_60d: 90 },
  ]
  const s = stalenessSummary(staleness)
  assert.equal(s.total, 1100)
  const issues = collectIssues({
    jobs: [], staleness,
    newsErrors: [
      { city: 'National — The Independent', error: 'x', started_at: hoursAgo(1) },
      { city: 'National — The Independent', error: 'x', started_at: hoursAgo(5) },
    ],
    db: { max_connections: 60, connections: 55 },
  })
  const keys = issues.map(i => i.key)
  assert.ok(keys.includes('stale-listings'))
  assert.ok(keys.includes('stale-city:London'))
  assert.ok(!keys.includes('stale-city:Derby'))   // under the 200-event minimum
  assert.ok(keys.includes('news-source:National — The Independent'))
  assert.ok(keys.includes('db-connections'))
})

test('alerts are sent for new problems and repeated after 3 days, otherwise stay quiet', () => {
  const issues = [{ key: 'a', severity: 'high' as const, message: 'a' }]
  assert.equal(shouldSendAlert(null, [], now), false)
  assert.equal(shouldSendAlert(null, issues, now), true)
  assert.equal(shouldSendAlert({ keys: ['a'], emailedAt: hoursAgo(5) }, issues, now), false)
  assert.equal(shouldSendAlert({ keys: ['a'], emailedAt: hoursAgo(80) }, issues, now), true)
  assert.equal(shouldSendAlert({ keys: ['b'], emailedAt: hoursAgo(1) }, issues, now), true)
})

test('tm-not-daily is raised only after a full sweep has finished and too many events are older than 48h', () => {
  const base = { jobs: [], staleness: [], newsErrors: [] }
  const bad = { future_tm: 1000, stale_48h: 100, lap_completed: true, lap_completed_at: null }
  assert.ok(collectIssues({ ...base, tmFreshness: bad }).some(i => i.key === 'tm-not-daily'))
  assert.ok(!collectIssues({ ...base, tmFreshness: { ...bad, lap_completed: false } }).some(i => i.key === 'tm-not-daily'))
  assert.ok(!collectIssues({ ...base, tmFreshness: { ...bad, stale_48h: 20 } }).some(i => i.key === 'tm-not-daily'))
})
