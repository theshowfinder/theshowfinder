import { test } from 'node:test'
import assert from 'node:assert/strict'
import { makeVoucherCode, isVoucherCode, makePin, voucherWindow, voucherState, distanceLabel, metresBetween, tidyPostcode, tidyOffer, MAX_PIN_FAILURES } from './businessOffers.ts'

const fixed = (vals: number[]) => (n: number) => Uint8Array.from({ length: n }, (_, i) => vals[i % vals.length])

test('codes are 8 readable characters', () => {
  const c = makeVoucherCode(fixed([0, 7, 30, 255, 12, 99, 3, 200]))
  assert.equal(c.length, 8)
  assert.ok(isVoucherCode(c), c)
  assert.ok(!isVoucherCode('ABCDEFG0'))
  assert.ok(!isVoucherCode('abcdefgh'))
})
test('PIN is 4 digits', () => {
  for (const v of [[0, 0], [255, 255], [12, 34]]) assert.match(makePin(fixed(v)), /^[1-9]\d{3}$/)
})
test('show-page voucher is valid on the show day in UK time', () => {
  // 15 Nov 2026 19:30 UK (GMT) -> valid 15 Nov 00:00 to 16 Nov 00:00 UK
  const w = voucherWindow(new Date('2026-10-29T10:00:00Z'), '2026-11-15T19:30:00Z')
  assert.equal(w.validFrom, '2026-11-15T00:00:00.000Z')
  assert.equal(w.expiresAt, '2026-11-16T00:00:00.000Z')
  // summer: 20 Jun 19:30 BST (18:30Z) -> 19 Jun 23:00Z to 20 Jun 23:00Z
  const s = voucherWindow(new Date('2026-06-01T10:00:00Z'), '2026-06-20T18:30:00Z')
  assert.equal(s.validFrom, '2026-06-19T23:00:00.000Z')
  assert.equal(s.expiresAt, '2026-06-20T23:00:00.000Z')
})
test('city-page voucher lasts 7 days', () => {
  const w = voucherWindow(new Date('2026-10-29T10:00:00Z'), null)
  assert.equal(w.expiresAt, '2026-11-05T10:00:00.000Z')
})
test('voucher states', () => {
  const v = { valid_from: '2026-11-15T00:00:00Z', expires_at: '2026-11-16T00:00:00Z', redeemed_at: null, pin_failures: 0 }
  assert.equal(voucherState(v, new Date('2026-11-14T23:00:00Z')), 'not-yet')
  assert.equal(voucherState(v, new Date('2026-11-15T18:00:00Z')), 'valid')
  assert.equal(voucherState(v, new Date('2026-11-16T00:00:00Z')), 'expired')
  assert.equal(voucherState({ ...v, redeemed_at: '2026-11-15T18:00:00Z' }, new Date('2026-11-15T19:00:00Z')), 'used')
  assert.equal(voucherState({ ...v, pin_failures: MAX_PIN_FAILURES }, new Date('2026-11-15T19:00:00Z')), 'locked')
})
test('distance labels', () => {
  assert.equal(distanceLabel(250), '4 min walk')
  assert.equal(distanceLabel(10), '1 min walk')
  assert.equal(distanceLabel(3000), '1.9 miles')
  assert.equal(distanceLabel(30_000), null)
  assert.equal(distanceLabel(null), null)
  // Derby Arena to Derby city centre, roughly 1.7 km
  const m = metresBetween({ lat: 52.9145, lng: -1.4469 }, { lat: 52.9225, lng: -1.4746 })
  assert.ok(m > 1500 && m < 2200, String(m))
})
test('postcodes and offers are tidied', () => {
  assert.equal(tidyPostcode('de1 2ab'), 'DE1 2AB')
  assert.equal(tidyPostcode('SW1A1AA'), 'SW1A 1AA')
  assert.equal(tidyPostcode('nonsense'), null)
  assert.equal(tidyOffer('  10%   off with your ticket '), '10% off with your ticket')
  assert.equal(tidyOffer(''), null)
})
