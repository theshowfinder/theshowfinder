import test from 'node:test'
import assert from 'node:assert/strict'
import { checkListings, titleSimilarity, type QualityRow } from './listingQuality.ts'

const row = (id: string, title: string, start: string, venue = 'v1', price: number | null = null): QualityRow =>
  ({ id, title, start_date: start, venue_id: venue, venue_name: 'Venue', price_from: price })

test('exact duplicates are hidden, keeping the one with a price', () => {
  const r = checkListings([row('b', 'Trainspotting the Musical', '2026-12-01T19:30:00Z', 'v1', 30), row('a', 'Trainspotting  The Musical!', '2026-12-01T19:30:00Z')])
  assert.deepEqual(r.autoHide.map(h => [h.eventId, h.keepId]), [['a', 'b']])
  assert.equal(r.issues.length, 0)
})

test('near duplicates go for review, different shows in two rooms do not', () => {
  const r = checkListings([
    row('1', 'West Ham V Middlesbrough', '2026-12-05T15:00:00Z'),
    row('2', 'West Ham United vs Middlesbrough', '2026-12-05T15:00:00Z'),
    row('3', 'Talisk', '2026-12-02T19:30:00Z', 'v2'),
    row('4', 'The Magic Numbers', '2026-12-02T19:30:00Z', 'v2'),
    row('5', 'Gladiators Live Tour', '2026-11-21T13:00:00Z', 'v3'),
    row('6', 'Gladiators Live Tour', '2026-11-21T18:00:00Z', 'v3'), // matinee + evening: fine
  ])
  assert.deepEqual(r.issues.map(i => [i.eventId, i.kind]), [['2', 'near_duplicate']])
  assert.equal(r.autoHide.length, 0)
})

test('suspect words and 23:59 starts go for review', () => {
  const r = checkListings([
    row('g', 'Ulster Rugby TM Gift Card', '2026-12-05T15:00:00Z', 'v1'),
    row('m', 'Moseley Shoals Bundle', '2026-12-04T23:59:00Z', 'v2'),
    row('s', 'Shed Seven', '2026-12-04T19:30:00Z', 'v3'),
  ])
  assert.deepEqual(r.issues.map(i => [i.eventId, i.kind]).sort(), [['g', 'not_a_show_words'], ['m', 'not_a_show_words'], ['m', 'placeholder_time']])
})

test('similarity', () => {
  assert.equal(titleSimilarity('Ash', 'SJM Concerts present ASH') >= 0.5, false) // too short to trust containment
  assert.ok(titleSimilarity('UB40 Feat Ali Campbell - the Big Love Tour', 'UB40 feat Ali Campbell') >= 0.5)
  assert.ok(titleSimilarity('Talisk', 'The Magic Numbers') < 0.5)
})
