// Unit tests for src/lib/feedHealth.ts (Phase 4 feed-health summarization).
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { summarizeFeedHealth, feedsNeedingAttention, FEED_STALE_THRESHOLD_MS, type SyncLogRow } from './feedHealth.ts'

const NOW = new Date('2026-10-01T12:00:00.000Z').getTime()

function log(city: string, overrides: Partial<SyncLogRow> = {}): SyncLogRow {
  return {
    city,
    started_at: new Date(NOW - 60 * 60 * 1000).toISOString(), // 1h ago
    completed_at: new Date(NOW - 59 * 60 * 1000).toISOString(),
    events_synced: 5,
    status: 'ok',
    error: null,
    ...overrides,
  }
}

describe('summarizeFeedHealth', () => {
  test('a feed with a recent successful run is healthy, not stale', () => {
    const summaries = summarizeFeedHealth(['Derby'], [log('Derby')], NOW)
    assert.equal(summaries.length, 1)
    assert.equal(summaries[0].isStale, false)
    assert.equal(summaries[0].recentFailureCount, 0)
    assert.equal(summaries[0].lastRun?.city, 'Derby')
  })

  test('a feed with zero log rows at all is "never run", reported as stale', () => {
    const summaries = summarizeFeedHealth(['Derby'], [], NOW)
    assert.equal(summaries[0].lastRun, null)
    assert.equal(summaries[0].isStale, true)
  })

  test('a feed whose last run is older than FEED_STALE_THRESHOLD_MS is stale', () => {
    const old = log('Derby', { started_at: new Date(NOW - FEED_STALE_THRESHOLD_MS - 1).toISOString() })
    const summaries = summarizeFeedHealth(['Derby'], [old], NOW)
    assert.equal(summaries[0].isStale, true)
  })

  test('a feed whose last run is just within the threshold is not stale', () => {
    const recent = log('Derby', { started_at: new Date(NOW - FEED_STALE_THRESHOLD_MS + 1000).toISOString() })
    const summaries = summarizeFeedHealth(['Derby'], [recent], NOW)
    assert.equal(summaries[0].isStale, false)
  })

  test('picks the most recent row as lastRun when several exist, regardless of input order', () => {
    const older = log('Derby', { started_at: new Date(NOW - 5 * 60 * 60 * 1000).toISOString(), events_synced: 1 })
    const newer = log('Derby', { started_at: new Date(NOW - 1 * 60 * 60 * 1000).toISOString(), events_synced: 2 })
    const summaries = summarizeFeedHealth(['Derby'], [older, newer], NOW)
    assert.equal(summaries[0].lastRun?.events_synced, 2)
  })

  test('counts failures only within the last recentWindow runs, not the whole history', () => {
    const rows = [
      log('Derby', { started_at: new Date(NOW - 1 * 60 * 60 * 1000).toISOString(), status: 'ok' }),
      log('Derby', { started_at: new Date(NOW - 2 * 60 * 60 * 1000).toISOString(), status: 'ok' }),
      log('Derby', { started_at: new Date(NOW - 3 * 60 * 60 * 1000).toISOString(), status: 'error' }),
      log('Derby', { started_at: new Date(NOW - 4 * 60 * 60 * 1000).toISOString(), status: 'error' }),
      log('Derby', { started_at: new Date(NOW - 5 * 60 * 60 * 1000).toISOString(), status: 'error' }),
      log('Derby', { started_at: new Date(NOW - 100 * 60 * 60 * 1000).toISOString(), status: 'error' }), // outside the window of 5
    ]
    const summaries = summarizeFeedHealth(['Derby'], rows, NOW, 5)
    assert.equal(summaries[0].recentRunCount, 5)
    assert.equal(summaries[0].recentFailureCount, 3)
  })

  test('rows for a city not in feedNames are ignored entirely', () => {
    const summaries = summarizeFeedHealth(['Derby'], [log('music:+21d')], NOW) // a Ticketmaster segment label, not a city-news feed
    assert.equal(summaries[0].lastRun, null)
  })

  test('returns one summary per requested feed name, in the given order', () => {
    const summaries = summarizeFeedHealth(['Derby', 'Leicester', 'UK National'], [log('Leicester')], NOW)
    assert.deepEqual(summaries.map(s => s.name), ['Derby', 'Leicester', 'UK National'])
  })
})

describe('feedsNeedingAttention', () => {
  test('excludes a healthy feed with no recent failures', () => {
    const summaries = summarizeFeedHealth(['Derby'], [log('Derby')], NOW)
    assert.deepEqual(feedsNeedingAttention(summaries), [])
  })

  test('includes a stale feed', () => {
    const summaries = summarizeFeedHealth(['Derby'], [], NOW)
    assert.equal(feedsNeedingAttention(summaries).length, 1)
  })

  test('includes a feed with at least one recent failure even if not stale', () => {
    const summaries = summarizeFeedHealth(['Derby'], [log('Derby', { status: 'error' })], NOW)
    assert.equal(feedsNeedingAttention(summaries).length, 1)
  })
})
