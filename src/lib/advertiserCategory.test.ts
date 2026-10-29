import { test } from 'node:test'
import assert from 'node:assert/strict'
import { listingCategory } from './advertiserCategory.ts'

test('sign-up business types map to listing categories', () => {
  assert.equal(listingCategory('Restaurant'), 'restaurant')
  assert.equal(listingCategory('Bar or pub'), 'bar')
  assert.equal(listingCategory('Café'), 'cafe')
  assert.equal(listingCategory('Hotel or B&B'), 'hotel')
  assert.equal(listingCategory('Transport'), 'transport')
  assert.equal(listingCategory('Parking'), 'parking')
  assert.equal(listingCategory('Beauty'), 'beauty')
  assert.equal(listingCategory('Attraction'), 'attraction')
  assert.equal(listingCategory('Other'), 'other')
})
test('values saved by the old form (s replaced by _) still map', () => {
  assert.equal(listingCategory('re_taurant'), 'restaurant')
  assert.equal(listingCategory('tran_port'), 'transport')
  assert.equal(listingCategory('bar'), 'bar')
  assert.equal(listingCategory('hotel'), 'hotel')
})
test('unknown is other', () => { assert.equal(listingCategory('spaceship'), 'other'); assert.equal(listingCategory(null), 'other') })
