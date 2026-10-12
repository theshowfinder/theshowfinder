import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  normalize, dateOnly, tokenOverlap, bucketEventsByDate, decideMatch, hasTitleEvidence,
  type CatalogueRow, type ShowfinderEvent,
} from './gigsbergMatchScoring.ts'

function listing(overrides: Partial<CatalogueRow> = {}): CatalogueRow {
  return {
    id: 1, name: 'The Darkness', event_date: '2027-03-10', venue: 'O2 Academy Leeds', city: 'Leeds',
    performer1: 'The Darkness', performer2: null, url: 'https://gigsberg.example/e/1', matched_event_id: null,
    ...overrides,
  }
}

function event(overrides: Partial<ShowfinderEvent> = {}): ShowfinderEvent {
  return {
    id: 'ev-1', title: 'The Darkness', start_date: '2027-03-10T19:30:00Z', gigsberg_affiliate_url: null,
    venue: { name: 'O2 Academy Leeds', city: 'Leeds' }, artists: [],
    ...overrides,
  }
}

describe('normalize / tokenOverlap / dateOnly', () => {
  test('normalize strips case, accents and punctuation', () => {
    assert.equal(normalize('  Beyoncé — LIVE!! '), 'beyonce live')
    assert.equal(normalize(null), '')
  })

  test('tokenOverlap is the share of tokens in common and ignores tokens of 2 letters or fewer', () => {
    assert.equal(tokenOverlap('Arctic Monkeys', 'Arctic Monkeys'), 1)
    assert.equal(tokenOverlap('Arctic Monkeys', 'Arctic Tour'), 0.5)
    assert.equal(tokenOverlap('', 'Arctic Monkeys'), 0)
  })

  test('dateOnly converts a late-night UTC timestamp to the UK calendar date (BST)', () => {
    assert.equal(dateOnly('2026-06-30T23:30:00Z'), '2026-07-01')
    assert.equal(dateOnly('2027-03-10T19:30:00Z'), '2027-03-10')
  })

  test('dateOnly passes a plain date through untouched', () => {
    assert.equal(dateOnly('2027-03-10'), '2027-03-10')
  })
})

describe('bucketEventsByDate', () => {
  test('groups events by UK date so matching only compares events on the same day', () => {
    const buckets = bucketEventsByDate([
      event({ id: 'a', start_date: '2027-03-10T19:30:00Z' }),
      event({ id: 'b', start_date: '2027-03-10T20:00:00Z' }),
      event({ id: 'c', start_date: '2027-03-11T19:30:00Z' }),
    ])
    assert.deepEqual(buckets.get('2027-03-10')?.map(e => e.id), ['a', 'b'])
    assert.deepEqual(buckets.get('2027-03-11')?.map(e => e.id), ['c'])
  })
})

describe('decideMatch — confident auto-match', () => {
  test('same artist, date, city and venue is auto-matched and links that event', () => {
    const d = decideMatch(listing(), [event()])
    assert.equal(d.status, 'auto_matched')
    assert.equal(d.event?.id, 'ev-1')
    assert.match(d.reason, /title confirmed/)
  })

  test('a venue named slightly differently still matches when the tokens overlap enough', () => {
    const d = decideMatch(listing({ venue: 'Leeds O2 Academy' }), [event()])
    assert.equal(d.status, 'auto_matched')
  })

  test('the artist is picked up from the event name when the performer fields are empty', () => {
    const d = decideMatch(listing({ performer1: null, name: 'The Darkness' }), [event()])
    assert.equal(d.status, 'auto_matched')
  })
})

describe('decideMatch — never links the wrong event', () => {
  test('a different artist on the same day in the same city is not a match', () => {
    const d = decideMatch(listing(), [event({ id: 'ev-2', title: 'Amon Amarth' })])
    assert.equal(d.status, 'no_match')
    assert.equal(d.event, null)
  })

  test('a stale linked artist alone cannot manufacture a match against a different headliner title', () => {
    const d = decideMatch(listing(), [event({ id: 'ev-2', title: 'Amon Amarth', artists: [{ artist: { name: 'The Darkness' } }] })])
    assert.equal(d.status, 'no_match')
  })

  test('no events at all is a no_match with an explanatory reason', () => {
    const d = decideMatch(listing(), [])
    assert.equal(d.status, 'no_match')
    assert.equal(d.confidence, null)
    assert.equal(d.reason, 'No close Showfinder event found')
  })

  test('existing rule, kept as-is: an exact artist title on the same date auto-matches even when the venue label differs', () => {
    // The original matcher treats artist title + date as enough evidence when
    // the city or venue label differs (feeds often use different place names).
    // Locked in here so any change to that leniency is a deliberate decision.
    const d = decideMatch(listing(), [event({ venue: { name: 'O2 Academy Brixton', city: 'London' } })])
    assert.equal(d.status, 'auto_matched')
  })

  test('only a partly matching title on a different city and venue goes to manual review, never auto-matched', () => {
    const d = decideMatch(
      listing({ performer1: 'Robbie Williams Live', name: 'Robbie Williams Live' }),
      [event({ title: 'Robbie Williams Tour', venue: { name: 'The Hydro', city: 'Glasgow' } })],
    )
    assert.equal(d.status, 'review')
    assert.equal(d.event, null)
  })
})

describe('decideMatch — one auto-match event per catalogue row', () => {
  test('the better venue match wins when two same-artist events share a day and city', () => {
    const right = event({ id: 'right' })
    const other = event({ id: 'other', venue: { name: 'Leeds Town Hall', city: 'Leeds' } })
    const d = decideMatch(listing(), [other, right])
    assert.equal(d.event?.id, 'right')
  })
})

describe('matching only considers the same date (bucketed candidates)', () => {
  test('an event on a different date is not in the bucket, so the listing stays unmatched', () => {
    const buckets = bucketEventsByDate([event({ start_date: '2027-03-11T19:30:00Z' })])
    const d = decideMatch(listing(), buckets.get(dateOnly('2027-03-10')) ?? [])
    assert.equal(d.status, 'no_match')
  })

  test('a late-night UTC start still lands on the right UK date', () => {
    const buckets = bucketEventsByDate([event({ start_date: '2026-06-30T23:30:00Z' })])
    const d = decideMatch(listing({ event_date: '2026-07-01' }), buckets.get('2026-07-01') ?? [])
    assert.equal(d.status, 'auto_matched')
  })
})

describe('hasTitleEvidence — decides which events need their linked artists loaded', () => {
  test('true when the performer is in the event title', () => {
    assert.equal(hasTitleEvidence(listing(), event()), true)
  })

  test('false for an unrelated headliner, even if a stale artist link would have matched', () => {
    const stale = event({ title: 'Amon Amarth', artists: [{ artist: { name: 'The Darkness' } }] })
    assert.equal(hasTitleEvidence(listing(), stale), false)
  })

  test('true for a genuinely overlapping title that is not an exact containment', () => {
    assert.equal(hasTitleEvidence(listing({ performer1: 'Robbie Williams Live', name: 'Robbie Williams Live' }), event({ title: 'Robbie Williams Tour' })), true)
  })
})
