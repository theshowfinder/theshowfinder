import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { buildSiblingOffers, packageLabel, type SiblingEvent } from './eventOffers.ts'

const sib = (o: Partial<SiblingEvent>): SiblingEvent => ({
  id: 'x', slug: 'x', title: 'Jimmy Carr', start_date: '2026-11-20T19:30:00Z', source: null,
  tickets_url: null, see_tickets_affiliate_url: null, gigsberg_affiliate_url: null, is_package: false, ...o,
})
const none = { tickets_url: 'https://www.ticketmaster.co.uk/main', see_tickets_affiliate_url: null, gigsberg_affiliate_url: null }

describe('packageLabel', () => {
  test('uses the tail after the last separator', () => {
    assert.equal(packageLabel('Jimmy Carr - VIP Package'), 'VIP Package')
    assert.equal(packageLabel('Be Like Blippi: Lounge Package'), 'Lounge Package')
  })
  test('falls back to Package', () => assert.equal(packageLabel('Jimmy Carr'), 'Package'))
})

describe('buildSiblingOffers keeps every separate ticket link', () => {
  test('a package becomes a labelled ticketmaster option', () => {
    const o = buildSiblingOffers(none, [sib({ id: 'p', slug: 'p', title: 'Jimmy Carr - VIP Package', tickets_url: 'https://www.ticketmaster.co.uk/vip', is_package: true })])
    assert.equal(o.length, 1)
    assert.equal(o[0].label, 'VIP Package')
    assert.equal(o[0].url, 'https://www.ticketmaster.co.uk/vip')
  })
  test('See Tickets and Gigsberg rows add provider options only when the canonical lacks them', () => {
    const rows = [sib({ id: 'a', slug: 'a', source: 'see_tickets', see_tickets_affiliate_url: 'https://seetickets.com/e/1' }),
                  sib({ id: 'b', slug: 'b', gigsberg_affiliate_url: 'https://gigsberg.com/e/1' })]
    assert.deepEqual(buildSiblingOffers(none, rows).map(o => o.kind), ['see_tickets', 'gigsberg'])
    assert.deepEqual(buildSiblingOffers({ ...none, see_tickets_affiliate_url: 's', gigsberg_affiliate_url: 'g' }, rows), [])
  })
  test('duplicate urls, the canonical own url and over-long lists are dropped', () => {
    const rows = Array.from({ length: 12 }, (_, i) => sib({ id: `i${i}`, slug: `s${i}`, tickets_url: `https://tm/${i % 10}`, is_package: true, title: `T - P${i}` }))
    const o = buildSiblingOffers({ ...none, tickets_url: 'https://tm/0' }, rows)
    assert.ok(o.length <= 8)
    assert.ok(!o.some(x => x.url === 'https://tm/0'))
    assert.equal(new Set(o.map(x => x.url)).size, o.length)
  })
})
