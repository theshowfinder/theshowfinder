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

// Areas: The O2 (51.5030, 0.0032), Camden (51.5390, -0.1426), a bar 2 min from The O2 (51.5022, 0.0050).
import { pickNearbyForPage, countWithinArea, areaLabel, groupByArea } from './localPlacements.ts'
const at = (id: string, lat: number | null, lng: number | null): Placement => ({ ...biz(id), city: 'London', lat, lng, offer_text: null, booking_url: null } as Placement)
const O2 = { lat: 51.503, lng: 0.0032 }

test('a show page only gets Featured partners within walking distance, nearest first', () => {
  const dial = at('dial', 51.5022, 0.005), camden = at('camden', 51.539, -0.1426), near2 = at('near2', 51.5045, 0.0)
  assert.deepEqual(pickNearbyForPage([camden, near2, dial], O2, 'e1').map(p => p.id), ['dial', 'near2'])
})

test('city-wide partners (no map position) fill spare slots; a venue with no position never gets far-away partners', () => {
  const dial = at('dial', 51.5022, 0.005), camden = at('camden', 51.539, -0.1426), everywhere = at('everywhere', null, null)
  const many = [dial, camden, everywhere, at('x', 51.6, -0.3), at('y', 51.4, -0.2)]
  assert.deepEqual(pickNearbyForPage(many, O2, 'e1').map(p => p.id), ['dial', 'everywhere'])
  assert.deepEqual(pickNearbyForPage(many, { lat: null, lng: null }, 'e1').map(p => p.id), ['everywhere'])
  // A small city (three or fewer Featured) keeps showing all of them on venues without a position.
  assert.equal(pickNearbyForPage([dial, camden], { lat: null, lng: null }, 'e1').length, 2)
})

test('the sign-up cap counts partners within walking distance only', () => {
  assert.equal(countWithinArea(O2, [at('a', 51.5022, 0.005), at('b', 51.539, -0.1426), at('c', null, null)]), 1)
})

test('area headings on the city page', () => {
  const venues = [{ name: 'The O2', ...O2 }, { name: 'Camden Assembly', lat: 51.5416, lng: -0.1466 }]
  assert.equal(areaLabel({ lat: 51.5022, lng: 0.005 }, venues, 'London'), 'Near The O2')
  assert.equal(areaLabel({ lat: null, lng: null }, venues, 'London'), 'Around London')
  const groups = groupByArea([at('e', null, null), at('dial', 51.5022, 0.005), at('cam', 51.539, -0.1426)], venues, 'London')
  assert.deepEqual(groups.map(g => g.label), ['Near The O2', 'Near Camden Assembly', 'Around London'])
})
