import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  isWestEndVenue, westEndVenueSearchTerms, groupShows, westEndShows, attractionShows,
  summarizeVenues, slugifyShow, normalizeVenueName, type ShowEvent,
} from './shows.ts'

const NOW = new Date('2026-10-12T12:00:00Z')
let n = 0
function ev(title: string, start: string, venue: string, extra: Partial<ShowEvent> = {}): ShowEvent {
  n++
  return {
    id: `id${n}`, slug: `${slugifyShow(title)}-${n}`, title, start_date: start, status: 'on_sale',
    venue_name: venue, venue_city: 'London', venue_slug: slugifyShow(venue), ...extra,
  }
}

describe('isWestEndVenue', () => {
  test('recognises West End theatres, ignoring case, punctuation, diacritics and "The"', () => {
    assert.ok(isWestEndVenue('Victoria Palace Theatre', 'London'))
    assert.ok(isWestEndVenue("St Martin's Theatre", 'London'))
    assert.ok(isWestEndVenue('Noel Coward Theatre', 'London'))
    assert.ok(isWestEndVenue('Noël Coward Theatre', 'London'))
    assert.ok(isWestEndVenue('The London Palladium', 'London'))
    assert.ok(isWestEndVenue('London Palladium', 'London'))
    assert.ok(isWestEndVenue('Theatre Royal, Drury Lane', 'London'))
    assert.ok(isWestEndVenue('The Theatre at the Hippodrome Casino', 'London'))
    assert.ok(isWestEndVenue('Savoy Theatre'))
  })
  test('does not treat similar names or other places as West End', () => {
    assert.equal(isWestEndVenue('Alexandra Palace Theatre', 'London'), false)
    assert.equal(isWestEndVenue('Palace Theatre', 'Manchester'), false)
    assert.equal(isWestEndVenue('Troubadour Wembley Park Theatre', 'London'), false)
    assert.equal(isWestEndVenue('The O2', 'London'), false)
    assert.equal(isWestEndVenue('', 'London'), false)
    assert.equal(isWestEndVenue(null), false)
  })
  test('search terms are plain substrings (no wildcards/commas)', () => {
    const terms = westEndVenueSearchTerms()
    assert.ok(terms.includes('Victoria Palace Theatre'))
    assert.ok(terms.includes('London Palladium'))
    for (const t of terms) assert.ok(!/[,*%()]/.test(t), t)
    assert.ok(normalizeVenueName('x') === 'x')
  })
})

describe('groupShows', () => {
  test('collapses performances into one show, with next date, count and from-price', () => {
    const events = [
      ev('Hamilton', '2026-10-14T19:30:00Z', 'Victoria Palace Theatre', { price_from: 60 }),
      ev('Hamilton', '2026-10-13T14:30:00Z', 'Victoria Palace Theatre', { price_from: 45 }),
      ev('Hamilton', '2026-10-13T19:30:00Z', 'Victoria Palace Theatre', { price_from: 80 }),
      ev('Wicked', '2026-10-13T19:30:00Z', 'Apollo Victoria Theatre', { price_from: 50 }),
    ]
    const shows = groupShows(events, NOW)
    assert.equal(shows.length, 2)
    const h = shows.find(s => s.title === 'Hamilton')!
    assert.equal(h.dateCount, 3)
    assert.equal(h.nextDate, '2026-10-13T14:30:00Z')
    assert.equal(h.priceFrom, 45)
    assert.equal(h.slug, 'hamilton-victoria-palace-theatre')
    assert.deepEqual(h.dates.map(d => d.start_date), [
      '2026-10-13T14:30:00Z', '2026-10-13T19:30:00Z', '2026-10-14T19:30:00Z',
    ])
    assert.equal(h.nextEventSlug, h.dates[0].slug)
  })

  test('title casing variants are one show; display uses the most common spelling', () => {
    const events = [
      ev('Matilda The Musical', '2026-10-13T19:00:00Z', 'Cambridge Theatre'),
      ev('Matilda the Musical', '2026-10-14T19:00:00Z', 'Cambridge Theatre'),
      ev('Matilda the Musical', '2026-10-15T19:00:00Z', 'Cambridge Theatre'),
    ]
    const shows = groupShows(events, NOW)
    assert.equal(shows.length, 1)
    assert.equal(shows[0].title, 'Matilda the Musical')
    assert.equal(shows[0].dateCount, 3)
  })

  test('same title at a different venue is a different show', () => {
    const shows = groupShows([
      ev('Mamma Mia!', '2026-10-13T19:00:00Z', 'Novello Theatre'),
      ev('Mamma Mia!', '2026-10-13T19:00:00Z', 'Other Theatre'),
    ], NOW)
    assert.equal(shows.length, 2)
  })

  test('ignores past, cancelled and postponed performances', () => {
    const shows = groupShows([
      ev('Past Show', '2026-10-01T19:00:00Z', 'A'),
      ev('Cancelled Show', '2026-10-13T19:00:00Z', 'A', { status: 'cancelled' }),
      ev('Postponed Show', '2026-10-13T19:00:00Z', 'A', { status: 'postponed' }),
      ev('Live Show', '2026-10-13T19:00:00Z', 'A'),
    ], NOW)
    assert.deepEqual(shows.map(s => s.title), ['Live Show'])
  })

  test('longest-running first, then alphabetical', () => {
    const events = [
      ev('B Show', '2026-10-13T19:00:00Z', 'V'),
      ev('A Show', '2026-10-13T19:00:00Z', 'V'),
      ev('Long Run', '2026-10-13T19:00:00Z', 'V'), ev('Long Run', '2026-10-14T19:00:00Z', 'V'),
    ]
    assert.deepEqual(groupShows(events, NOW).map(s => s.title), ['Long Run', 'A Show', 'B Show'])
  })

  test('sold out only when every performance is sold out; missing prices are null', () => {
    const all = groupShows([
      ev('X', '2026-10-13T19:00:00Z', 'V', { status: 'sold_out' }),
      ev('X', '2026-10-14T19:00:00Z', 'V', { status: 'sold_out' }),
    ], NOW)
    assert.equal(all[0].status, 'sold_out')
    assert.equal(all[0].priceFrom, null)
    const some = groupShows([
      ev('Y', '2026-10-13T19:00:00Z', 'V', { status: 'sold_out' }),
      ev('Y', '2026-10-14T19:00:00Z', 'V'),
    ], NOW)
    assert.equal(some[0].status, 'on_sale')
  })

  test('empty input', () => {
    assert.deepEqual(groupShows([], NOW), [])
  })
})

describe('westEndShows / attractionShows / summarizeVenues', () => {
  const events = [
    ev('Hamilton', '2026-10-13T19:30:00Z', 'Victoria Palace Theatre'),
    ev('Hamilton', '2026-10-14T19:30:00Z', 'Victoria Palace Theatre'),
    ev('Wicked', '2026-10-13T19:30:00Z', 'Apollo Victoria Theatre'),
    ev('Coldplay', '2026-10-13T19:30:00Z', 'Wembley Stadium'),
    ev('London Eye - Standard Experience', '2026-10-13T10:00:00Z', 'The London Eye', { category: 'family' }),
    ev('Twist Museum - London\'s Home of Illusions PEAK', '2026-10-13T10:00:00Z', 'Twist Museum', { category: 'family' }),
    ev('SIX The Musical', '2026-10-13T19:30:00Z', 'Vaudeville Theatre'),
    ev('Witness for the Prosecution', '2026-10-13T19:30:00Z', 'County Hall'),
    ev("Shrek's Adventure - Standard Experience", '2026-10-13T10:00:00Z', 'County Hall', { category: 'theatre' }),
    ev('Sea Life London - Standard Entry', '2026-10-13T10:00:00Z', 'County Hall', { category: 'family' }),
    ev('Burlesque', '2026-10-13T19:30:00Z', 'The Arts at Marble Arch'),
    ev('Come Alive! The Greatest Showman Circus Spectacular', '2026-10-13T19:30:00Z', 'Empress Museum'),
    ev('Faulty Towers the Dining Experience', '2026-10-13T19:30:00Z', 'President Hotel'),
    ev('Troubadour Show', '2026-10-13T19:30:00Z', 'Troubadour Wembley Park Theatre'),
  ]
  test('west end hub only contains West End venues', () => {
    assert.deepEqual(westEndShows(events, NOW).map(s => s.title).sort(), ['Burlesque', 'Hamilton', 'SIX The Musical', 'Wicked', 'Witness for the Prosecution'])
  })
  test('attractions hub only contains attractions', () => {
    assert.equal(attractionShows(events, NOW).length, 4) // London Eye, Twist Museum, Shrek's Adventure, Sea Life
  })
  test('venue summary counts shows per theatre', () => {
    const v = summarizeVenues(westEndShows(events, NOW))
    assert.equal(v.length, 5)
    assert.ok(v.every(x => x.shows >= 1))
  })
})

describe('slugifyShow', () => {
  test('url-safe', () => {
    assert.equal(slugifyShow("Disney's THE LION KING"), 'disneys-the-lion-king')
    assert.equal(slugifyShow('Oliver!'), 'oliver')
    assert.equal(slugifyShow('Noël Coward Theatre'), 'noel-coward-theatre')
  })
})
