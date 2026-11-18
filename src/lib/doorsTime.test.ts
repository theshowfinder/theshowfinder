import test from 'node:test'
import assert from 'node:assert/strict'
import { parseDoorsTime } from './doorsTime.ts'

const show = '2026-11-20T20:00:00Z'      // 8pm London (GMT)
const t = (s: string, start = show) => parseDoorsTime(s, start)

test('reads the usual ways listings state doors', () => {
  assert.equal(t('DOORS: 19:00 START: 20:00'), '2026-11-20T19:00:00.000Z')
  assert.equal(t('Doors open at 7pm, an hour before'), '2026-11-20T19:00:00.000Z')
  assert.equal(t('Doors 6.30pm Show 8pm'), '2026-11-20T18:30:00.000Z')
  assert.equal(t('Doors Open 18:30'), '2026-11-20T18:30:00.000Z')
  assert.equal(t('Doors – 7.30pm'), '2026-11-20T19:30:00.000Z')
  assert.equal(t('Doors 7:15'), '2026-11-20T19:15:00.000Z')          // evening show, no am/pm
})

test('British Summer Time', () => {
  assert.equal(t('Doors: 18:00', '2027-06-12T19:00:00Z'), '2027-06-12T17:00:00.000Z')   // 8pm BST show, 6pm doors
})

test('ignores things that are not a doors time', () => {
  assert.equal(t('DOORS: TBC START: 19:30'), null)
  assert.equal(t('A Celebration of Early Doors Behind the Bar'), null)
  assert.equal(t('Opens the doors once more for the award-winning show'), null)
  assert.equal(t('Doors 7'), null)
  assert.equal(t('Doors: 21:00'), null)                                 // after the 8pm start
  assert.equal(t('Doors: 10:00'), null)                                 // 10 hours before
  assert.equal(t(''), null)
})
