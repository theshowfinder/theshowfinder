// Only dedupeEventsByTitle is tested directly here — every other export
// in eventPools.ts takes a live SupabaseClient and queries the database,
// which this plain `node --test` runner has no way to provide (same
// reasoning as linkHealth.ts/newsPublishing.ts's DB-touching exports).
// dedupeEventsByTitle itself is pure, so it's exercised directly —
// this is the "duplicate prevention" coverage for the Manchester phase
// (This Week / Top Events never show the same real-world show twice,
// even though Ticketmaster syncs it as several SKU rows sharing a title).
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { dedupeEventsByTitle } from './eventPools.ts'

function row(title: string, id: string) {
  return { id, title } as unknown as Parameters<typeof dedupeEventsByTitle>[0][number]
}

describe('dedupeEventsByTitle', () => {
  test('keeps only the first row for a repeated title', () => {
    const pool = [row('Coldplay', '1'), row('Coldplay', '2'), row('Harry Styles', '3')]
    const result = dedupeEventsByTitle(pool, 10)
    assert.deepEqual(result.map(r => r.id), ['1', '3'])
  })

  test('respects the limit after deduping', () => {
    const pool = [row('A', '1'), row('B', '2'), row('C', '3')]
    const result = dedupeEventsByTitle(pool, 2)
    assert.deepEqual(result.map(r => r.id), ['1', '2'])
  })

  test('empty pool — empty result, no throw', () => {
    assert.deepEqual(dedupeEventsByTitle([], 10), [])
  })

  test('distinct titles are never collapsed', () => {
    const pool = [row('Coldplay', '1'), row('Coldplay Tribute', '2')]
    const result = dedupeEventsByTitle(pool, 10)
    assert.equal(result.length, 2)
  })
})
