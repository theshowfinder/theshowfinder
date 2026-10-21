import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveEventCity } from './localEventCity.ts'

test('blank or same-city locality files under the source city', () => {
  assert.equal(resolveEventCity('', 'Birmingham'), 'Birmingham')
  assert.equal(resolveEventCity(null, 'Birmingham'), 'Birmingham')
  assert.equal(resolveEventCity('birmingham', 'Birmingham'), 'Birmingham')
})

test('a suburb or village we do not know goes to the source city', () => {
  assert.equal(resolveEventCity('Edgbaston', 'Birmingham'), 'Birmingham')
  assert.equal(resolveEventCity('Hale Barns', 'Manchester'), 'Manchester')
})

test('one of our cities, or a listed nearby town, is kept as written', () => {
  assert.equal(resolveEventCity('Coventry', 'Birmingham'), 'Coventry')
  assert.equal(resolveEventCity('Salford', 'Manchester'), 'Salford')
})

test('coordinates file an event under the city it is really in', () => {
  // Belgrade Theatre, listed by Visit Birmingham: it is in Coventry.
  assert.equal(resolveEventCity(null, 'Birmingham', { lat: 52.4087, lng: -1.5106 }), 'Coventry')
  assert.equal(resolveEventCity('Edgbaston', 'Birmingham', { lat: 52.4545, lng: -1.9023 }), 'Birmingham')
  assert.equal(resolveEventCity(null, 'Manchester', { lat: 53.4875, lng: -2.2901 }), 'Manchester')   // Salford Quays is inside the city's reach
})

test('a rural event is kept for the source city if close, dropped if far', () => {
  assert.equal(resolveEventCity('Cromer', 'Norwich', { lat: 52.93, lng: 1.30 }), 'Cromer')   // listed nearby town of Norwich
  assert.equal(resolveEventCity('Swaffham', 'Norwich', { lat: 52.65, lng: 0.69 }), 'Norwich')   // ~40 km, no city of its own
  assert.equal(resolveEventCity('Holt', 'Norwich', { lat: 57.0, lng: -4.0 }), null)            // Highlands: not ours
})

test('no coordinates and no locality falls back to the source city', () => {
  assert.equal(resolveEventCity(null, 'Belfast', { lat: null, lng: null }), 'Belfast')
  assert.equal(resolveEventCity(undefined, 'Belfast'), 'Belfast')
})
