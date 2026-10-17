import { test } from 'node:test'
import assert from 'node:assert/strict'
import { venueSeoTitle, venueSeoDescription, buildVenueSchema } from './venueSeo.ts'

test('venue title says what the page is and stays short', () => {
  assert.equal(venueSeoTitle('O2 Academy Brixton', 'London'), 'O2 Academy Brixton, London: Events & Tickets')
  assert.equal(venueSeoTitle('Lincoln Cathedral', 'Lincoln'), 'Lincoln Cathedral: Events & Tickets')
  const long = venueSeoTitle('The Very Long Named Performing Arts Centre', 'Wolverhampton')
  assert.ok(long.length <= 44, long)
})

test('venue description uses real counts and next shows, within 160 chars', () => {
  const d = venueSeoDescription({ name: 'Co-op Live', city: 'Manchester', capacity: 23500, upcomingCount: 140, nextTitles: ['N-Dubz', 'Rod Stewart', 'Chase & Status', 'Greta Van Fleet'] })
  assert.ok(d.length <= 160, `${d.length}: ${d}`)
  assert.match(d, /140 upcoming shows/)
  assert.match(d, /N-Dubz/)
  assert.match(d, /23,500/)
  const one = venueSeoDescription({ name: 'X', city: 'Y', capacity: null, upcomingCount: 1, nextTitles: [] })
  assert.match(one, /1 upcoming show\./)
})

test('very long show names are dropped rather than overflowing', () => {
  const d = venueSeoDescription({ name: 'The Royal Albert Hall', city: 'London', capacity: 5272, upcomingCount: 90, nextTitles: ['A'.repeat(80), 'B'.repeat(80)] })
  assert.ok(d.length <= 160)
  assert.match(d, /90 upcoming shows/)
})

test('empty venues get an honest description', () => {
  const d = venueSeoDescription({ name: 'The Hall', city: 'Derby', capacity: null, upcomingCount: 0, nextTitles: [] })
  assert.match(d, /No shows are listed right now/)
})

test('Place schema only includes known facts', () => {
  const s = buildVenueSchema({ name: 'V', slug: 'v-1', address: '', city: 'Derby', postcode: '', capacity: null, website: null })
  assert.equal(s['@type'], 'Place')
  assert.equal(s.url, 'https://www.theshowfinder.com/venues/v-1')
  assert.deepEqual(Object.keys(s.address), ['@type', 'addressLocality', 'addressCountry'])
  assert.equal('maximumAttendeeCapacity' in s, false)
  const full = buildVenueSchema({ name: 'V', slug: 'v-1', address: '1 High St', city: 'Derby', postcode: 'DE1 1AA', capacity: 3000, website: 'https://v.example' })
  assert.equal(full.maximumAttendeeCapacity, 3000)
  assert.deepEqual(full.sameAs, ['https://v.example'])
})
