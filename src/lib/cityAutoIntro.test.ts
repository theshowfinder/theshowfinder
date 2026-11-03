import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cityAutoIntro } from './cityAutoIntro.ts'

test('builds a city-specific intro from its own numbers', () => {
  const s = cityAutoIntro({ cityName: 'Hull', totalCount: 120, venues: [{ name: 'Connexin Live' }, { name: 'Hull New Theatre' }], categoryCounts: { concert: 60, comedy: 30, theatre: 20, sports: null }, tonightCount: 1, weekendCount: 9 })!
  assert.match(s, /^Hull has 120 upcoming shows across 2 venues, led by Connexin Live and Hull New Theatre\./)
  assert.match(s, /concerts, comedy and theatre/)
  assert.match(s, /9 shows this weekend/)
})

test('no shows, no intro', () => {
  assert.equal(cityAutoIntro({ cityName: 'X', totalCount: 0, venues: [], categoryCounts: {}, tonightCount: 0, weekendCount: 0 }), null)
})
