import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { rankCandidates } from './unmatchedCandidates.ts'
import type { CatalogueRow, ShowfinderEvent } from './gigsbergMatchScoring.ts'

const row = (over: Partial<CatalogueRow> = {}): CatalogueRow => ({
  id: 1, name: 'BST Hyde Park: Bon Jovi', event_date: '2026-07-10', venue: 'Hyde Park', city: 'London',
  performer1: 'Bon Jovi', performer2: null, url: 'https://gigsberg.com/x', matched_event_id: null, ...over,
})
const ev = (id: string, title: string, over: Partial<ShowfinderEvent> = {}): ShowfinderEvent => ({
  id, title, start_date: '2026-07-10T17:00:00Z', gigsberg_affiliate_url: null,
  venue: { name: 'Hyde Park', city: 'London' }, artists: [], ...over,
})

describe('rankCandidates', () => {
  test('offers a same-day same-venue event even when the titles are worded differently', () => {
    const c = rankCandidates(row(), [ev('a', 'American Express presents BST Hyde Park')])
    assert.equal(c.length, 1)
    assert.ok(c[0].why.includes('same venue'))
  })
  test('ranks the artist-name match above a venue-only match', () => {
    const c = rankCandidates(row(), [ev('venue-only', 'Some Other Festival'), ev('named', 'Bon Jovi')])
    assert.equal(c[0].event.id, 'named')
  })
  test('never offers an event on a different day', () => {
    assert.deepEqual(rankCandidates(row(), [ev('x', 'Bon Jovi', { start_date: '2026-07-11T17:00:00Z' })]), [])
  })
  test('ignores same-day events in another city with an unrelated name', () => {
    assert.deepEqual(rankCandidates(row(), [ev('x', 'Totally Different', { venue: { name: 'O2 Arena', city: 'Leeds' } })]), [])
  })
  test('caps the number of suggestions', () => {
    const many = Array.from({ length: 9 }, (_, i) => ev(`e${i}`, `Bon Jovi ${i}`))
    assert.equal(rankCandidates(row(), many, 3).length, 3)
  })
})
