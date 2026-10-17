import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { buildTourAnnouncements, citiesPhrase, announcedLabel } from './tourHub.ts'
import type { NewShowRow } from './newShows.ts'

const NOW = new Date('2026-10-17T12:00:00Z')
let n = 0
function row(over: Partial<NewShowRow> = {}): NewShowRow {
  n++
  return {
    event_id: `e${n}`, title: 'Show', category: 'concert',
    start_date: '2027-02-01T19:30:00Z', created_at: '2026-10-15T09:00:00Z',
    venue_name: `Venue ${n}`, venue_city: `City${n}`, venue_capacity: 2000,
    public_onsale_start: null, artist_id: 'a1', artist_name: 'Band', artist_slug: 'band',
    artist_created_at: '2026-01-01T00:00:00Z', ...over,
  }
}
const tour = (artist: string, dates: string[], over: Partial<NewShowRow> = {}) =>
  dates.map((d, i) => row({ artist_id: artist, artist_name: artist, artist_slug: artist.toLowerCase(), start_date: d, venue_city: `City${i}`, venue_name: `V${artist}${i}`, ...over }))

describe('tour hub', () => {
  test('needs min shows and min cities', () => {
    const rows = [
      ...tour('Solo', ['2027-02-01T19:00:00Z', '2027-02-02T19:00:00Z']),
      ...tour('Tour', ['2027-02-01T19:00:00Z', '2027-02-03T19:00:00Z', '2027-02-05T19:00:00Z']),
      ...['2027-03-01T19:00:00Z', '2027-03-02T19:00:00Z', '2027-03-03T19:00:00Z'].map(d =>
        row({ artist_id: 'res', artist_name: 'Resident', artist_slug: 'resident', venue_city: 'London', venue_name: 'O2', start_date: d })),
    ]
    const r = buildTourAnnouncements(rows, NOW)
    assert.deepEqual(r.map(t => t.artistName), ['Tour'])
    assert.equal(r[0].showCount, 3)
    assert.equal(r[0].cities.length, 3)
  })

  test('ignores old listings, past shows, sport and non-show names', () => {
    const rows = [
      ...tour('Old', ['2027-02-01T19:00:00Z', '2027-02-02T19:00:00Z', '2027-02-03T19:00:00Z'], { created_at: '2026-09-01T00:00:00Z' }),
      ...tour('Past', ['2026-10-01T19:00:00Z', '2026-10-02T19:00:00Z', '2026-10-03T19:00:00Z']),
      ...tour('Football', ['2027-02-01T19:00:00Z', '2027-02-02T19:00:00Z', '2027-02-03T19:00:00Z'], { category: 'sports' }),
      ...tour('Hospitality Premium Packages', ['2027-02-01T19:00:00Z', '2027-02-02T19:00:00Z', '2027-02-03T19:00:00Z']),
    ]
    assert.equal(buildTourAnnouncements(rows, NOW).length, 0)
  })

  test('collapses presale duplicates and sorts newest announcement first', () => {
    const a = tour('Alpha', ['2027-02-01T19:00:00Z', '2027-02-02T19:00:00Z', '2027-02-03T19:00:00Z'], { created_at: '2026-10-10T00:00:00Z' })
    const b = tour('Bravo', ['2027-02-01T19:00:00Z', '2027-02-02T19:00:00Z', '2027-02-03T19:00:00Z'], { created_at: '2026-10-16T00:00:00Z' })
    const dup = { ...a[0], event_id: 'dup' }
    const r = buildTourAnnouncements([...a, dup, ...b], NOW)
    assert.deepEqual(r.map(t => t.artistName), ['Bravo', 'Alpha'])
    assert.equal(r[1].showCount, 3)
  })

  test('flags a brand-new artist and names the biggest venue', () => {
    const rows = tour('Fresh', ['2027-02-01T19:00:00Z', '2027-02-02T19:00:00Z', '2027-02-03T19:00:00Z'], { artist_created_at: '2026-10-14T00:00:00Z' })
    rows[1].venue_capacity = 9000
    const [t] = buildTourAnnouncements(rows, NOW)
    assert.equal(t.isBrandNew, true)
    assert.equal(t.biggestVenue, rows[1].venue_name)
    assert.equal(t.firstDate, '2027-02-01T19:00:00Z')
    assert.equal(t.lastDate, '2027-02-03T19:00:00Z')
  })

  test('citiesPhrase and announcedLabel read naturally', () => {
    assert.equal(citiesPhrase(['A']), 'A')
    assert.equal(citiesPhrase(['A', 'B', 'C']), 'A, B and C')
    assert.equal(citiesPhrase(['A', 'B', 'C', 'D', 'E']), 'A, B and 3 more cities')
    assert.equal(announcedLabel('2026-10-17T01:00:00Z', NOW), 'today')
    assert.equal(announcedLabel('2026-10-16T01:00:00Z', NOW), 'yesterday')
    assert.equal(announcedLabel('2026-10-12T01:00:00Z', NOW), '5 days ago')
  })
})
