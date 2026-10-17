import { test } from 'node:test'
import assert from 'node:assert/strict'
import { rankVenues, splitPopular, venueMixLabel, shortLondonDate, type DiscoveryVenue, type VenueEventRow } from './venueDiscovery.ts'

const v = (id: string, name: string, capacity: number | null = null): DiscoveryVenue => ({ id, name, slug: id, capacity, address: null })
const row = (venue_id: string, title: string, start_date: string, category: string | null): VenueEventRow => ({ venue_id, title, start_date, category })

test('rankVenues orders by upcoming shows, then capacity, and drops venues with none', () => {
  const venues = [v('small', 'Small', 100), v('big', 'Big', 5000), v('busy', 'Busy', 300), v('none', 'None', 9000)]
  const ranked = rankVenues(venues, { small: 5, big: 5, busy: 40, none: 0 }, [])
  assert.deepEqual(ranked.map(x => x.id), ['busy', 'big', 'small'])
})

test('rankVenues finds the next show and the two most common show types', () => {
  const rows = [
    row('a', 'Later', '2026-11-01T19:00:00Z', 'comedy'),
    row('a', 'First', '2026-10-20T19:00:00Z', 'concert'),
    row('a', 'Second', '2026-10-25T19:00:00Z', 'concert'),
    row('a', 'Third', '2026-10-30T19:00:00Z', 'theatre'),
  ]
  const [a] = rankVenues([v('a', 'A')], { a: 4 }, rows)
  assert.equal(a.nextShow?.title, 'First')
  assert.deepEqual(a.mix, ['concert', 'comedy'])
})

test('a venue with no fetched rows still ranks, just without a next show', () => {
  const [a] = rankVenues([v('a', 'A')], { a: 7 }, [])
  assert.equal(a.nextShow, null)
  assert.deepEqual(a.mix, [])
})

test('splitPopular puts busy venues in cards and the rest in the compact list', () => {
  const venues = [v('a', 'A'), v('b', 'B'), v('c', 'C')]
  const ranked = rankVenues(venues, { a: 30, b: 3, c: 1 }, [])
  const { popular, more } = splitPopular(ranked)
  assert.deepEqual(popular.map(x => x.id), ['a', 'b'])
  assert.deepEqual(more.map(x => x.id), ['c'])
})

test('splitPopular keeps the top venue as a card even when every venue is quiet', () => {
  const ranked = rankVenues([v('a', 'A'), v('b', 'B')], { a: 2, b: 1 }, [])
  const { popular, more } = splitPopular(ranked)
  assert.deepEqual(popular.map(x => x.id), ['a'])
  assert.deepEqual(more.map(x => x.id), ['b'])
})

test('splitPopular caps the card list', () => {
  const venues = Array.from({ length: 12 }, (_, i) => v(`v${i}`, `V${i}`))
  const counts = Object.fromEntries(venues.map(x => [x.id, 10]))
  const { popular, more } = splitPopular(rankVenues(venues, counts, []))
  assert.equal(popular.length, 8)
  assert.equal(more.length, 4)
})

test('venueMixLabel reads naturally and is null when nothing is known', () => {
  assert.equal(venueMixLabel(['concert', 'comedy']), 'Mostly concerts and comedy')
  assert.equal(venueMixLabel(['sports']), 'Mostly sport')
  assert.equal(venueMixLabel([]), null)
})

test('shortLondonDate uses UK time, so a late-evening UTC show lands on the next UK day', () => {
  // 23:30 UTC on 23 Oct 2026 is 00:30 BST on the 24th.
  const out = shortLondonDate('2026-10-23T23:30:00Z')
  assert.match(out, /24/)
  assert.match(out, /Oct/)
  assert.match(out, /Sat/)
})
