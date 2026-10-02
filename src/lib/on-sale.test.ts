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
  extractSeriesKey,
  capGroupsBySeries,
  hasReliableOnSaleDate,
  ON_SALE_MAX_PER_SERIES,
} from './on-sale.ts'
import type { OnSaleGroup } from './on-sale.ts'
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
  // Requirement: "On Sale This Week" means the literal Monday-Sunday UK
  // calendar week containing `now`, not a rolling lookback — delegates to
  // intelligence.ts's londonCalendarWeekWindow (see that file's own tests
  // for the full BST-boundary coverage); these tests just pin the public
  // {floorISO, ceilISO} contract every caller of this function depends on.
  test('a midweek instant resolves to that week\'s Monday-Sunday bounds', () => {
    // 17 Jun 2026 is a Wednesday; that week runs Mon 15 Jun - Sun 21 Jun.
    const now = new Date('2026-06-17T12:00:00.000Z')
    const { floorISO, ceilISO } = onSaleThisWeekWindow(now)
    assert.equal(floorISO, '2026-06-14T23:00:00.000Z') // Mon 15 Jun 00:00 BST
    assert.equal(ceilISO,  '2026-06-21T23:00:00.000Z') // Mon 22 Jun 00:00 BST
  })

  test('an event that went on sale last Saturday is outside this week\'s window', () => {
    const now            = new Date('2026-06-17T12:00:00.000Z') // Wed, week of 15-21 Jun
    const lastSaturday    = '2026-06-13T10:00:00.000Z'            // the Saturday BEFORE this week started
    const { floorISO }    = onSaleThisWeekWindow(now)
    assert.ok(lastSaturday < floorISO, 'a last-Saturday on-sale date should fall before this week\'s Monday floor')
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


// ── Series diversity: preventing one team/artist/tour from flooding ─────
// "On Sale This Week" (requirement 13), while never hiding a genuinely
// separate fixture (requirement 14) or discriminating by category
// (requirement 15).

function onSaleGroup(overrides: Partial<OnSaleGroup>): OnSaleGroup {
  return {
    artistName: 'Some Artist',
    slug: 'some-artist',
    image_url: null,
    onsale_date: '2026-06-01T09:00:00.000Z',
    saleType: 'onsale',
    events: [],
    dbArtist: null,
    ...overrides,
  }
}

describe('extractSeriesKey', () => {
  test('strips a " v " opponent suffix from a sports-fixture title', () => {
    assert.equal(extractSeriesKey('Manchester Storm v Cardiff Devils'), 'manchester-storm')
  })

  test('strips a " vs " / " versus " opponent suffix too', () => {
    assert.equal(extractSeriesKey('Manchester City vs Arsenal'), 'manchester-city')
    assert.equal(extractSeriesKey('Manchester City versus Arsenal'), 'manchester-city')
  })

  test('a plain concert title with no opponent falls back to the extracted artist name', () => {
    assert.equal(extractSeriesKey('Coldplay | Music of the Spheres'), 'coldplay')
  })
})

describe('capGroupsBySeries', () => {
  test('repeated sports fixtures from the same team are capped at the default of 2', () => {
    const groups = [
      onSaleGroup({ slug: 'manchester-storm-v-cardiff-devils', artistName: 'Manchester Storm v Cardiff Devils', onsale_date: '2026-06-01T09:00:00.000Z' }),
      onSaleGroup({ slug: 'manchester-storm-v-belfast-giants', artistName: 'Manchester Storm v Belfast Giants', onsale_date: '2026-06-02T09:00:00.000Z' }),
      onSaleGroup({ slug: 'manchester-storm-v-sheffield-steelers', artistName: 'Manchester Storm v Sheffield Steelers', onsale_date: '2026-06-03T09:00:00.000Z' }),
      onSaleGroup({ slug: 'manchester-storm-v-nottingham-panthers', artistName: 'Manchester Storm v Nottingham Panthers', onsale_date: '2026-06-04T09:00:00.000Z' }),
    ]
    const result = capGroupsBySeries(groups)
    assert.equal(result.length, 2)
    assert.deepEqual(result.map(g => g.slug), ['manchester-storm-v-cardiff-devils', 'manchester-storm-v-belfast-giants'])
  })

  test('keeps the earliest-sorted fixtures per series (deterministic, order-preserving)', () => {
    const groups = [
      onSaleGroup({ slug: 'a', artistName: 'Storm v X', onsale_date: '2026-06-01T09:00:00.000Z' }),
      onSaleGroup({ slug: 'b', artistName: 'Storm v Y', onsale_date: '2026-06-02T09:00:00.000Z' }),
      onSaleGroup({ slug: 'c', artistName: 'Storm v Z', onsale_date: '2026-06-03T09:00:00.000Z' }),
    ]
    const result = capGroupsBySeries(groups, 1)
    assert.deepEqual(result.map(g => g.slug), ['a'])
  })

  test('legitimately separate fixtures/artists below the cap are all kept', () => {
    const groups = [
      onSaleGroup({ slug: 'storm-v-x', artistName: 'Manchester Storm v Cardiff Devils' }),
      onSaleGroup({ slug: 'coldplay', artistName: 'Coldplay' }),
      onSaleGroup({ slug: 'oasis', artistName: 'Oasis' }),
    ]
    const result = capGroupsBySeries(groups)
    assert.equal(result.length, 3)
  })

  test('a healthy mix of categories is preserved — the cap only limits one series, never discriminates by category', () => {
    const groups = [
      onSaleGroup({ slug: 'storm-1', artistName: 'Manchester Storm v Cardiff Devils', events: [{ category: 'sports' } as never] }),
      onSaleGroup({ slug: 'storm-2', artistName: 'Manchester Storm v Belfast Giants', events: [{ category: 'sports' } as never] }),
      onSaleGroup({ slug: 'storm-3', artistName: 'Manchester Storm v Sheffield Steelers', events: [{ category: 'sports' } as never] }),
      onSaleGroup({ slug: 'theatre-1', artistName: 'Hamilton', events: [{ category: 'theatre' } as never] }),
      onSaleGroup({ slug: 'comedy-1', artistName: 'Peter Kay', events: [{ category: 'comedy' } as never] }),
      onSaleGroup({ slug: 'family-1', artistName: 'CBeebies Live', events: [{ category: 'family' } as never] }),
      onSaleGroup({ slug: 'concert-1', artistName: 'Coldplay', events: [{ category: 'concert' } as never] }),
    ]
    const result = capGroupsBySeries(groups)
    const categories = new Set(result.map(g => g.events[0].category))
    assert.equal(result.length, 6) // 3 Storm fixtures capped to 2, every other group kept
    assert.ok(categories.has('theatre'))
    assert.ok(categories.has('comedy'))
    assert.ok(categories.has('family'))
    assert.ok(categories.has('concert'))
    assert.ok(categories.has('sports')) // sport isn't excluded entirely, just capped
  })

  test('empty input — empty result, no throw', () => {
    assert.deepEqual(capGroupsBySeries([]), [])
  })

  // Birmingham city-page build-out (2 Oct 2026): capGroupsBySeries is the
  // same shared helper that already protects Manchester's On Sale This
  // Week from being dominated by one team's fixtures (Manchester Storm,
  // above) — this isn't Manchester-specific logic that needed porting,
  // it's generic series-key extraction (extractSeriesKey strips the
  // " v "/" vs " opponent suffix off ANY title). Birmingham City FC is
  // the same shape of risk for Birmingham's own page, so this pins that
  // the cap already applies there with no city-specific code at all.
  test('repeated Birmingham City FC fixtures are capped the same way Manchester Storm fixtures are', () => {
    const groups = [
      onSaleGroup({ slug: 'birmingham-city-v-coventry-city', artistName: 'Birmingham City v Coventry City', onsale_date: '2026-08-01T09:00:00.000Z' }),
      onSaleGroup({ slug: 'birmingham-city-v-stoke-city', artistName: 'Birmingham City v Stoke City', onsale_date: '2026-08-02T09:00:00.000Z' }),
      onSaleGroup({ slug: 'birmingham-city-v-west-brom', artistName: 'Birmingham City v West Brom', onsale_date: '2026-08-03T09:00:00.000Z' }),
      onSaleGroup({ slug: 'birmingham-city-v-preston', artistName: 'Birmingham City v Preston North End', onsale_date: '2026-08-04T09:00:00.000Z' }),
    ]
    const result = capGroupsBySeries(groups)
    assert.equal(result.length, 2)
    assert.deepEqual(result.map(g => g.slug), ['birmingham-city-v-coventry-city', 'birmingham-city-v-stoke-city'])
  })
})

describe('hasReliableOnSaleDate', () => {
  test('a genuine onsale_date is reliable', () => {
    assert.equal(hasReliableOnSaleDate({ onsale_date: '2026-06-01T09:00:00.000Z' } as never), true)
  })

  test('a missing onsale_date is never treated as reliable — never inferred from start_date or anything else', () => {
    assert.equal(hasReliableOnSaleDate({ onsale_date: null } as never), false)
  })
})

describe('ON_SALE_MAX_PER_SERIES', () => {
  test('is a small positive integer (sanity check on the exported, documented cap)', () => {
    assert.ok(ON_SALE_MAX_PER_SERIES >= 1 && ON_SALE_MAX_PER_SERIES <= 5)
  })
})
