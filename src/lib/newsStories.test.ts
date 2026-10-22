import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  type StoryEventRow,
  estimatedCapacity,
  buildStoryDrafts,
  baseArtistSlug,
  storySlug,
  hookTemplate,
  templateHeadline,
  standfirstFor,
  mergeFacts,
  largeImageCandidate,
  orderStories,
  clockLabel,
} from './newsStories.ts'
import { validateHook, hookProblem, parseHookResponse } from './newsHooks.ts'

const NOW = Date.parse('2026-10-22T08:00:00Z')

function row(over: Partial<StoryEventRow> = {}): StoryEventRow {
  return {
    event_id: 'e1', event_slug: 'sam-fender-glasgow', title: 'Sam Fender', category: 'concert',
    start_date: '2027-06-05T18:00:00Z', created_at: '2026-10-21T09:00:00Z',
    public_onsale_start: '2026-10-30T09:30:00Z', presale_start: null, presale_name: null,
    image_url: null, venue_name: 'Hampden Park', venue_city: 'Glasgow', venue_capacity: 52000,
    artist_id: 'a1', artist_name: 'Sam Fender', artist_slug: 'sam-fender-K8vZ9171ob7',
    artist_image_url: 'https://s1.ticketm.net/dam/a/0d9/x_TABLET_LANDSCAPE_16_9.jpg',
    artist_created_at: '2026-10-21T09:00:00Z', artist_wikipedia_url: 'https://en.wikipedia.org/wiki/Sam_Fender',
    ...over,
  }
}

const tour = [
  row(),
  row({ event_id: 'e2', start_date: '2027-06-12T18:00:00Z', venue_name: 'Wembley Stadium', venue_city: 'London', venue_capacity: 90000 }),
  row({ event_id: 'e3', start_date: '2027-06-13T18:00:00Z', venue_name: 'Wembley Stadium', venue_city: 'London', venue_capacity: 90000 }),
  // duplicate listing (venue premium variant) on the same day in the same city
  row({ event_id: 'e3b', title: 'Sam Fender - Venue Premium Tickets', start_date: '2027-06-13T18:00:00Z', venue_name: 'Wembley Stadium', venue_city: 'London', venue_capacity: 90000 }),
]

describe('news stories: what counts as just announced', () => {
  test('a new stadium tour with tickets not yet on sale becomes a headline story', () => {
    const [d] = buildStoryDrafts(tour, NOW)
    assert.equal(d.facts.dateCount, 3)
    assert.deepEqual(d.facts.cities, ['Glasgow', 'London'])
    assert.equal(d.facts.scale, 'stadium')
    assert.equal(d.storyType, 'tour_announcement')
    assert.ok(d.isHeadline)
    assert.equal(d.slug, 'sam-fender-uk-tour-dates-announced-oct-2026')
    assert.equal(d.hookTemplate, 'Sam Fender announces UK stadium tour: tickets on sale Fri 30 Oct')
  })

  test('a tour whose tickets have been on sale for months is not "just announced"', () => {
    const old = tour.map(r => ({ ...r, public_onsale_start: '2026-06-01T09:00:00Z' }))
    assert.equal(buildStoryDrafts(old, NOW).length, 0)
  })

  test('a sale that opened yesterday still counts; a presale in the future counts too', () => {
    const yday = tour.map(r => ({ ...r, public_onsale_start: '2026-10-21T09:00:00Z' }))
    assert.equal(buildStoryDrafts(yday, NOW).length, 1)
    const [y] = buildStoryDrafts(yday, NOW)
    assert.equal(y.hookTemplate, 'Sam Fender announces UK stadium tour: tickets on sale now')
    assert.match(y.standfirst, /General sale opened Wednesday 21 October at 10am\.$/)
    // a presale that already happened is not advertised as opening
    const past = tour.map(r => ({ ...r, presale_start: '2026-10-21T09:00:00Z' }))
    assert.equal(buildStoryDrafts(past, NOW)[0].facts.presaleAt, null)
    const pre = tour.map(r => ({ ...r, public_onsale_start: '2026-06-01T09:00:00Z', presale_start: '2026-10-28T09:00:00Z', presale_name: 'Artist presale' }))
    const [d] = buildStoryDrafts(pre, NOW)
    assert.equal(d.facts.presaleAt, '2026-10-28T09:00:00Z')
    assert.match(d.hookTemplate, /presale opens Wed 28 Oct$/)
  })

  test('shows listed more than a week ago, sport, local listings and add-ons are left out', () => {
    assert.equal(buildStoryDrafts(tour.map(r => ({ ...r, created_at: '2026-10-01T09:00:00Z' })), NOW).length, 0)
    assert.equal(buildStoryDrafts(tour.map(r => ({ ...r, category: 'sports' })), NOW).length, 0)
    assert.equal(buildStoryDrafts(tour.map(r => ({ ...r, category: 'local' })), NOW).length, 0)
    assert.equal(buildStoryDrafts([row({ title: 'Hospitality Package', venue_capacity: 52000 })], NOW).length, 0)
    assert.equal(buildStoryDrafts([row({ artist_name: 'Share a Suite', title: 'Share a Suite' })], NOW).length, 0)
    assert.equal(buildStoryDrafts([row({ artist_name: 'American Express Presents BST Hyde Park' })], NOW).length, 0)
  })

  test('one small-venue date is not a story; one big show is', () => {
    assert.equal(buildStoryDrafts([row({ venue_capacity: 900, venue_name: 'King Tuts' })], NOW).length, 0)
    const [d] = buildStoryDrafts([row()], NOW)
    assert.equal(d.hookTemplate, 'Sam Fender announces Glasgow show at Hampden Park: tickets on sale Fri 30 Oct')
    assert.match(d.standfirst, /on Saturday 5 June 2027\./)
  })

  test('an artist we already list gets an "adds dates" story', () => {
    const [d] = buildStoryDrafts(tour.map(r => ({ ...r, artist_created_at: '2025-01-01T00:00:00Z', venue_capacity: 3000 })), NOW)
    assert.equal(d.storyType, 'new_dates')
    assert.equal(d.hookTemplate, 'Sam Fender adds 3 new UK dates: tickets on sale Fri 30 Oct')
  })

  test('re-running keeps every date the story has listed', () => {
    const [a] = buildStoryDrafts(tour.slice(0, 2), NOW)
    const [b] = buildStoryDrafts([tour[2]], NOW)
    const merged = mergeFacts(a.facts, b.facts, NOW)
    assert.equal(merged.dateCount, 3)
    assert.equal(merged.storyType, 'tour_announcement')
  })
})

describe('news stories: wording', () => {
  test('slugs drop the Ticketmaster id', () => {
    assert.equal(baseArtistSlug('oasis-Z9171fw7'), 'oasis')
    assert.equal(baseArtistSlug('blink-182'), 'blink-182')
    assert.equal(storySlug('Texas', 'new_dates', NOW), 'texas-new-uk-dates-announced-oct-2026')
    assert.equal(storySlug('Choir! Choir! Choir!', 'tour_announcement', NOW), 'choir-choir-choir-uk-tour-dates-announced-oct-2026')
    assert.equal(storySlug('Beyoncé & Jay-Z', 'tour_announcement', NOW), 'beyonce-and-jay-z-uk-tour-dates-announced-oct-2026')
  })

  test('titles, standfirst and times', () => {
    const [d] = buildStoryDrafts(tour, NOW)
    assert.equal(templateHeadline(d.facts), 'Sam Fender UK tour 2027: dates, venues and how to get tickets')
    assert.equal(
      standfirstFor(d.facts),
      'Sam Fender has announced 3 UK dates across 2 cities in June 2027, including Wembley Stadium and Hampden Park. General sale starts Friday 30 October at 9:30am.',
    )
    assert.equal(clockLabel('2026-10-30T10:00:00Z'), '10am')
    assert.equal(hookTemplate({ ...d.facts, onsaleAt: null, presaleAt: null }), 'Sam Fender announces UK stadium tour')
  })

  test('big rooms without a capacity are recognised by name', () => {
    assert.equal(estimatedCapacity('Wembley Stadium'), 40000)
    assert.equal(estimatedCapacity('The O2'), 10000)
    assert.equal(estimatedCapacity('O2 Academy Glasgow'), null)
    assert.equal(estimatedCapacity('Utilita Arena Cardiff'), 10000)
  })

  test('large Ticketmaster image variant', () => {
    assert.equal(
      largeImageCandidate('https://s1.ticketm.net/dam/a/0d9/x_TABLET_LANDSCAPE_16_9.jpg'),
      'https://s1.ticketm.net/dam/a/0d9/x_TABLET_LANDSCAPE_LARGE_16_9.jpg',
    )
    assert.equal(largeImageCandidate('https://example.com/x.jpg'), null)
  })

  test('homepage order: newest run first, biggest first within a run', () => {
    const s = orderStories([
      { id: 'small-new', published_at: '2026-10-22T05:01:00Z', score: 20 },
      { id: 'old-big', published_at: '2026-10-21T17:01:00Z', score: 99 },
      { id: 'big-new', published_at: '2026-10-22T05:02:00Z', score: 90 },
    ])
    assert.deepEqual(s.map(x => x.id), ['big-new', 'small-new', 'old-big'])
  })
})

describe('news hooks: never say what the listings do not support', () => {
  const [d] = buildStoryDrafts(tour, NOW)
  const f = d.facts

  test('a factual, punchy hook passes', () => {
    const r = validateHook({ headline: 'Sam Fender goes stadium-sized: Wembley and Hampden dates, tickets Fri 30 Oct', standfirst: 'Sam Fender will play 3 UK stadium dates in June 2027. General sale opens Friday 30 October at 9:30am.' }, f)
    assert.equal(r.problem, null)
    assert.ok(r.hook?.standfirst)
  })

  test('invented claims, numbers, days, months and cities are rejected', () => {
    assert.match(hookProblem('Sam Fender announces farewell stadium tour', f, { requireName: true })!, /unverifiable/)
    assert.match(hookProblem('Sam Fender announces 7 stadium dates', f, { requireName: true })!, /number/)
    assert.match(hookProblem('Sam Fender tickets on sale Monday', f, { requireName: true })!, /weekday/)
    assert.match(hookProblem('Sam Fender tour dates for August', f, { requireName: true })!, /month/)
    assert.match(hookProblem('Sam Fender adds Manchester show', f, { requireName: true })!, /city/)
    assert.match(hookProblem('Sam Fender tickets on sale tomorrow', f, { requireName: true })!, /unverifiable/)
    assert.match(hookProblem('Sam Fender presale tour dates', f, { requireName: true })!, /presale/)
    assert.match(hookProblem('Big stadium tour dates announced', f, { requireName: true })!, /artist name/)
  })

  test('stadium wording needs a stadium date', () => {
    const small = { ...f, hasStadiumDate: false, scale: null, dates: f.dates.map(x => ({ ...x, venue: 'Barrowland', capacity: 1900 })) }
    assert.match(hookProblem('Sam Fender announces stadium tour', small, { requireName: true })!, /stadium/)
  })

  test('a bad standfirst is dropped but a good headline is kept', () => {
    const r = validateHook({ headline: 'Sam Fender announces UK stadium tour for June 2027', standfirst: 'His biggest shows yet.' }, f)
    assert.equal(r.hook?.standfirst, null)
  })

  test('parses JSON wrapped in other text', () => {
    assert.deepEqual(parseHookResponse('Here you go: {"headline":"x","standfirst":"y"}'), { headline: 'x', standfirst: 'y' })
    assert.equal(parseHookResponse('nope'), null)
  })
})
