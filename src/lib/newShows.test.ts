import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  type NewShowRow,
  buildCityRoundups,
  buildArtistAdditions,
  dedupeShows,
  isoWeekKey,
  shortUkDate,
  ukDay,
  artistSlugFromDraftUrl,
  isNewsworthyArtistName,
} from './newShows.ts'

const NOW = Date.parse('2026-10-17T05:00:00Z')

let n = 0
function row(over: Partial<NewShowRow>): NewShowRow {
  n++
  return {
    event_id: `e${n}`, title: `t${n}`, category: 'concert', start_date: `2026-11-${String(10 + (n % 15)).padStart(2, '0')}T19:30:00Z`,
    created_at: '2026-10-16T09:00:00Z', venue_name: `Venue ${n}`, venue_city: 'Derby', venue_capacity: 1000,
    artist_id: `a${n}`, artist_name: `Artist ${n}`, artist_slug: `artist-${n}`, artist_created_at: '2020-01-01T00:00:00Z',
    ...over,
  }
}

test('isoWeekKey gives ISO weeks, including year boundaries', () => {
  assert.equal(isoWeekKey(new Date('2026-10-17T05:00:00Z')), '2026-W42')
  assert.equal(isoWeekKey(new Date('2026-01-01T12:00:00Z')), '2026-W01')
  assert.equal(isoWeekKey(new Date('2027-01-01T12:00:00Z')), '2026-W53')
})

test('shortUkDate and ukDay use UK time', () => {
  assert.equal(shortUkDate('2026-10-23T23:30:00Z'), 'Sat 24 Oct')
  assert.equal(ukDay('2026-10-23T23:30:00Z'), '2026-10-24')
})

test('dedupeShows collapses presale/premium variants of the same show', () => {
  const a = row({ artist_id: 'x', venue_name: 'Hydro', start_date: '2027-02-25T19:00:00Z' })
  const b = row({ artist_id: 'x', venue_name: 'Hydro', start_date: '2027-02-25T19:00:00Z' })
  const c = row({ artist_id: 'x', venue_name: 'Hydro', start_date: '2027-02-26T19:00:00Z' })
  assert.equal(dedupeShows([a, b, c]).length, 2)
})

test('city roundup needs the minimum number of distinct shows and matches cities case-insensitively', () => {
  assert.equal(buildCityRoundups([row({}), row({}), row({})], ['Derby'], '2026-W42').length, 0)
  const enough = [row({ venue_city: 'derby' }), row({}), row({}), row({})]
  const out = buildCityRoundups(enough, ['Derby'], '2026-W42')
  assert.equal(out.length, 1)
  assert.equal(out[0].headline, 'New shows added in Derby this week')
  assert.equal(out[0].url, 'https://theshowfinder.com/cities/derby?new=2026-W42')
  assert.equal(out[0].scope, 'city')
  assert.match(out[0].summary, /4 new shows have been listed in Derby/)
  assert.equal(out[0].autoPublish, false)
})

test('duplicate listings do not inflate a roundup', () => {
  const dup = { artist_id: 'x', venue_name: 'V', start_date: '2026-11-20T19:00:00Z' }
  const rows = [row(dup), row(dup), row(dup), row({}), row({}), row({})]
  const out = buildCityRoundups(rows, ['Derby'], 'w')
  assert.match(out[0].summary, /^4 new shows/)
})

test('a big roundup with real highlights is auto-published; highlights favour big venues', () => {
  const rows = [
    row({ artist_name: 'Small Act', venue_name: 'Pub', venue_capacity: 100 }),
    row({ artist_name: 'Big Act', venue_name: 'Arena', venue_capacity: 12000 }),
    row({ artist_name: 'Mid Act', venue_name: 'Hall', venue_capacity: 1500 }),
    row({}), row({}), row({}),
  ]
  const [item] = buildCityRoundups(rows, ['Derby'], 'w')
  assert.equal(item.autoPublish, true)
  assert.match(item.summary, /Big Act at Arena/)
  assert.match(item.summary, /Mid Act at Hall/)
})

test('city roundup ignores unknown cities and keeps sports and club fixtures out of the highlights', () => {
  const rows = [
    row({ category: 'sports', artist_name: 'Rovers v X' }),
    row({ artist_name: 'Derby County FC' }),
    row({}), row({}), row({}),
    row({ venue_city: 'Atlantis' }),
  ]
  const out = buildCityRoundups(rows, ['Derby'], 'w')
  assert.equal(out.length, 1)
  assert.match(out[0].summary, /5 new shows/)
  assert.doesNotMatch(out[0].summary, /Rovers v X|Derby County FC/)
})

test('city roundups are ordered by size and capped', () => {
  const rows = [
    ...Array.from({ length: 4 }, () => row({ venue_city: 'Leeds' })),
    ...Array.from({ length: 6 }, () => row({ venue_city: 'Derby' })),
  ]
  const out = buildCityRoundups(rows, ['Leeds', 'Derby'], 'w', { max: 1 })
  assert.equal(out.length, 1)
  assert.equal(out[0].cityName, 'Derby')
})

test('artist additions need 3 show days in 2+ cities; single-city runs are left to the city roundup', () => {
  const tour = ['Leeds', 'Derby', 'Hull'].map(c => row({ artist_id: 'x', artist_name: 'Band X', artist_slug: 'band-x', venue_city: c }))
  const run = Array.from({ length: 5 }, (_, i) => row({ artist_id: 'r', artist_name: 'Long Run', artist_slug: 'long-run', venue_city: 'Bristol', start_date: `2026-11-${10 + i}T19:00:00Z` }))
  const twoDates = ['Leeds', 'Derby'].map(c => row({ artist_id: 'y', artist_name: 'Two Dates', artist_slug: 'two-dates', venue_city: c }))
  const out = buildArtistAdditions([...tour, ...run, ...twoDates], '2026-W42', NOW)
  assert.equal(out.length, 1)
  assert.equal(out[0].headline, 'Band X adds 3 new UK dates')
  assert.equal(out[0].storyType, 'new_dates')
  assert.equal(out[0].scope, 'national')
  assert.equal(out[0].url, 'https://theshowfinder.com/artists/band-x?added=2026-W42')
  assert.match(out[0].summary, /3 UK cities/)
})

test('repeat listings of the same night count once (the N-Dubz / Jurassic Wild problem)', () => {
  const same = { artist_id: 'j', artist_name: 'Jurassic Wild', artist_slug: 'jw', venue_city: 'Derby', start_date: '2027-07-24T10:00:00Z' }
  const rows = [row(same), row(same), row(same), row(same), row({ ...same, venue_city: 'Hull' })]
  assert.equal(buildArtistAdditions(rows, 'w', NOW).length, 0)
  const tour = [
    ...['Leeds', 'Hull', 'York'].flatMap(c => [row({ artist_id: 'n', artist_name: 'N', artist_slug: 'n', venue_city: c, start_date: '2027-03-01T19:00:00Z' }), row({ artist_id: 'n', artist_name: 'N', artist_slug: 'n', venue_city: c, start_date: '2027-03-01T19:00:00Z' })]),
  ]
  const out = buildArtistAdditions(tour, 'w', NOW)
  assert.match(out[0].headline, /adds 3 new UK dates/)
})

test('a brand-new artist is framed as an announcement; high priority for big tours', () => {
  const cities = ['A', 'B', 'C', 'D', 'E', 'F']
  const rows = cities.map(c => row({ artist_id: 'n', artist_name: 'Newcomer', artist_slug: 'newcomer', venue_city: c, artist_created_at: '2026-10-15T00:00:00Z' }))
  const out = buildArtistAdditions(rows, 'w', NOW)
  assert.equal(out[0].headline, 'Newcomer announces UK dates')
  assert.equal(out[0].storyType, 'tour_announcement')
  assert.equal(out[0].priority, 'high')
  assert.match(out[0].summary, /plus 2 more/)
})

test('only the biggest few artist items are auto-published', () => {
  const rows: NewShowRow[] = []
  for (let a = 0; a < 6; a++) {
    for (let c = 0; c < 3 + a; c++) {
      rows.push(row({ artist_id: `art${a}`, artist_name: `Artist ${a}`, artist_slug: `art-${a}`, venue_city: `City${c}` }))
    }
  }
  const out = buildArtistAdditions(rows, 'w', NOW)
  assert.equal(out.length, 6)
  assert.equal(out.filter(i => i.autoPublish).length, 4)
  assert.equal(out[0].autoPublish, true)
  assert.equal(out[5].autoPublish, false)
})

test('artists already drafted are skipped', () => {
  const rows = ['A', 'B', 'C'].map(c => row({ artist_id: 'x', artist_name: 'Band X', artist_slug: 'band-x', venue_city: c }))
  assert.equal(buildArtistAdditions(rows, 'w', NOW, { skipArtistSlugs: new Set(['band-x']) }).length, 0)
})

test('artistSlugFromDraftUrl extracts the slug', () => {
  assert.equal(artistSlugFromDraftUrl('https://theshowfinder.com/artists/band-x?added=2026-W42'), 'band-x')
  assert.equal(artistSlugFromDraftUrl('https://theshowfinder.com/cities/derby?new=1'), null)
})

test('hospitality packages and club fixtures are not newsworthy artists', () => {
  assert.equal(isNewsworthyArtistName('Utilita Arena Sheffield – Premium Packages'), false)
  assert.equal(isNewsworthyArtistName('Derby County FC'), false)
  assert.equal(isNewsworthyArtistName('Oasis'), true)
  assert.equal(isNewsworthyArtistName(null), false)
  const rows = ['A', 'B', 'C'].map(c => row({ artist_id: 'p', artist_name: 'First Direct Arena - Premium Packages', artist_slug: 'pp', venue_city: c }))
  assert.equal(buildArtistAdditions(rows, 'w', NOW).length, 0)
})
