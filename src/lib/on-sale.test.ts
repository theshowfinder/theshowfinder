import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  extractArtistName,
  toSlug,
  groupEventsByArtist,
  fmtOnSaleLabel,
  onSaleThisWeekWindow,
  presaleOpenNowWindow,
  mergeEventsById,
} from './on-sale.ts'
import type { EventWithVenue, Artist } from './types/database'

// Minimal EventWithVenue fixture — only the fields the functions under
// test actually read. Cast through `unknown` like the rest of the
// codebase does for this generated view type.
function fakeEvent(overrides: Record<string, unknown>): EventWithVenue {
  return {
    id:                 'evt-1',
    title:              'Some Artist',
    start_date:         '2026-06-01T19:00:00.000Z',
    onsale_date:        null,
    public_onsale_start: null,
    presale_start:      null,
    presale_end:        null,
    image_url:          null,
    tickets_url:        null,
    venue_city:         'London',
    ...overrides,
  } as unknown as EventWithVenue
}

describe('extractArtistName', () => {
  test('strips a " | Tour Name" suffix', () => {
    assert.equal(extractArtistName('Taylor Swift | The Eras Tour'), 'Taylor Swift')
  })

  test('strips a ": subtitle" suffix', () => {
    assert.equal(extractArtistName('Coldplay: Music of the Spheres'), 'Coldplay')
  })

  test('strips a " - subtitle" suffix', () => {
    assert.equal(extractArtistName('Lewis Capaldi - Broken By Desire'), 'Lewis Capaldi')
  })

  test('leaves a plain title untouched', () => {
    assert.equal(extractArtistName('Harry Styles'), 'Harry Styles')
  })
})

describe('toSlug', () => {
  test('lowercases and hyphenates', () => {
    assert.equal(toSlug('Gracie Abrams'), 'gracie-abrams')
  })

  test('strips punctuation rather than hyphenating it', () => {
    assert.equal(toSlug("Theory of a Deadman: The Barricade Tour"), 'theory-of-a-deadman-the-barricade-tour')
  })

  test('is not reversible for punctuation-bearing names (documents the ILIKE-fallback bug this replaced)', () => {
    // "InPop" style names with an ampersand/colon collapse the same way a
    // completely different name might — this is exactly why the old detail
    // page's `.ilike('title', slug.replace(/-/g, ' ') + '%')` fallback was
    // unreliable and was removed in favour of resolving by id.
    assert.equal(toSlug('Above & Beyond'), 'above-beyond')
  })
})

describe('groupEventsByArtist', () => {
  test('groups events by extracted artist name and picks the earliest sale date', () => {
    const events = [
      fakeEvent({ id: 'a', title: 'Oasis | Live 26', public_onsale_start: '2026-05-10T09:00:00.000Z' }),
      fakeEvent({ id: 'b', title: 'Oasis | Live 26', presale_start: '2026-05-08T09:00:00.000Z' }),
    ]
    const [group] = groupEventsByArtist(events, [])
    assert.equal(group.artistName, 'Oasis')
    assert.equal(group.slug, 'oasis')
    assert.equal(group.events.length, 2)
    assert.equal(group.onsale_date, '2026-05-08T09:00:00.000Z')
    assert.equal(group.saleType, 'presale')
  })

  test('attaches the matching artists-table row by name', () => {
    const artists = [{ name: 'Oasis', image_url: 'oasis.jpg' } as unknown as Artist]
    const events  = [fakeEvent({ title: 'Oasis' })]
    const [group] = groupEventsByArtist(events, artists)
    assert.equal(group.dbArtist?.name, 'Oasis')
  })
})

describe('fmtOnSaleLabel', () => {
  test('formats an ISO date as a short GMT label', () => {
    const label = fmtOnSaleLabel('2026-05-08T09:00:00.000Z')
    assert.match(label, /GMT$/)
  })
})

// ── Regression coverage for the "On Sale This Week" 404 bug ─────────────
//
// Root cause: the detail page at /on-sale-this-week/[slug] used to resolve
// against its own 3-day lookback window, while the homepage's "Presales
// Open Now" cards (linking to the very same route) used a 21-day lookback.
// A presale that opened, say, 10 days ago was still shown live by
// "Presales Open Now" but fell outside the detail page's window and 404'd
// on click. onSaleThisWeekWindow / presaleOpenNowWindow / mergeEventsById
// are the shared single source of truth that closes that gap — these
// tests pin down their exact bounds and the merge behaviour the fix
// depends on.

describe('onSaleThisWeekWindow', () => {
  test('floors 3 days back and ceils 7 days ahead of the given instant', () => {
    const now = new Date('2026-06-15T12:00:00.000Z')
    const { floorISO, ceilISO } = onSaleThisWeekWindow(now)
    assert.equal(floorISO, '2026-06-12T12:00:00.000Z')
    assert.equal(ceilISO,  '2026-06-22T12:00:00.000Z')
  })
})

describe('presaleOpenNowWindow', () => {
  test('floors 21 days back and ceils at the given instant', () => {
    const now = new Date('2026-06-15T12:00:00.000Z')
    const { floorISO, ceilISO } = presaleOpenNowWindow(now)
    assert.equal(floorISO, '2026-05-25T12:00:00.000Z')
    assert.equal(ceilISO,  '2026-06-15T12:00:00.000Z')
  })

  test('the literal regression case: a presale 10 days old falls inside presaleOpenNowWindow but outside onSaleThisWeekWindow', () => {
    const now          = new Date('2026-06-15T12:00:00.000Z')
    const presaleStart = '2026-06-05T12:00:00.000Z' // 10 days before `now`

    const weekWindow    = onSaleThisWeekWindow(now)
    const presaleWindow = presaleOpenNowWindow(now)

    assert.ok(presaleStart < weekWindow.floorISO, 'expected the presale to be older than the 3-day on-sale-this-week floor')
    assert.ok(presaleStart >= presaleWindow.floorISO && presaleStart <= presaleWindow.ceilISO,
      'expected the presale to still fall inside the 21-day presale-open-now window')
  })
})

describe('mergeEventsById', () => {
  test('dedupes the same event id appearing in multiple pools', () => {
    const shared = fakeEvent({ id: 'shared-1', start_date: '2026-07-01T00:00:00.000Z' })
    const merged = mergeEventsById([shared], [shared])
    assert.equal(merged.length, 1)
  })

  test('unions distinct events from every pool passed in', () => {
    const onSalePool = [fakeEvent({ id: 'a', start_date: '2026-07-02T00:00:00.000Z' })]
    const presalePool = [fakeEvent({ id: 'b', start_date: '2026-07-01T00:00:00.000Z' })]
    const merged = mergeEventsById(onSalePool, presalePool)
    assert.deepEqual(merged.map(e => e.id), ['b', 'a']) // sorted by start_date
  })

  test('resolves the regression scenario: an event only present in the presale-open-now pool is still found once merged', () => {
    // Simulates the exact bug: the on-sale-this-week pool (3-day lookback)
    // does not contain this event, but the presale-open-now pool (21-day
    // lookback) does. The old detail page only ever queried the former
    // shape and would 404. Merging both pools, as the fixed detail page
    // now does, resolves it.
    const onSaleThisWeekPool: EventWithVenue[] = [] // the 10-day-old presale is outside this 3-day window
    const presaleOpenNowPool = [fakeEvent({ id: 'inpop-1', title: 'InPop', start_date: '2026-09-01T00:00:00.000Z' })]

    const merged = mergeEventsById(onSaleThisWeekPool, presaleOpenNowPool)
    const groups = groupEventsByArtist(merged, [])
    const group  = groups.find(g => g.slug === toSlug('InPop'))

    assert.ok(group, 'expected the InPop group to resolve from the merged pool')
    assert.equal(group?.events[0]?.id, 'inpop-1')
  })
})
