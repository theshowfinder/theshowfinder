import { test } from 'node:test'
import assert from 'node:assert/strict'
import { getNearbyAreas, getNeighbourCities, NEIGHBOUR_CITIES, nearbyOrFilter, areaForVenueCity, areasWithEvents, nearbyIntroSentence, NEARBY_AREAS } from './nearbyAreas.ts'
import { CITIES } from './cities.ts'

test('getNearbyAreas is case-insensitive and empty for unconfigured cities', () => {
  assert.ok(getNearbyAreas('derby').length > 0)
  assert.deepEqual(getNearbyAreas('Atlantis'), [])
  // Every one of the 40 city pages has nearby towns defined.
  for (const c of CITIES) assert.ok(getNearbyAreas(c.name).length > 0, `${c.name} has no nearby areas`)
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

test('every hub is one of our cities and no nearby town is itself a city page', () => {
  const cityNames = new Set(CITIES.map(c => c.name.toLowerCase()))
  for (const [hub, areas] of Object.entries(NEARBY_AREAS)) {
    assert.ok(cityNames.has(hub.toLowerCase()), `${hub} is not in CITIES`)
    for (const a of areas) {
      for (const m of a.match) assert.ok(!cityNames.has(m.toLowerCase()), `${a.name} (${m}) already has its own city page`)
    }
  }
})

test('nearbyIntroSentence names the towns naturally', () => {
  assert.equal(nearbyIntroSentence([]), '')
  assert.equal(nearbyIntroSentence([{ name: 'Salford', match: [] }]), 'Shows in nearby Salford are gathered further down this page.')
  assert.equal(
    nearbyIntroSentence([{ name: 'A', match: [] }, { name: 'B', match: [] }, { name: 'C', match: [] }]),
    'Shows in nearby A, B and C are gathered further down this page.',
  )
})

test('neighbouring cities are real city pages, never the hub itself, and only feed the show strip', () => {
  const cityNames = new Set(CITIES.map(c => c.name.toLowerCase()))
  for (const [hub, names] of Object.entries(NEIGHBOUR_CITIES)) {
    assert.ok(cityNames.has(hub.toLowerCase()), `${hub} is not in CITIES`)
    for (const n of names) {
      assert.ok(cityNames.has(n.toLowerCase()), `${n} is not a city page`)
      assert.notEqual(n.toLowerCase(), hub.toLowerCase())
    }
  }
  assert.deepEqual(getNeighbourCities('derby').map(a => a.name), ['Nottingham', 'Leicester', 'Sheffield', 'Stoke-on-Trent'])
  assert.deepEqual(getNeighbourCities('Atlantis'), [])
  // They are not part of the nearby-town list used for venues and the intro line.
  assert.ok(!getNearbyAreas('Derby').some(a => a.name === 'Nottingham'))
})
