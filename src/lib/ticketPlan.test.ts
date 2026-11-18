import test from 'node:test'
import assert from 'node:assert/strict'
import { validateTicketPlan, discountedPence, cheapestPence } from './ticketPlan.ts'

const now = new Date('2026-11-18T12:00:00Z')
const start = '2026-12-20T19:30:00Z'

test('several ticket types, early bird end date in London time', () => {
  const r = validateTicketPlan({ types: [
    { name: 'Early bird', price: '8', capacity: '50', salesEnd: '2026-12-01' },
    { name: 'Standard', price: '10.00', capacity: '150' },
    { name: 'VIP', price: '£20', capacity: '20' },
  ] }, start, now)
  assert.ok(r.ok)
  if (!r.ok) return
  assert.equal(r.value.types.length, 3)
  assert.equal(r.value.types[0].sales_end, '2026-12-01T23:59:00.000Z')
  assert.equal(r.value.types[1].sales_end, null)
  assert.equal(cheapestPence(r.value), 800)
})

test('ticket type errors', () => {
  assert.equal(validateTicketPlan({ types: [] }, start, now).ok, false)
  const dup = validateTicketPlan({ types: [{ name: 'VIP', price: '10', capacity: '5' }, { name: 'vip', price: '12', capacity: '5' }] }, start, now)
  assert.equal(dup.ok, false)
  assert.equal(validateTicketPlan({ types: [{ name: 'A', price: '0.50', capacity: '5' }] }, start, now).ok, false)
  // single unnamed type is just "Ticket"
  const one = validateTicketPlan({ types: [{ price: '10', capacity: '100' }] }, start, now)
  assert.ok(one.ok && one.value.types[0].name === 'Ticket')
})

test('discount codes', () => {
  const r = validateTicketPlan({ types: [{ name: 'Standard', price: '10', capacity: '100' }], codes: [
    { code: 'friends 20', kind: 'percent', amount: '20%', maxUses: '30' },
    { code: 'BAND', kind: 'amount', amount: '2.50', expires: '2026-12-10' },
  ] }, start, now)
  assert.ok(r.ok)
  if (!r.ok) return
  assert.deepEqual(r.value.codes[0], { code: 'FRIENDS20', percent_off: 20, amount_off_pence: null, max_uses: 30, expires_at: null })
  assert.equal(r.value.codes[1].amount_off_pence, 250)
  assert.equal(validateTicketPlan({ types: [{ price: '10', capacity: '1' }], codes: [{ code: 'X1', amount: '10' }] }, start, now).ok, false)
  assert.equal(validateTicketPlan({ types: [{ price: '10', capacity: '1' }], codes: [{ code: 'FREE', amount: '100' }] }, start, now).ok, false)
})

test('discounted price never below £1', () => {
  assert.equal(discountedPence(1000, { percent_off: 20, amount_off_pence: null }), 800)
  assert.equal(discountedPence(1000, { percent_off: null, amount_off_pence: 250 }), 750)
  assert.equal(discountedPence(500, { percent_off: 90, amount_off_pence: null }), 100)
  assert.equal(discountedPence(300, { percent_off: null, amount_off_pence: 1000 }), 100)
  assert.equal(discountedPence(1000, null), 1000)
})
