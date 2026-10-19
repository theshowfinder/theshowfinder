import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { pagesNeeded, needsSplit, splitWindow, decideCycle, horizonEnd, chunkEnd, MAX_QUERY_RESULTS } from './tmSweepPlan.ts'

describe('tmSweepPlan', () => {
  test('pagesNeeded caps at the five pages TM will serve', () => {
    assert.equal(pagesNeeded(0), 0)
    assert.equal(pagesNeeded(1), 1)
    assert.equal(pagesNeeded(200), 1)
    assert.equal(pagesNeeded(201), 2)
    assert.equal(pagesNeeded(1000), 5)
    assert.equal(pagesNeeded(5000), 5)
  })

  test('needsSplit only when over the cap and the window is still halvable', () => {
    const day = 86_400_000
    assert.equal(needsSplit(MAX_QUERY_RESULTS, 0, 30 * day), false)
    assert.equal(needsSplit(MAX_QUERY_RESULTS + 1, 0, 30 * day), true)
    assert.equal(needsSplit(5000, 0, 3_600_000), false)
  })

  test('splitWindow halves without gaps or overlap', () => {
    const [[a0, a1], [b0, b1]] = splitWindow(1000, 5001)
    assert.equal(a0, 1000)
    assert.equal(a1, b0)
    assert.equal(b1, 5001)
    assert.ok(a1 > a0 && b1 > b0)
  })

  test('decideCycle starts, continues and idles correctly', () => {
    const now = new Date('2026-10-20T04:00:00Z')
    assert.deepEqual(decideCycle(null, now), { action: 'start' })
    assert.deepEqual(decideCycle({ segmentIndex: 0, windowStart: null, cycleStartedAt: null, completedAt: null }, now), { action: 'start' })
    assert.deepEqual(decideCycle({ segmentIndex: 2, windowStart: '2026-12-01T00:00:00Z', cycleStartedAt: '2026-10-20T01:00:00Z', completedAt: '2026-10-19T03:00:00Z' }, now), { action: 'continue' })
    assert.equal(decideCycle({ segmentIndex: 0, windowStart: null, cycleStartedAt: '2026-10-20T01:00:00Z', completedAt: '2026-10-20T02:30:00Z' }, now).action, 'idle')
    assert.equal(decideCycle({ segmentIndex: 0, windowStart: null, cycleStartedAt: '2026-10-19T01:00:00Z', completedAt: '2026-10-19T02:30:00Z' }, now).action, 'start')
  })

  test('horizon and chunk helpers', () => {
    const start = new Date('2026-10-20T00:00:00Z')
    assert.equal(horizonEnd(start).toISOString(), '2028-10-20T00:00:00.000Z')
    const h = horizonEnd(start).getTime()
    assert.equal(chunkEnd(h - 86_400_000, h), h)
  })
})
