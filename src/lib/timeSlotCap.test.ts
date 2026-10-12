import test from 'node:test'
import assert from 'node:assert/strict'
import {
  exceedsSlotCap,
  londonDay,
  normalizeSlotTitle,
  sameDayWindow,
  MAX_PERFORMANCES_PER_DAY,
} from './timeSlotCap.ts'

const slot = (title: string, start_date: string) => ({ title, start_date })

test('matinee + evening are both kept', () => {
  const matinee = slot('Hamilton', '2026-10-13T13:30:00Z')
  const evening = slot('Hamilton', '2026-10-13T18:30:00Z')
  assert.equal(exceedsSlotCap(matinee, []), false)
  assert.equal(exceedsSlotCap(evening, [matinee]), false)
})

test('a third performance on the same day is skipped', () => {
  const existing = [
    slot('Hamilton', '2026-10-13T11:00:00Z'),
    slot('Hamilton', '2026-10-13T15:00:00Z'),
  ]
  assert.equal(exceedsSlotCap(slot('Hamilton', '2026-10-13T19:00:00Z'), existing), true)
})

test('time-slot attractions are capped', () => {
  const existing = Array.from({ length: MAX_PERFORMANCES_PER_DAY }, (_, i) =>
    slot('Twist Museum - London\'s Home of Illusions PEAK', `2026-10-13T0${8 + i}:00:00Z`))
  assert.equal(
    exceedsSlotCap(slot('Twist Museum - London\'s Home of Illusions PEAK', '2026-10-13T12:00:00Z'), existing),
    true,
  )
})

test('different day is not counted', () => {
  const existing = [
    slot('Hamilton', '2026-10-12T13:30:00Z'),
    slot('Hamilton', '2026-10-12T18:30:00Z'),
  ]
  assert.equal(exceedsSlotCap(slot('Hamilton', '2026-10-13T18:30:00Z'), existing), false)
})

test('different title at the same venue is not counted', () => {
  const existing = [
    slot('Wicked', '2026-10-13T13:30:00Z'),
    slot('Wicked', '2026-10-13T18:30:00Z'),
  ]
  assert.equal(exceedsSlotCap(slot('Hamilton', '2026-10-13T19:00:00Z'), existing), false)
})

test('casing and punctuation do not defeat the cap (Matilda the Musical / Matilda The Musical)', () => {
  const existing = [
    slot('Matilda the Musical', '2026-10-13T13:30:00Z'),
    slot('Matilda The Musical', '2026-10-13T18:30:00Z'),
  ]
  assert.equal(exceedsSlotCap(slot('MATILDA: The Musical', '2026-10-13T19:30:00Z'), existing), true)
})

test('London calendar day is used, not the UTC day', () => {
  // 23:30 UTC on 1 Jul is 00:30 on 2 Jul in London (BST).
  assert.equal(londonDay('2026-07-01T23:30:00Z'), '2026-07-02')
  const existing = [
    slot('Late Show', '2026-07-01T23:30:00Z'),
    slot('Late Show', '2026-07-01T23:45:00Z'),
  ]
  // Same UTC day, but a 20:00 UTC show is on 1 Jul in London.
  assert.equal(exceedsSlotCap(slot('Late Show', '2026-07-01T20:00:00Z'), existing), false)
})

test('empty normalized title never blocks', () => {
  assert.equal(normalizeSlotTitle('!!!'), '')
  assert.equal(exceedsSlotCap(slot('!!!', '2026-10-13T19:00:00Z'), [slot('???', '2026-10-13T19:00:00Z'), slot('...', '2026-10-13T19:00:00Z')]), false)
})

test('sameDayWindow spans 24h either side', () => {
  const { from, to } = sameDayWindow('2026-10-13T12:00:00Z')
  assert.equal(from, '2026-10-12T12:00:00.000Z')
  assert.equal(to, '2026-10-14T12:00:00.000Z')
})
