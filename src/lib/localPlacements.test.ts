import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pickForPage, safeWebsite, type Placement } from './localPlacements.ts'

const biz = (id: string): Placement => ({ id, city: 'Derby', name: id, category: 'restaurant', description: null, website_url: null, logo_url: null, address: null, postcode: null, package: 'featured' })

test('shows every featured business when there are no more than the slots', () => {
  assert.deepEqual(pickForPage([biz('b'), biz('a')], 'event-1').map(b => b.id), ['a', 'b'])
})

test('with more businesses than slots, pages rotate and every business gets a fair share', () => {
  const all = ['a', 'b', 'c', 'd', 'e'].map(biz)
  const counts = new Map<string, number>()
  for (let i = 0; i < 1000; i++) for (const b of pickForPage(all, `event-${i}`)) counts.set(b.id, (counts.get(b.id) ?? 0) + 1)
  for (const id of ['a', 'b', 'c', 'd', 'e']) assert.ok((counts.get(id) ?? 0) > 450, `${id} shown ${counts.get(id)} times`)
  assert.deepEqual(pickForPage(all, 'event-7'), pickForPage(all, 'event-7'))
  assert.equal(pickForPage(all, 'event-7').length, 3)
})

test('only real web links are shown', () => {
  assert.equal(safeWebsite('example.co.uk'), 'https://example.co.uk/')
  assert.equal(safeWebsite('javascript:alert(1)'), null)
  assert.equal(safeWebsite(null), null)
})
