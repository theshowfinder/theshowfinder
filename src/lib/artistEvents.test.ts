import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  toArtistEventRows, shouldIndexArtistPage, shouldListArtistInSitemap, artistMetaDescription,
  type ArtistEventLink,
} from './artistEvents.ts'

const link = (id: string, start: string, venue: { name: string; city: string } | null = { name: 'O2', city: 'London' }): ArtistEventLink => ({
  events: { id, slug: `ev-${id}`, title: `Ev ${id}`, start_date: start, status: 'on_sale', venue },
})

describe('toArtistEventRows', () => {
  test('sorts soonest first', () => {
    const rows = toArtistEventRows([link('b', '2027-02-01T19:00:00Z'), link('a', '2026-11-01T19:00:00Z')])
    assert.deepEqual(rows.map(r => r.id), ['a', 'b'])
  })
  test('de-duplicates the same event linked twice', () => {
    assert.equal(toArtistEventRows([link('a', '2026-11-01T19:00:00Z'), link('a', '2026-11-01T19:00:00Z')]).length, 1)
  })
  test('drops links with no joined event and tolerates null input', () => {
    assert.equal(toArtistEventRows([{ events: null }]).length, 0)
    assert.deepEqual(toArtistEventRows(null), [])
  })
  test('handles a missing venue', () => {
    const [r] = toArtistEventRows([link('a', '2026-11-01T19:00:00Z', null)])
    assert.equal(r.venueName, null)
    assert.equal(r.venueCity, null)
  })
})

describe('shouldIndexArtistPage', () => {
  test('needs upcoming events or tour dates', () => {
    assert.equal(shouldIndexArtistPage({ upcomingEvents: 0, tourDates: 0 }), false)
    assert.equal(shouldIndexArtistPage({ upcomingEvents: 1, tourDates: 0 }), true)
    assert.equal(shouldIndexArtistPage({ upcomingEvents: 0, tourDates: 3 }), true)
  })
})

describe('shouldListArtistInSitemap', () => {
  test('two or more upcoming events', () => {
    assert.equal(shouldListArtistInSitemap({ name: 'Act', upcomingEvents: 2 }), true)
    assert.equal(shouldListArtistInSitemap({ name: 'Act', upcomingEvents: 1 }), false)
    assert.equal(shouldListArtistInSitemap({ name: 'Act', upcomingEvents: 0 }), false)
  })
  test('curated artists are always listed', () => {
    assert.equal(shouldListArtistInSitemap({ name: 'Act', upcomingEvents: 0, isFeatured: true }), true)
    assert.equal(shouldListArtistInSitemap({ name: 'Act', upcomingEvents: 0, hasTour: true }), true)
  })
  test('blank names are never listed', () => {
    assert.equal(shouldListArtistInSitemap({ name: '', upcomingEvents: 9 }), false)
    assert.equal(shouldListArtistInSitemap({ name: ' ', upcomingEvents: 9, isFeatured: true }), false)
    assert.equal(shouldListArtistInSitemap({ name: null, upcomingEvents: 9 }), false)
  })
})

describe('artistMetaDescription', () => {
  const rows = toArtistEventRows([link('a', '2026-11-28T16:00:00Z', { name: 'Scarborough Spa', city: 'Scarborough' })])
  test('single show names the venue, city and date', () => {
    const d = artistMetaDescription('Mr. Polska', rows)
    assert.match(d, /Mr\. Polska plays Scarborough Spa in Scarborough on 28 November 2026/)
  })
  test('several shows give a count', () => {
    const many = toArtistEventRows([link('a', '2026-11-28T16:00:00Z'), link('b', '2026-12-01T16:00:00Z')])
    assert.match(artistMetaDescription('Act', many), /2 upcoming UK dates, next 28 November 2026 in London/)
  })
  test('no events falls back to the generic line', () => {
    assert.match(artistMetaDescription('Act', []), /^Find Act UK tour dates/)
  })
})
