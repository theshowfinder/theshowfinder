import { test } from 'node:test'
import assert from 'node:assert/strict'
import { displayTitle, londonTimeSuffix } from './displayTitle.ts'

test('strips production suffixes from displayed titles', () => {
  assert.equal(displayTitle('Mamma Mia! (International)'), 'Mamma Mia!')
  assert.equal(displayTitle('Oliver (Touring)'), 'Oliver')
  assert.equal(displayTitle('Cats (UK Tour 2026)'), 'Cats')
  assert.equal(displayTitle('Hamilton'), 'Hamilton')
  assert.equal(displayTitle('The Mousetrap (60th Anniversary)'), 'The Mousetrap (60th Anniversary)')
  assert.equal(displayTitle('(Touring)'), '(Touring)')
})

test('time suffix is London time and hidden for midnight placeholders', () => {
  assert.equal(londonTimeSuffix('2026-10-24T13:30:00Z'), ' · 14:30')
  assert.equal(londonTimeSuffix('2026-12-24T19:30:00Z'), ' · 19:30')
  assert.equal(londonTimeSuffix('2026-12-24T00:00:00Z'), '')
  assert.equal(londonTimeSuffix('not a date'), '')
})

import { venueLabel } from './displayTitle.ts'
test('venueLabel does not repeat the city', () => {
  assert.equal(venueLabel('Vaillant Live, Derby', 'Derby'), 'Vaillant Live, Derby')
  assert.equal(venueLabel('The O2', 'London'), 'The O2, London')
  assert.equal(venueLabel('O2 Academy Leicester', 'Leicester'), 'O2 Academy Leicester')
  assert.equal(venueLabel('Somewhere', null), 'Somewhere')
  assert.equal(venueLabel(null, 'Derby'), 'Derby')
})
