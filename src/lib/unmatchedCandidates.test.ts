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

  test('two shows a day: the event at the listing\'s own time ranks first and is marked as the same showtime', () => {
    const matinee = ev('m', 'Russell Howard', { start_date: '2026-07-10T14:30:00Z' }) // 15:30 BST
    const evening = ev('e', 'Russell Howard', { start_date: '2026-07-10T18:30:00Z' }) // 19:30 BST
    const l = row({ name: 'Russell Howard', performer1: 'Russell Howard', event_time: '15:30:00' })
    const ranked = rankCandidates(l, [evening, matinee])
    assert.equal(ranked[0].event.id, 'm')
    assert.ok(ranked[0].why.includes('same showtime'))
    assert.ok(ranked[1].why.some(w => w.startsWith('different time')))
  })
  test('a shared town name is not a similar venue: Khalid at Olympia London is never offered the London Eye or London Dungeon', () => {
    const l = row({ name: 'Khalid', performer1: 'Khalid', event_date: '2026-10-24', event_time: '20:00:00', venue: 'Olympia London', city: 'London' })
    const eye = ev('eye', 'London Eye - Standard Experience', { start_date: '2026-10-24T09:00:00Z', venue: { name: 'The London Eye', city: 'London' } })
    const dungeon = ev('dg', 'London Dungeon - Standard Entry', { start_date: '2026-10-24T09:00:00Z', venue: { name: 'The London Dungeon', city: 'London' } })
    assert.deepEqual(rankCandidates(l, [eye, dungeon]), [])
    const p = row({ name: 'Professor Brian Cox', performer1: 'Brian Cox', event_date: '2026-10-24', event_time: '19:30:00', venue: 'Plymouth Pavilions', city: 'Plymouth' })
    const ice = ev('ice', 'Into The Ice', { start_date: '2026-10-24T08:00:00Z', venue: { name: 'Plymouth University', city: 'Plymouth' } })
    assert.deepEqual(rankCandidates(p, [ice]), [])
  })
})
