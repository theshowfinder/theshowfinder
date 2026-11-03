import { test } from 'node:test'
import assert from 'node:assert/strict'
import { artistPageTitle } from './artistTitle.ts'

test('artist titles carry the tour year(s)', () => {
  assert.equal(artistPageTitle('Scorpions', ['2027-03-01T19:00:00Z', '2027-04-02T19:00:00Z']), 'Scorpions UK Tour 2027: Dates & Tickets')
  assert.equal(artistPageTitle('Donny Osmond', ['2026-12-01T19:00:00Z', '2027-02-06T18:30:00Z']), 'Donny Osmond UK Tour 2026–27: Dates & Tickets')
  assert.equal(artistPageTitle('Nobody', []), 'Nobody UK Tour Dates & Tickets')
})
