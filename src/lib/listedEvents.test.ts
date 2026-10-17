import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { listedEventsCount, LISTED_EVENTS_VIEW, LIVE_EVENT_STATUSES } from './listedEvents.ts'

type Call = [string, ...unknown[]]
function fakeClient() {
  const calls: Call[] = []
  let from = ''
  const q: Record<string, unknown> = {}
  for (const m of ['select', 'in', 'gte', 'lt', 'ilike', 'eq']) {
    q[m] = (...a: unknown[]) => { calls.push([m, ...a]); return q }
  }
  const client = { from: (v: string) => { from = v; return q } }
  return { client: client as never, calls, view: () => from }
}

describe('listedEventsCount: the one canonical count query', () => {
  test('reads the de-duplicated view, live statuses only, future only', () => {
    const f = fakeClient()
    listedEventsCount(f.client, { fromISO: '2026-10-17T00:00:00.000Z' })
    assert.equal(f.view(), 'listed_events_with_venue')
    assert.equal(LISTED_EVENTS_VIEW, 'listed_events_with_venue')
    assert.deepEqual(f.calls.find(c => c[0] === 'in'), ['in', 'status', LIVE_EVENT_STATUSES])
    assert.deepEqual(f.calls.find(c => c[0] === 'gte'), ['gte', 'start_date', '2026-10-17T00:00:00.000Z'])
    assert.ok(!LIVE_EVENT_STATUSES.includes('cancelled'))
    assert.ok(!LIVE_EVENT_STATUSES.includes('postponed'))
  })
  test('city, venue, category and upper bound filters are applied', () => {
    const f = fakeClient()
    listedEventsCount(f.client, { city: '  Derby ', venueId: 'v1', category: 'comedy', toISO: '2027-01-01T00:00:00.000Z' })
    assert.deepEqual(f.calls.find(c => c[0] === 'ilike'), ['ilike', 'venue_city', 'Derby'])
    assert.deepEqual(f.calls.find(c => c[0] === 'eq' && c[1] === 'venue_id'), ['eq', 'venue_id', 'v1'])
    assert.deepEqual(f.calls.find(c => c[0] === 'eq' && c[1] === 'category'), ['eq', 'category', 'comedy'])
    assert.deepEqual(f.calls.find(c => c[0] === 'lt'), ['lt', 'start_date', '2027-01-01T00:00:00.000Z'])
  })
})

// Guard: public pages must never read the raw (un-deduplicated) view again.
describe('public pages read listed_events_with_venue, not the raw view', () => {
  const ALLOWED_RAW = new Set([
    'src/app/api/saved/route.ts', // resolves a user's saved event ids: must find any row
  ])
  function walk(dir: string, out: string[] = []): string[] {
    for (const n of readdirSync(dir)) {
      const p = join(dir, n)
      if (statSync(p).isDirectory()) walk(p, out)
      else if (/\.(ts|tsx)$/.test(n) && !n.endsWith('.test.ts')) out.push(p)
    }
    return out
  }
  test('no non-admin source file queries events_with_venue directly', () => {
    const root = process.cwd()
    const offenders = walk(join(root, 'src'))
      .map(p => p.slice(root.length + 1))
      .filter(p => !p.startsWith('src/app/admin') && !p.startsWith('src/lib/types') && !ALLOWED_RAW.has(p))
      .filter(p => /from\(\s*'events_with_venue'\s*\)/.test(readFileSync(join(root, p), 'utf-8')))
    assert.deepEqual(offenders, [])
  })
})

import { withoutDuplicateIds, fetchDuplicateIds, dropDuplicateEvents } from './listedEvents.ts'

describe('dropping duplicates from lists that read the base events table', () => {
  test('withoutDuplicateIds keeps order and removes only duplicates', () => {
    const rows = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
    assert.deepEqual(withoutDuplicateIds(rows, new Set(['b'])), [{ id: 'a' }, { id: 'c' }])
    assert.equal(withoutDuplicateIds(rows, new Set()), rows)
  })
  test('fetchDuplicateIds asks for non-canonical ids only and fails open', async () => {
    const calls: unknown[][] = []
    const q: Record<string, unknown> = {}
    q.select = () => q
    q.in = (...a: unknown[]) => { calls.push(['in', ...a]); return q }
    q.eq = (...a: unknown[]) => { calls.push(['eq', ...a]); return Promise.resolve({ data: [{ id: 'b' }], error: null }) }
    const ok = await fetchDuplicateIds({ from: () => q } as never, ['a', 'b'])
    assert.deepEqual([...ok], ['b'])
    assert.deepEqual(calls.find(c => c[0] === 'eq'), ['eq', 'is_canonical', false])
    const bad: Record<string, unknown> = { select: () => bad, in: () => bad, eq: () => Promise.resolve({ data: null, error: { message: 'x' } }) }
    assert.equal((await fetchDuplicateIds({ from: () => bad } as never, ['a'])).size, 0)
    assert.deepEqual(await dropDuplicateEvents({ from: () => bad } as never, [{ id: 'a' }]), [{ id: 'a' }])
  })
})
