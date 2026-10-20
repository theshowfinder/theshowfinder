import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { mapTicketmasterStatus } from './ticketmasterStatus.ts'

const now = new Date('2026-10-20T12:00:00Z')

describe('mapTicketmasterStatus', () => {
  test('offsale after the public sale opened is sold out', () => {
    assert.equal(mapTicketmasterStatus('offsale', true, '2026-05-22T09:00:00Z', now), 'sold_out')
  })
  test('offsale before the public sale opens is just upcoming', () => {
    assert.equal(mapTicketmasterStatus('offsale', false, '2026-11-01T09:00:00Z', now), 'upcoming')
  })
  test('offsale with no known sale date is not assumed sold out', () => {
    assert.equal(mapTicketmasterStatus('offsale', false, null, now), 'upcoming')
    assert.equal(mapTicketmasterStatus('offsale', true, 'not a date', now), 'upcoming')
  })
  test('cancelled and postponed win', () => {
    assert.equal(mapTicketmasterStatus('cancelled', true, '2026-05-22T09:00:00Z', now), 'cancelled')
    assert.equal(mapTicketmasterStatus('POSTPONED', true, null, now), 'postponed')
  })
  test('onsale is on_sale with prices, else upcoming (unchanged behaviour)', () => {
    assert.equal(mapTicketmasterStatus('onsale', true, '2026-05-22T09:00:00Z', now), 'on_sale')
    assert.equal(mapTicketmasterStatus('onsale', false, '2026-05-22T09:00:00Z', now), 'upcoming')
    assert.equal(mapTicketmasterStatus(undefined, false, null, now), 'upcoming')
  })
})
