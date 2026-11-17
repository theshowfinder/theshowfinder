import test from 'node:test'
import assert from 'node:assert/strict'
import { bookingFeePence, orderTotals, vatInside, gbpFromPence, parsePricePence, validateClaim, claimErrorMessage, parseTicketCode, ticketQrPayload, formatTicketCode, attendeesCsv, ticketsLeft } from './tickets.ts'

const id = '3f2b6a1e-1c2d-4e5f-8a9b-0c1d2e3f4a5b'

test('claims are checked', () => {
  const ok = validateClaim({ ticketTypeId: id, name: '  Sam  Smith ', email: 'Sam@Example.com ', quantity: '2' }, 6)
  assert.ok(ok.ok)
  if (ok.ok) assert.deepEqual(ok.value, { ticketTypeId: id, name: 'Sam Smith', email: 'sam@example.com', quantity: 2 })
  assert.equal(validateClaim({ ticketTypeId: 'x', name: 'Sam', email: 'sam@example.com', quantity: 1 }).ok, false)
  assert.equal(validateClaim({ ticketTypeId: id, name: 'S', email: 'sam@example.com', quantity: 1 }).ok, false)
  assert.equal(validateClaim({ ticketTypeId: id, name: 'Sam', email: 'nope', quantity: 1 }).ok, false)
  assert.equal(validateClaim({ ticketTypeId: id, name: 'Sam', email: 'sam@example.com', quantity: 7 }, 6).ok, false)
  assert.equal(validateClaim({ ticketTypeId: id, name: 'Sam', email: 'sam@example.com', quantity: 0 }).ok, false)
})

test('database errors read like English', () => {
  assert.match(claimErrorMessage('P0001: sold_out'), /aren’t enough tickets/)
  assert.match(claimErrorMessage('already_have'), /already have/)
  assert.match(claimErrorMessage('weird'), /went wrong/)
})

test('ticket codes round-trip through the QR and the keyboard', () => {
  assert.equal(parseTicketCode(ticketQrPayload('AB12CD34EF')), 'AB12CD34EF')
  assert.equal(parseTicketCode('ab12 cd34 ef'), 'AB12CD34EF')
  assert.equal(parseTicketCode('https://example.com'), null)
  assert.equal(formatTicketCode('AB12CD34EF'), 'AB12 CD34 EF')
  assert.equal(ticketsLeft({ capacity: 10, sold: 12 }), 0)
})

test('attendee CSV is safe to open in a spreadsheet', () => {
  const csv = attendeesCsv([{ name: '=HYPERLINK("x")', email: 'a@b.co', ticket: 'Free ticket', code: 'AB12CD34EF', ordered: '2026-11-17 19:00', checkedIn: null }])
  assert.match(csv, /"'=HYPERLINK\(""x""\)"/)
  assert.match(csv, /"AB12 CD34 EF"/)
})

test('booking fee is 6% + 49p a ticket, all-in', () => {
  assert.equal(bookingFeePence(1500), 139)
  assert.equal(bookingFeePence(3000), 229)
  assert.equal(bookingFeePence(5000), 349)
  assert.deepEqual(orderTotals(1500, 2), { ticketsPence: 3000, feePence: 278, totalPence: 3278 })
  assert.equal(vatInside(139), 23)
  assert.equal(gbpFromPence(3278), '£32.78')
})

test('ticket prices are read from what organisers type', () => {
  assert.equal(parsePricePence('12.50'), 1250)
  assert.equal(parsePricePence('£15'), 1500)
  assert.equal(parsePricePence('0.50'), null)
  assert.equal(parsePricePence('1200'), null)
  assert.equal(parsePricePence('abc'), null)
})
