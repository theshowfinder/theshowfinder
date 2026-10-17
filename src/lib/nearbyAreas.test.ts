import { test } from 'node:test'
import assert from 'node:assert/strict'
import { getNearbyAreas, nearbyOrFilter, areaForVenueCity, areasWithEvents, NEARBY_AREAS } from './nearbyAreas.ts'

test('getNearbyAreas is case-insensitive and empty for unconfigured cities', () => {
  assert.ok(getNearbyAreas('derby').length > 0)
  assert.deepEqual(getNearbyAreas('Leeds'), [])
})

test('nearbyOrFilter builds an ilike or-filter for every spelling', () => {
  const f = nearbyOrFilter(getNearbyAreas('Derby'))
  assert.ok(f.includes('venue_city.ilike.Chesterfield'))
  assert.ok(f.includes('venue_city.ilike.Burton-on-Trent'))
  assert.equal(f.split(',').length, getNearbyAreas('Derby').flatMap(a => a.match).length)
})

test('nearbyOrFilter strips characters that could change the query', () => {
  const f = nearbyOrFilter([{ name: 'X', match: ['A,B)', 'C*%'] }])
  assert.equal(f, 'venue_city.ilike.AB,venue_city.ilike.C')
})

test('areaForVenueCity matches any configured spelling, ignoring case', () => {
  const areas = getNearbyAreas('Derby')
  assert.equal(areaForVenueCity(areas, 'burton-on-trent')?.name, 'Burton upon Trent')
  assert.equal(areaForVenueCity(areas, 'Nowhere'), null)
  assert.equal(areaForVenueCity(areas, null), null)
})

test('areasWithEvents only names towns that have a show, in config order', () => {
  const areas = getNearbyAreas('Derby')
  const out = areasWithEvents(areas, [{ venue_city: 'Chesterfield' }, { venue_city: 'Burton upon Trent' }, { venue_city: 'Elsewhere' }])
  assert.deepEqual(out.map(a => a.name), ['Burton upon Trent', 'Chesterfield'])
})

test('no town is configured as its own hub city', () => {
  for (const [city, areas] of Object.entries(NEARBY_AREAS)) {
    for (const a of areas) assert.ok(!a.match.some(m => m.toLowerCase() === city.toLowerCase()), `${a.name} duplicates ${city}`)
  }
})

test('nearbyOrFilter can target another column (venues.city)', () => {
  const f = nearbyOrFilter(getNearbyAreas('Derby'), 'city')
  assert.ok(f.startsWith('city.ilike.'))
  assert.ok(!f.includes('venue_city'))
})
