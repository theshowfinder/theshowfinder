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
import { dedupeEventsByTitle, eventsThisWeekWindow } from './eventPools.ts'

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


// ── eventsThisWeekWindow: "This Week" starts tomorrow, excludes today ───
describe('eventsThisWeekWindow', () => {
  test('starts at tomorrow\'s London midnight, not today\'s', () => {
    // 15 Jan 2026, midday GMT — tomorrow's London midnight is 16 Jan 00:00.
    const now = new Date('2026-01-15T12:00:00.000Z')
    const { startISO } = eventsThisWeekWindow(now)
    assert.equal(startISO, '2026-01-16T00:00:00.000Z')
  })

  test('an event later today falls before the window and is excluded', () => {
    const now = new Date('2026-01-15T12:00:00.000Z')
    const { startISO } = eventsThisWeekWindow(now)
    const laterToday = '2026-01-15T20:00:00.000Z'
    assert.ok(laterToday < startISO, 'an event happening later today should fall before This Week\'s start')
  })

  test('an event tomorrow evening falls inside the window', () => {
    const now = new Date('2026-01-15T12:00:00.000Z')
    const { startISO, endISO } = eventsThisWeekWindow(now)
    const tomorrowEvening = '2026-01-16T20:00:00.000Z'
    assert.ok(tomorrowEvening >= startISO && tomorrowEvening < endISO)
  })

  test('spans exactly 7 London days from tomorrow (tomorrow through +8 days)', () => {
    const now = new Date('2026-01-15T12:00:00.000Z')
    const { startISO, endISO } = eventsThisWeekWindow(now)
    assert.equal(startISO, '2026-01-16T00:00:00.000Z')
    assert.equal(endISO,   '2026-01-23T00:00:00.000Z')
  })

  test('midnight rollover: the window computed just before and just after London midnight advances by exactly one day', () => {
    const justBeforeMidnight = eventsThisWeekWindow(new Date('2026-01-15T23:59:00.000Z'))
    const justAfterMidnight  = eventsThisWeekWindow(new Date('2026-01-16T00:01:00.000Z'))
    assert.equal(justBeforeMidnight.startISO, '2026-01-16T00:00:00.000Z')
    assert.equal(justAfterMidnight.startISO,  '2026-01-17T00:00:00.000Z')
    // Yesterday's "today" (the 15th) is now excluded from This Week either
    // side of the rollover — it was never in the window to begin with,
    // since the window always starts at tomorrow relative to `now`.
  })
})
