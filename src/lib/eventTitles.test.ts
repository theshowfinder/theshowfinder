import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cleanSeriesName, isDartsTitle, isPackageOrClassTitle, seriesKey } from './eventTitles.ts'
import { groupEventsByArtist, dropPackageListings, onSaleSlugOf, extractSeriesKey } from './on-sale.ts'
import { displayTitle } from './displayTitle.ts'
import { buildTourAnnouncements } from './tourHub.ts'
import type { EventWithVenue } from './types/database'

test('darts variants share one series key and a clean name', () => {
  const titles = [
    'BETMGM Premier League Darts',
    '202 BetMGM Premier League Darts - Venue Premium Tickets',
    '2027 BetMGM Premier League Darts',
    'Premier League Darts 2027',
    'BetMGM Premier League Darts',
  ]
  assert.equal(new Set(titles.map(onSaleSlugOf)).size, 1)
  assert.equal(cleanSeriesName('202 BetMGM Premier League Darts'), 'BetMGM Premier League Darts')
  assert.equal(cleanSeriesName('Premier League Darts 2027'), 'Premier League Darts')
  assert.equal(cleanSeriesName('BETMGM Premier League Darts'), 'BetMGM Premier League Darts')
})

test('years that are part of a name are kept', () => {
  assert.equal(cleanSeriesName('2000 Trees Festival'), '2000 Trees Festival')
  assert.equal(cleanSeriesName('The 1975'), 'The 1975')
  assert.equal(cleanSeriesName('Blink-182'), 'Blink-182')
  assert.equal(seriesKey('Taylor Swift'), 'taylor-swift')
})

test('package and class listings are recognised', () => {
  assert.ok(isPackageOrClassTitle('Venue Premium Tickets'))
  assert.ok(isPackageOrClassTitle('Fishies Week 7'))
  assert.ok(isPackageOrClassTitle('Gladiators Live - Venue Premium Tickets'))
  assert.ok(!isPackageOrClassTitle('BetMGM Premier League Darts'))
  assert.ok(!isPackageOrClassTitle('Kevin Bridges'))
})

test('darts titles are recognised', () => {
  assert.ok(isDartsTitle('Darts'))
  assert.ok(isDartsTitle('Premier League Darts 2027'))
  assert.ok(isDartsTitle('A Night at the Darts'))
  assert.ok(!isDartsTitle('Darts and Fancy Dress Night'))
})

test('displayTitle drops a stray 202 prefix', () => {
  assert.equal(displayTitle('202 BetMGM Premier League Darts'), 'BetMGM Premier League Darts')
  assert.equal(displayTitle('2027 BetMGM Premier League Darts'), '2027 BetMGM Premier League Darts')
})

function ev(id: string, title: string): EventWithVenue {
  return { id, title, onsale_date: '2026-10-21T09:00:00Z', public_onsale_start: '2026-10-21T09:00:00Z', presale_start: null, image_url: null } as unknown as EventWithVenue
}

test('on sale: darts variants become one card; packages are dropped first', () => {
  const pool = dropPackageListings([
    ev('1', 'BETMGM Premier League Darts'),
    ev('2', '202 BetMGM Premier League Darts - Venue Premium Tickets'),
    ev('3', '2027 BetMGM Premier League Darts'),
    ev('4', 'Premier League Darts 2027'),
    ev('5', 'Venue Premium Tickets'),
    ev('6', 'Fishies Week 6'),
    ev('7', 'Kevin Bridges'),
  ])
  const groups = groupEventsByArtist(pool, [])
  assert.deepEqual(groups.map(g => g.artistName).sort(), ['BetMGM Premier League Darts', 'Kevin Bridges'])
  const darts = groups.find(g => g.artistName.includes('Darts'))!
  assert.equal(darts.events.length, 3)
  assert.equal(extractSeriesKey('2027 BetMGM Premier League Darts'), darts.slug)
})

test('new tours: packages, classes and darts never appear; artist variants merge', () => {
  const now = new Date('2026-10-19T12:00:00Z')
  const row = (n: number, artist: string, id: string, title: string, city: string) => ({
    event_id: `e${n}`, title, category: 'concert', start_date: `2027-02-0${n}T19:30:00Z`, created_at: '2026-10-18T09:00:00Z',
    venue_name: `V${n}`, venue_city: city, venue_capacity: 3000, public_onsale_start: null,
    artist_id: id, artist_name: artist, artist_slug: artist.toLowerCase().replace(/\s+/g, '-'), artist_created_at: null,
  })
  const cities = ['Leeds', 'York', 'Hull']
  const rows = [
    ...cities.map((c, i) => row(i + 1, 'Venue Premium Tickets', 'p', 'Venue Premium Tickets', c)),
    ...cities.map((c, i) => row(i + 1, 'Fishies Week 6', 'f', 'Fishies Week 6', c)),
    ...cities.map((c, i) => row(i + 1, 'BetMGM Premier League Darts', 'd', 'BetMGM Premier League Darts', c)),
    row(1, 'Kevin Bridges', 'k1', 'Kevin Bridges', 'Leeds'),
    row(2, 'Kevin Bridges', 'k1', 'Kevin Bridges', 'York'),
    row(3, 'Kevin Bridges 2027', 'k2', 'Kevin Bridges', 'Hull'),
  ]
  const out = buildTourAnnouncements(rows, now)
  assert.deepEqual(out.map(o => o.artistName), ['Kevin Bridges'])
  assert.equal(out[0].showCount, 3)
})
