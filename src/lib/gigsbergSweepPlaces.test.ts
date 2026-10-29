import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sweepPlaces } from './gigsbergSweepPlaces.ts'

test('cities first, then other towns once each, alphabetical', () => {
  const out = sweepPlaces(['London', 'Leeds'], ['Eastbourne', 'leeds', 'Watford', 'eastbourne', null, 'Salford', '  Hastings ', 'DE1 2AB', 'London, UK'])
  assert.deepEqual(out, ['London', 'Leeds', 'Eastbourne', 'Hastings', 'Salford', 'Watford'])
})
