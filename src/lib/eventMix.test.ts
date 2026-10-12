import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { isAttraction, mixEvents, trimTonight, type MixEvent } from './eventMix.ts'

let n = 0
function ev(title: string, start_date: string, venue = 'Venue', category = 'concert'): MixEvent & { id: number } {
  return { id: ++n, title, start_date, venue_id: venue, venue_name: venue, category }
}

describe('isAttraction', () => {
  test('flags timed-entry attractions', () => {
    assert.ok(isAttraction({ title: 'Madame Tussauds London - Standard Entry', venue_name: 'Madame Tussauds London' }))
    assert.ok(isAttraction({ title: 'London Eye - Standard Experience', venue_name: 'The London Eye' }))
    assert.ok(isAttraction({ title: "Twist Museum - London's Home of Illusions PEAK", venue_name: 'Twist Museum' }))
    assert.ok(isAttraction({ title: 'The Chimney Lift at Battersea Power Station', venue_name: 'The Chimney Lift at Battersea Power Station' }))
    assert.ok(isAttraction({ title: "Shrek's Adventure - Standard Experience", venue_name: 'County Hall' }))
    assert.ok(isAttraction({ title: 'Some Place - Fast Track Entry', venue_name: 'X' }))
  })
  test('does not flag real shows', () => {
    for (const [t, v] of [
      ['Hamilton', 'Victoria Palace Theatre'],
      ['The Mousetrap', "St Martin's Theatre"],
      ['Come Alive! The Greatest Showman Circus Spectacular', 'Empress Museum'],
      ['The World of Hans Zimmer - Premium Ticket and Hotel Experiences', 'The O2'],
      ['Abba Voyage - VIP Premium Package', 'ABBA Arena'],
      ['Witness for the Prosecution', 'County Hall'],
    ]) assert.equal(isAttraction({ title: t, venue_name: v }), false, t)
  })
})

describe('mixEvents (week)', () => {
  test('attractions cannot dominate a list of real shows', () => {
    const pool = [
      ...Array.from({ length: 8 }, (_, i) => ev(`Attraction ${i} - Standard Entry`, '2026-10-13T09:00:00Z', `Att${i}`, 'family')),
      ev('Hamilton', '2026-10-13T18:30:00Z', 'Victoria Palace', 'theatre'),
      ev('Wicked', '2026-10-13T19:00:00Z', 'Apollo', 'theatre'),
      ev('Coldplay', '2026-10-14T19:00:00Z', 'Wembley'),
      ev('Mo Gilligan', '2026-10-15T20:00:00Z', 'Comedy Store', 'comedy'),
    ]
    const out = mixEvents(pool, { limit: 6 })
    assert.equal(out.filter(e => isAttraction(e)).length, 2)
    assert.equal(out.length, 6)
    for (const t of ['Hamilton', 'Wicked', 'Coldplay', 'Mo Gilligan']) assert.ok(out.some(e => e.title === t), t)
  })

  test('spreads across days instead of filling with the soonest day', () => {
    const pool = [
      ...Array.from({ length: 10 }, (_, i) => ev(`Day1 Show ${i}`, `2026-10-13T1${i % 10}:00:00Z`, `V1-${i}`)),
      ev('Day3 Show', '2026-10-15T19:00:00Z', 'V3'),
      ev('Day5 Show', '2026-10-17T19:00:00Z', 'V5'),
    ]
    const out = mixEvents(pool, { limit: 5 })
    assert.ok(out.some(e => e.title === 'Day3 Show'))
    assert.ok(out.some(e => e.title === 'Day5 Show'))
  })

  test('spreads across categories within a day', () => {
    const pool = [
      ev('Gig 1', '2026-10-13T19:00:00Z', 'A', 'concert'),
      ev('Gig 2', '2026-10-13T19:00:00Z', 'B', 'concert'),
      ev('Gig 3', '2026-10-13T19:00:00Z', 'C', 'concert'),
      ev('Play', '2026-10-13T19:00:00Z', 'D', 'theatre'),
      ev('Stand-up', '2026-10-13T19:00:00Z', 'E', 'comedy'),
    ]
    const out = mixEvents(pool, { limit: 3 })
    assert.deepEqual(new Set(out.map(e => e.category)), new Set(['concert', 'theatre', 'comedy']))
  })

  test('caps cards per venue, but backfills when there is nothing else', () => {
    const o2 = Array.from({ length: 6 }, (_, i) => ev(`O2 Act ${i}`, `2026-10-13T19:0${i}:00Z`, 'The O2'))
    const other = ev('Elsewhere', '2026-10-13T20:00:00Z', 'Other')
    const capped = mixEvents([...o2, other], { limit: 4, maxPerVenue: 2 })
    assert.equal(capped.filter(e => e.venue_id === 'The O2').length, 3) // 2 + backfill to reach the limit
    assert.ok(capped.some(e => e.title === 'Elsewhere'))
    const small = mixEvents(o2, { limit: 5, maxPerVenue: 2 })
    assert.equal(small.length, 5)
  })

  test('one card per show (case-insensitive), earliest pool entry wins', () => {
    const a = ev('Alpha Wolf', '2026-10-13T19:00:00Z', 'Electric Brixton')
    const b = ev('ALPHA WOLF', '2026-10-13T19:00:00Z', 'Electric Brixton')
    const out = mixEvents([a, b], { limit: 5 })
    assert.equal(out.length, 1)
    assert.equal(out[0].id, a.id)
  })

  test('output is soonest first', () => {
    const out = mixEvents([
      ev('Later', '2026-10-16T19:00:00Z', 'A'),
      ev('Sooner', '2026-10-13T19:00:00Z', 'B'),
    ], { limit: 5 })
    assert.deepEqual(out.map(e => e.title), ['Sooner', 'Later'])
  })

  test('attractions still appear when there is nothing else (small city)', () => {
    const pool = Array.from({ length: 4 }, (_, i) => ev(`Att ${i} - Standard Entry`, '2026-10-13T09:00:00Z', `A${i}`, 'family'))
    assert.equal(mixEvents(pool, { limit: 3 }).length, 3)
  })

  test('empty pool and zero limit', () => {
    assert.deepEqual(mixEvents([], { limit: 5 }), [])
    assert.deepEqual(mixEvents([ev('X', '2026-10-13T19:00:00Z')], { limit: 0 }), [])
  })
})

describe('mixEvents (ranked)', () => {
  test('keeps prominence order and caps one venue', () => {
    const pool = [
      ...Array.from({ length: 7 }, (_, i) => ev(`O2 Show ${i}`, `2026-11-0${i + 1}T19:00:00Z`, 'The O2')),
      ev('Wembley Game', '2026-11-12T19:45:00Z', 'Wembley', 'sports'),
      ev('Spurs Game', '2026-10-24T17:30:00Z', 'Spurs', 'sports'),
    ]
    const out = mixEvents(pool, { limit: 5, maxPerVenue: 2, mode: 'ranked' })
    assert.equal(out.filter(e => e.venue_id === 'The O2').length, 2 + 1) // 2 capped, + backfill to fill limit 5
    assert.ok(out.some(e => e.title === 'Wembley Game'))
    assert.ok(out.some(e => e.title === 'Spurs Game'))
    // pool order preserved
    const idx = out.map(e => pool.indexOf(e))
    assert.deepEqual(idx, [...idx].sort((a, b) => a - b))
  })
})

describe('trimTonight', () => {
  test('collapses attraction slots to one per attraction and caps them', () => {
    const events = [
      ev('Madame Tussauds London - Standard Entry', '2026-10-12T09:00:00Z', 'MT'),
      ev('Madame Tussauds London - Standard Entry', '2026-10-12T09:15:00Z', 'MT'),
      ev('London Eye - Standard Experience', '2026-10-12T09:00:00Z', 'LE'),
      ev('Sea Life London - Standard Entry', '2026-10-12T09:00:00Z', 'SL'),
      ev('London Dungeon - Standard Entry', '2026-10-12T09:00:00Z', 'LD'),
      ev('Hamilton', '2026-10-12T18:30:00Z', 'VP', 'theatre'),
      ev('Moses Yoofee Trio', '2026-10-12T18:00:00Z', 'Blue Note'),
      ev('Moses Yoofee Trio', '2026-10-12T20:30:00Z', 'Blue Note'),
    ]
    const out = trimTonight(events, { maxAttractions: 3 })
    assert.equal(out.filter(e => isAttraction(e)).length, 3)
    assert.equal(out.filter(e => e.title === 'Moses Yoofee Trio').length, 2) // real sessions kept
    assert.ok(out.some(e => e.title === 'Hamilton'))
    assert.equal(out.filter(e => e.title.startsWith('Madame')).length, 1)
  })

  test('applies the overall limit', () => {
    const events = Array.from({ length: 10 }, (_, i) => ev(`Show ${i}`, `2026-10-12T1${i}:00:00Z`, `V${i}`))
    assert.equal(trimTonight(events, { limit: 4 }).length, 4)
  })
})
