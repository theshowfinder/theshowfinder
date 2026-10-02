import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { isEventFinished, isTonightEvent, sortTonightEvents, londonDayWindow } from './tonight.ts'

describe('isEventFinished', () => {
  test('no end_date at all — never counted as finished', () => {
    assert.equal(isEventFinished({ end_date: null }, Date.parse('2026-06-15T23:00:00Z')), false)
  })
  test('end_date in the future — not finished', () => {
    assert.equal(isEventFinished({ end_date: '2026-06-16T00:00:00Z' }, Date.parse('2026-06-15T23:00:00Z')), false)
  })
  test('end_date already passed — finished', () => {
    assert.equal(isEventFinished({ end_date: '2026-06-15T20:00:00Z' }, Date.parse('2026-06-15T23:00:00Z')), true)
  })
})

describe('isTonightEvent', () => {
  // A GMT day: 2026-01-15 London midnight-to-midnight is exactly UTC
  // midnight-to-midnight.
  const window = londonDayWindow(new Date('2026-01-15T12:00:00Z'))

  test('event starting today, no end_date, checked right after start — tonight', () => {
    const now = Date.parse('2026-01-15T20:05:00Z')
    assert.equal(isTonightEvent({ start_date: '2026-01-15T20:00:00Z', end_date: null, status: 'on_sale' }, now, window), true)
  })

  test('event starting today but with a passed end_date — not tonight (finished)', () => {
    const now = Date.parse('2026-01-15T23:00:00Z')
    assert.equal(
      isTonightEvent({ start_date: '2026-01-15T18:00:00Z', end_date: '2026-01-15T21:00:00Z', status: 'on_sale' }, now, window),
      false,
    )
  })

  test('event starting tomorrow — not tonight', () => {
    const now = Date.parse('2026-01-15T20:00:00Z')
    assert.equal(isTonightEvent({ start_date: '2026-01-16T20:00:00Z', end_date: null, status: 'on_sale' }, now, window), false)
  })

  test('event starting yesterday — not tonight', () => {
    const now = Date.parse('2026-01-15T20:00:00Z')
    assert.equal(isTonightEvent({ start_date: '2026-01-14T20:00:00Z', end_date: null, status: 'on_sale' }, now, window), false)
  })

  test('cancelled event today — excluded', () => {
    const now = Date.parse('2026-01-15T20:00:00Z')
    assert.equal(isTonightEvent({ start_date: '2026-01-15T20:00:00Z', end_date: null, status: 'cancelled' }, now, window), false)
  })

  test('postponed event today — excluded', () => {
    const now = Date.parse('2026-01-15T20:00:00Z')
    assert.equal(isTonightEvent({ start_date: '2026-01-15T20:00:00Z', end_date: null, status: 'postponed' }, now, window), false)
  })

  test('sold-out event today — still shown (sold out isn’t cancelled)', () => {
    const now = Date.parse('2026-01-15T20:00:00Z')
    assert.equal(isTonightEvent({ start_date: '2026-01-15T20:00:00Z', end_date: null, status: 'sold_out' }, now, window), true)
  })

  test('event starting right at the end of today’s window — excluded (that instant belongs to tomorrow)', () => {
    const now = Date.parse('2026-01-15T20:00:00Z')
    assert.equal(isTonightEvent({ start_date: window.endISO, end_date: null, status: 'on_sale' }, now, window), false)
  })
})

describe('isTonightEvent — BST boundary (reuses londonDayWindow, so inherits its DST correctness)', () => {
  // 2026-06-15 is deep in BST (UTC+1) — London midnight is 23:00 UTC the
  // previous day.
  const window = londonDayWindow(new Date('2026-06-15T18:00:00Z'))

  test('an event at 23:30 UTC (00:30 BST — already tomorrow in London) is excluded from today\u2019s window', () => {
    const now = Date.parse('2026-06-15T23:35:00Z')
    // 23:30 UTC on the 15th is 00:30 BST on the 16th — tomorrow in
    // London, not today. This proves the boundary is computed in London
    // time, not naive UTC (a naive UTC-midnight check would wrongly
    // include this).
    assert.equal(isTonightEvent({ start_date: '2026-06-15T23:30:00Z', end_date: null, status: 'on_sale' }, now, window), false)
  })

  test('an event at 22:00 UTC (23:00 BST, still the 15th in London) is tonight', () => {
    const now = Date.parse('2026-06-15T22:05:00Z')
    assert.equal(isTonightEvent({ start_date: '2026-06-15T22:00:00Z', end_date: null, status: 'on_sale' }, now, window), true)
  })
})

describe('sortTonightEvents', () => {
  test('sorts by start_date ascending regardless of input order', () => {
    const events = [
      { id: 'c', start_date: '2026-01-15T21:00:00Z' },
      { id: 'a', start_date: '2026-01-15T18:00:00Z' },
      { id: 'b', start_date: '2026-01-15T19:30:00Z' },
    ]
    assert.deepEqual(sortTonightEvents(events).map(e => e.id), ['a', 'b', 'c'])
  })

  test('does not mutate the input array', () => {
    const events = [
      { id: 'b', start_date: '2026-01-15T19:30:00Z' },
      { id: 'a', start_date: '2026-01-15T18:00:00Z' },
    ]
    const original = [...events]
    sortTonightEvents(events)
    assert.deepEqual(events, original)
  })
})
