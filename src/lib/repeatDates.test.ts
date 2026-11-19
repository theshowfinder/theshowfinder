import test from 'node:test'
import assert from 'node:assert/strict'
import { repeatDates, parseExtraDates, shiftIsoByDates, monthlyLabel } from './repeatDates.ts'

test('weekly and fortnightly', () => {
  assert.deepEqual(repeatDates('2026-12-04', 'weekly', 3), ['2026-12-11', '2026-12-18'])
  assert.deepEqual(repeatDates('2026-12-04', 'fortnightly', 3), ['2026-12-18', '2027-01-01'])
  assert.deepEqual(repeatDates('2026-12-04', 'weekly', 1), [])
  assert.equal(repeatDates('2026-12-04', 'weekly', 99).length, 12)
})

test('monthly keeps the nth weekday', () => {
  // Fri 4 Dec 2026 is the 1st Friday -> 1st Friday of Jan and Feb 2027
  assert.deepEqual(repeatDates('2026-12-04', 'monthly', 3), ['2027-01-01', '2027-02-05'])
  // Sat 26 Dec 2026 is the last Saturday -> last Saturdays
  assert.deepEqual(repeatDates('2026-12-26', 'monthly', 3), ['2027-01-30', '2027-02-27'])
  assert.equal(monthlyLabel('2026-12-04'), 'Monthly (every 1st Friday)')
  assert.equal(monthlyLabel('2026-12-26'), 'Monthly (every last Saturday)')
})

test('extra dates are tidied', () => {
  const raw = JSON.stringify([{ date: '2026-12-18', time: '20:00' }, { date: '2026-12-11' }, { date: '2026-12-04', time: '19:30' }, { date: '2026-02-30' }, { date: 'x' }, { date: '2026-12-11' }])
  assert.deepEqual(parseExtraDates(raw, '2026-12-04', '19:30'), [{ date: '2026-12-11', time: '19:30' }, { date: '2026-12-18', time: '20:00' }])
  assert.deepEqual(parseExtraDates('nope', '2026-12-04', '19:30'), [])
})

test('sales end moves with the date', () => {
  assert.equal(shiftIsoByDates('2026-12-03T23:59:00.000Z', '2026-12-04', '2026-12-11'), '2026-12-10T23:59:00.000Z')
  assert.equal(shiftIsoByDates(null, '2026-12-04', '2026-12-11'), null)
})
