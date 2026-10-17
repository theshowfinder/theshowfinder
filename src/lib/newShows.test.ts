import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  type NewShowRow,
  buildCityRoundups,
  buildArtistAdditions,
  isoWeekKey,
  shortUkDate,
  artistSlugFromDraftUrl,
  isNewsworthyArtistName,
} from './newShows.ts'

const NOW = Date.parse('2026-10-17T05:00:00Z')

let n = 0
function row(over: Partial<NewShowRow>): NewShowRow {
  n++
  return {
    event_id: `e${n}`, title: 't', category: 'concert', start_date: '2026-11-20T19:30:00Z',
    created_at: '2026-10-16T09:00:00Z', venue_name: 'Venue', venue_city: 'Derby',
    artist_id: `a${n}`, artist_name: `Artist ${n}`, artist_slug: `artist-${n}`, artist_created_at: '2020-01-01T00:00:00Z',
    ...over,
  }
}

test('isoWeekKey gives ISO weeks, including year boundaries', () => {
  assert.equal(isoWeekKey(new Date('2026-10-17T05:00:00Z')), '2026-W42')
  assert.equal(isoWeekKey(new Date('2026-01-01T12:00:00Z')), '2026-W01')
  assert.equal(isoWeekKey(new Date('2027-01-01T12:00:00Z')), '2026-W53')
})

test('shortUkDate formats in UK time', () => {
  assert.equal(shortUkDate('2026-10-23T23:30:00Z'), 'Sat 24 Oct')
})

test('city roundup needs the minimum number of shows and matches cities case-insensitively', () => {
  const few = [row({}), row({}), row({})]
  assert.equal(buildCityRoundups(few, ['Derby'], '2026-W42').length, 0)
  const enough = [row({ venue_city: 'derby' }), row({}), row({}), row({})]
  const out = buildCityRoundups(enough, ['Derby'], '2026-W42')
  assert.equal(out.length, 1)
  assert.equal(out[0].headline, 'New shows added in Derby this week')
  assert.equal(out[0].url, 'https://theshowfinder.com/cities/derby?new=2026-W42')
  assert.equal(out[0].scope, 'city')
  assert.match(out[0].summary, /4 new shows have been listed in Derby/)
})

test('city roundup ignores unknown cities, duplicates, and keeps sports out of the highlights', () => {
  const dup = row({})
  const rows = [dup, dup, row({ category: 'sports', artist_name: 'Derby County v X' }), row({}), row({}), row({ venue_city: 'Atlantis' })]
  const out = buildCityRoundups(rows, ['Derby'], '2026-W42')
  assert.equal(out.length, 1)
  assert.match(out[0].summary, /4 new shows/)
  assert.doesNotMatch(out[0].summary, /Derby County v X/)
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

test('artist additions group by artist, need 3 dates, skip sports', () => {
  const rows = [
    ...[1, 2, 3].map(i => row({ artist_id: 'x', artist_name: 'Band X', artist_slug: 'band-x', venue_city: ['Leeds', 'Derby', 'Hull'][i - 1] })),
    row({ artist_id: 'y', artist_name: 'Solo Y', artist_slug: 'solo-y' }),
    ...[1, 2, 3].map(() => row({ artist_id: 'z', artist_name: 'FC Z', artist_slug: 'fc-z', category: 'sports' })),
  ]
  const out = buildArtistAdditions(rows, '2026-W42', NOW)
  assert.equal(out.length, 1)
  assert.equal(out[0].headline, 'Band X adds 3 new UK dates')
  assert.equal(out[0].storyType, 'new_dates')
  assert.equal(out[0].scope, 'national')
  assert.equal(out[0].url, 'https://theshowfinder.com/artists/band-x?added=2026-W42')
  assert.match(out[0].summary, /3 UK cities/)
})

test('a brand-new artist is framed as an announcement; high priority for big runs', () => {
  const rows = Array.from({ length: 8 }, () => row({ artist_id: 'n', artist_name: 'Newcomer', artist_slug: 'newcomer', artist_created_at: '2026-10-15T00:00:00Z' }))
  const out = buildArtistAdditions(rows, 'w', NOW)
  assert.equal(out[0].headline, 'Newcomer announces UK dates')
  assert.equal(out[0].storyType, 'tour_announcement')
  assert.equal(out[0].priority, 'high')
  assert.match(out[0].summary, /plus 4 more/)
})

test('artists already drafted are skipped', () => {
  const rows = Array.from({ length: 3 }, () => row({ artist_id: 'x', artist_name: 'Band X', artist_slug: 'band-x' }))
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
  assert.equal(isNewsworthyArtistName('Dan and Phil'), true)
  assert.equal(isNewsworthyArtistName(null), false)
  const rows = Array.from({ length: 3 }, () => row({ artist_id: 'p', artist_name: 'First Direct Arena - Premium Packages', artist_slug: 'pp' }))
  assert.equal(buildArtistAdditions(rows, 'w', NOW).length, 0)
})
