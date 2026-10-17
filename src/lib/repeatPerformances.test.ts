import { test } from 'node:test'
import assert from 'node:assert/strict'
import { repeatPerformanceSlugs, isRepeatPerformance, repeatKey } from './repeatPerformances.ts'

const mk = (n: number, title = 'Hamilton', venue = 'v1') => ({
  slug: `${title}-${n}`, title, venue_id: venue, start_date: `2027-01-${String(n).padStart(2, '0')}T19:30:00Z`,
})

test('only the soonest five performances of a long run stay indexable', () => {
  const rows = Array.from({ length: 9 }, (_, i) => mk(i + 1)).reverse()
  const drop = repeatPerformanceSlugs(rows)
  assert.equal(drop.size, 4)
  assert.ok(!drop.has('Hamilton-1') && !drop.has('Hamilton-5'))
  assert.ok(drop.has('Hamilton-6') && drop.has('Hamilton-9'))
})

test('short runs, tours and different venues are untouched', () => {
  const tour = Array.from({ length: 5 }, (_, i) => mk(i + 1, 'Band', `v${i}`))
  const fiveNights = Array.from({ length: 5 }, (_, i) => mk(i + 1, 'Comic'))
  assert.equal(repeatPerformanceSlugs([...tour, ...fiveNights]).size, 0)
})

test('title matching ignores case and spacing; no venue means no grouping', () => {
  assert.equal(repeatKey(' Hamilton ', 'v1'), repeatKey('HAMILTON', 'v1'))
  const noVenue = Array.from({ length: 9 }, (_, i) => ({ ...mk(i + 1), venue_id: null }))
  assert.equal(repeatPerformanceSlugs(noVenue).size, 0)
})

test('isRepeatPerformance flips at the sixth performance', () => {
  assert.equal(isRepeatPerformance(4), false)
  assert.equal(isRepeatPerformance(5), true)
})
