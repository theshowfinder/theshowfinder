import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isFeaturedCandidate, pickFeaturedShows, type FeaturedCandidate } from './featuredShows.ts'

let n = 0
function ev(title: string, o: Partial<FeaturedCandidate> = {}): FeaturedCandidate & { id: number } {
  return { id: ++n, title, start_date: '2026-11-01T19:30:00Z', category: 'concert', venue_id: `v${n}`, venue_name: `Venue ${n}`, venue_capacity: 5000, ...o }
}

test('attractions, packages and class listings are not featured candidates', () => {
  for (const t of ['Sea Life London - Standard Entry', 'Thorpe Park Resort - One Day Entry', 'Cadbury World - Standard Entry',
    'Blackpool Sandcastle Waterpark', 'Fishies Week 10', 'Venue Premium - Oasis', 'Oasis - VIP Package', 'Live Lounge Premium Package',
    'Guided Walks of the Old Course', 'Toddler Workshop']) {
    assert.equal(isFeaturedCandidate({ title: t, venue_name: 'Somewhere' }), false, t)
  }
})

test('real shows are candidates', () => {
  for (const t of ['Hamilton', 'Oasis Live', 'Premier League Darts', 'The Jimi Hendrix Experience', 'Kevin Bridges: Here If You Need Me']) {
    assert.equal(isFeaturedCandidate({ title: t, venue_name: 'Venue' }), true, t)
  }
})

test('picks biggest venues first, one per venue and title, a mix of categories', () => {
  const pool = [
    ev('Concert A', { venue_capacity: 20000, category: 'concert' }),
    ev('Concert B', { venue_capacity: 18000, category: 'concert' }),
    ev('Concert C', { venue_capacity: 17000, category: 'concert' }),
    ev('Comedy D', { venue_capacity: 9000, category: 'comedy' }),
    ev('Theatre E', { venue_capacity: 2000, category: 'theatre' }),
    ev('Sea Life Brighton - Standard Entry', { venue_capacity: 50000, category: 'family' }),
    ev('Concert A', { venue_capacity: 19000, category: 'concert', venue_id: 'other' }),
  ]
  const out = pickFeaturedShows(pool, 4)
  const titles = out.map(e => e.title)
  assert.equal(out.length, 4)
  assert.ok(!titles.some(t => /sea life/i.test(t)))
  assert.equal(new Set(titles).size, 4)
  assert.ok(titles.includes('Comedy D') && titles.includes('Theatre E'), 'category cap leaves room for comedy and theatre')
  assert.equal(titles.filter(t => t.startsWith('Concert')).length, 2)
})

test('relaxes the category cap to fill the strip, never the venue rule', () => {
  const pool = [ev('A'), ev('B'), ev('C'), ev('D')]
  assert.equal(pickFeaturedShows(pool, 4).length, 4)
  const sameVenue = [ev('A', { venue_id: 'x' }), ev('B', { venue_id: 'x' })]
  assert.equal(pickFeaturedShows(sameVenue, 4).length, 1)
})

test('featured-flagged shows rank first and the result is soonest first', () => {
  const pool = [
    ev('Big arena', { venue_capacity: 20000, start_date: '2026-12-01T19:00:00Z' }),
    ev('Flagged small', { venue_capacity: 300, is_featured: true, category: 'comedy', start_date: '2026-11-01T19:00:00Z' }),
  ]
  const out = pickFeaturedShows(pool, 1)
  assert.equal(out[0].title, 'Flagged small')
  const two = pickFeaturedShows(pool, 2)
  assert.deepEqual(two.map(e => e.title), ['Flagged small', 'Big arena'])
})
