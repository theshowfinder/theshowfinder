import { test } from 'node:test'
import assert from 'node:assert/strict'
import { rankMainVenues, venuesToName } from './mainVenues.ts'

// Real Nottingham rows (25 Nov 2026): upcoming-show counts, capacity only known for the arena.
const rows = [
  { name: 'Royal Concert Hall Nottingham', lat: 52.955858, lng: -1.151716, upcoming: 59 },
  { name: 'The Bodega', lat: 52.95404, lng: -1.15134, upcoming: 53 },
  { name: 'Rock City', lat: 52.95568, lng: -1.15521, upcoming: 52 },
  { name: 'Motorpoint Arena Nottingham', lat: 52.952649, lng: -1.139291, capacity: 10000, upcoming: 50 },
  { name: 'Rescue Rooms', lat: 52.95631, lng: -1.15495, upcoming: 48 },
  { name: 'Royal Concert Hall', lat: 52.95589, lng: -1.15163, upcoming: 31 },
  { name: 'Nottingham Rescue Rooms', lat: 52.956173, lng: -1.152975, upcoming: 26 },
  { name: 'Theatre Royal and Royal Concert Hall', lat: 52.95589, lng: -1.15163, upcoming: 21 },
  { name: 'Various Nottingham Venues', lat: 52.956802, lng: -1.155256, upcoming: 40 },
  { name: 'Harby Village Hall', lat: 52.87303874, lng: -0.89365589, upcoming: 1 },
]
const pantry = { lat: 52.955885, lng: -1.1489 } // The Pudding Pantry, Trinity Square

test('main venues: duplicates merged, combined rows split, "Various" dropped, arena first', () => {
  const main = rankMainVenues(rows, 'Nottingham')
  const names = main.map(v => v.name)
  assert.equal(names[0], 'Motorpoint Arena')
  assert.ok(names.includes('Theatre Royal'))
  assert.equal(names.filter(n => /Royal Concert Hall/.test(n)).length, 1)
  assert.equal(names.filter(n => /Rescue Rooms/.test(n)).length, 1)
  assert.ok(!names.some(n => /Various/.test(n)))
})

test('a partner names the nearest main venues and the arena', () => {
  const main = rankMainVenues(rows, 'Nottingham')
  const named = venuesToName(pantry, main, 3, null, 'Nottingham').map(v => v.name)
  assert.ok(named.includes('Royal Concert Hall'))
  assert.ok(named.includes('Theatre Royal'))
  assert.ok(named.includes('Motorpoint Arena'))
  assert.ok(!named.includes('Harby Village Hall'))
})

test("on a show page the show's own venue is left out (it is named first there)", () => {
  const main = rankMainVenues(rows, 'Nottingham')
  const named = venuesToName(pantry, main, 2, 'Royal Concert Hall Nottingham', 'Nottingham').map(v => v.name)
  assert.ok(!named.includes('Royal Concert Hall'))
  assert.ok(named.includes('Theatre Royal'))
})
