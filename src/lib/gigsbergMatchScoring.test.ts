import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  normalize, dateOnly, tokenOverlap, bucketEventsByDate, decideMatch, hasTitleEvidence, londonMinutes, clockMinutes, showTimeGap,
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

describe('showtimes — two performances in a day', () => {
  // 3:30pm and 7:30pm before 25 Oct are BST, so the site stores 14:30Z and 18:30Z.
  const matinee = event({ id: 'ev-matinee', title: 'Russell Howard', start_date: '2026-10-24T14:30:00Z', venue: { name: 'Palladium', city: 'London' } })
  const evening = event({ id: 'ev-evening', title: 'Russell Howard', start_date: '2026-10-24T18:30:00Z', venue: { name: 'Palladium', city: 'London' } })
  const row = (id: number, time: string) => listing({
    id, name: 'Russell Howard', performer1: 'Russell Howard', event_date: '2026-10-24', event_time: time,
    venue: 'Palladium', city: 'London', url: `https://gigsberg.example/e/${id}`,
  })

  test('londonMinutes reads the UK clock, in BST and GMT', () => {
    assert.equal(londonMinutes('2026-10-24T14:30:00Z'), 15 * 60 + 30)
    assert.equal(londonMinutes('2026-10-25T15:30:00Z'), 15 * 60 + 30) // clocks went back on 25 Oct
    assert.equal(londonMinutes('2027-01-20T18:30:00Z'), 18 * 60 + 30)
    assert.equal(londonMinutes('2026-10-23T23:00:00Z'), null) // midnight in London (BST) = time not announced
  })

  test('clockMinutes / showTimeGap ignore missing and 00:00 times', () => {
    assert.equal(clockMinutes('19:30:00'), 19 * 60 + 30)
    assert.equal(clockMinutes('00:00:00'), null)
    assert.equal(clockMinutes(null), null)
    assert.equal(showTimeGap({ event_time: '15:30:00' }, matinee), 0)
    assert.equal(showTimeGap({ event_time: null }, matinee), null)
  })

  test('each listing picks the event at its own time, whichever order the events arrive in', () => {
    for (const events of [[matinee, evening], [evening, matinee]]) {
      assert.equal(decideMatch(row(1, '15:30:00'), events).event?.id, 'ev-matinee')
      assert.equal(decideMatch(row(2, '19:30:00'), events).event?.id, 'ev-evening')
    }
  })

  test('with only the evening event, the matinee listing does not take its link when the evening listing fits it', () => {
    const siblings = [row(1, '15:30:00'), row(2, '19:30:00')]
    const evening7 = decideMatch(row(2, '19:30:00'), [evening], siblings)
    assert.equal(evening7.status, 'auto_matched')
    const matinee3 = decideMatch(row(1, '15:30:00'), [evening], siblings)
    assert.equal(matinee3.status, 'review')
    assert.equal(matinee3.event, null)
    assert.match(matinee3.reason, /needs its own event/)
  })

  test('a lone listing with an odd (placeholder) time still matches its only event', () => {
    const d = decideMatch(row(1, '19:00:00'), [matinee])
    assert.equal(d.status, 'auto_matched')
    assert.equal(d.timeGap, 210)
  })

  test('venue named differently on each site ("The Alexandra" vs "New Alexandra Theatre"): the showtime still picks the right event', () => {
    const m = { ...matinee, venue: { name: 'The Alexandra', city: 'Birmingham' } }
    const e = { ...evening, venue: { name: 'The Alexandra', city: 'Birmingham' } }
    const gb = (id: number, time: string) => ({ ...row(id, time), venue: 'New Alexandra Theatre', city: 'Birmingham' })
    assert.equal(decideMatch(gb(1, '15:30:00'), [e, m]).event?.id, 'ev-matinee')
    assert.equal(decideMatch(gb(2, '19:30:00'), [m, e]).event?.id, 'ev-evening')
  })

  test('the same show listed twice by Ticketmaster (identical title, venue and time) links to one copy, always the same one', () => {
    // Changed 22 Oct 2026: these are the same performance, so leaving them in review only lost the Gigsberg
    // button (Deep Purple and Ocean Colour Scene at AO Arena were listed twice). The copy that already has
    // this listing's link wins, else a stable order, so re-runs never move the button.
    const a = { ...evening, venue: { name: 'The Alexandra', city: 'Birmingham' } }
    const twin = { ...a, id: 'ev-twin' }
    const gb = { ...row(2, '19:30:00'), venue: 'New Alexandra Theatre', city: 'Birmingham' }
    const first = decideMatch(gb, [a, twin])
    assert.equal(first.status, 'auto_matched')
    assert.equal(decideMatch(gb, [twin, a]).event?.id, first.event?.id)
    const linked = { ...twin, gigsberg_affiliate_url: gb.url }
    assert.equal(decideMatch(gb, [a, linked]).event?.id, 'ev-twin')
  })
})

import { fixtureTeams, fixtureMatch, sameTeam, cleanVenue, isMatchableEvent } from './gigsbergMatchScoring.ts'

describe('real cases from the review queue, 22 Oct 2026', () => {
  const hydro = { name: 'OVO Hydro', city: 'Glasgow' }
  test('football: QPR v Swansea City is Queens Park Rangers vs Swansea City', () => {
    assert.deepEqual(fixtureTeams('Queens Park Rangers vs Swansea City'), ['queens park rangers', 'swansea city'])
    assert.equal(fixtureMatch('Queens Park Rangers vs Swansea City', 'QPR v Swansea City'), true)
    const d = decideMatch(
      listing({ name: 'Queens Park Rangers vs Swansea City', performer1: 'Queens Park Rangers', venue: 'Loftus Road', city: 'London', event_date: '2026-10-24', event_time: '15:00:00' }),
      [event({ id: 'qpr', title: 'QPR v Swansea City', start_date: '2026-10-24T14:00:00Z', venue: { name: 'Loftus Road Stadium', city: 'London' } })],
    )
    assert.equal(d.status, 'auto_matched')
    assert.equal(d.event?.id, 'qpr')
  })
  test('football: a different fixture, a women\'s game or a screening is never a candidate', () => {
    assert.equal(fixtureMatch('AFC Bournemouth vs Aston Villa', 'Blackpool FC V Aston Villa U21'), false)
    assert.equal(fixtureMatch('Crystal Palace vs Newcastle United', 'Crystal Palace V Chelsea Women'), false)
    assert.equal(fixtureMatch('Sunderland vs Leeds United', 'Sunderland V Leeds: Live Premier League Screening'), false)
    assert.equal(fixtureMatch('Coventry City vs Sunderland', 'Sunderland - The Point - Indiepalooza'), false)
    assert.equal(sameTeam('manchester', 'manchester united'), false)
    assert.equal(sameTeam('swansea', 'swansea city'), true)
    assert.equal(fixtureMatch('Paul Heaton', 'Paul Heaton'), null)
    const d = decideMatch(
      listing({ name: 'Coventry City vs Sunderland', performer1: 'Sunderland', venue: 'Building Society Arena', city: 'Coventry', event_date: '2026-10-31' }),
      [event({ title: 'Sunderland - The Point - Indiepalooza', start_date: '2026-10-31T18:00:00Z', venue: { name: 'The Point', city: 'Sunderland' } })],
    )
    assert.equal(d.status, 'no_match')
  })
  test('the main show wins over its Venue Premium / Share a Suite listing', () => {
    assert.equal(isMatchableEvent({ name: 'Kevin Bridges' }, { title: 'Venue Premium - Kevin Bridges:  Here If You Need Me' }), false)
    assert.equal(isMatchableEvent({ name: 'Kevin Bridges' }, { title: 'Share a Suite - Kevin Bridges' }), false)
    const main = event({ id: 'main', title: 'Kevin Bridges:  Here If You Need Me', start_date: '2026-10-27T17:30:00Z', venue: hydro })
    const premium = event({ id: 'premium', title: 'Venue Premium - Kevin Bridges:  Here If You Need Me', start_date: '2026-10-27T17:30:00Z', venue: hydro })
    const d = decideMatch(listing({ name: 'Kevin Bridges', performer1: 'Kevin Bridges', venue: 'OVO Hydro (formerly The SSE Hydro)', city: 'Glasgow', event_date: '2026-10-27', event_time: '18:30:00' }), [premium, main])
    assert.equal(d.status, 'auto_matched')
    assert.equal(d.event?.id, 'main')
  })
  test('venue names: old names in brackets and "Stadium" do not stop a match', () => {
    assert.equal(cleanVenue('OVO Hydro (formerly The SSE Hydro)'), 'ovo hydro')
    assert.equal(cleanVenue('Loftus Road Stadium'), cleanVenue('Loftus Road'))
  })
  test('two shows a day: each listing goes to the event with the closer showtime', () => {
    const am = event({ id: 'am', title: 'Gladiators Live Tour 2026', start_date: '2026-10-24T09:00:00Z', venue: hydro })
    const pm = event({ id: 'pm', title: 'Gladiators Live Tour 2026', start_date: '2026-10-24T15:00:00Z', venue: hydro })
    const base = { name: 'Gladiators Live', performer1: 'Gladiators Live', venue: 'OVO Hydro (formerly The SSE Hydro)', city: 'Glasgow', event_date: '2026-10-24' }
    const early = decideMatch(listing({ ...base, id: 1, event_time: '11:30:00' }), [pm, am])
    const late = decideMatch(listing({ ...base, id: 2, event_time: '17:30:00' }), [am, pm])
    assert.equal(early.event?.id, 'am')
    assert.equal(late.event?.id, 'pm')
  })
  test('a review keeps the suggested event so it can be confirmed in one click', () => {
    const d = decideMatch(listing({ name: 'The Darkness Live', performer1: null, city: 'Leeds' }), [event({ id: 's', title: 'Darkness Live Tour', venue: { name: 'Elsewhere', city: 'York' } })])
    if (d.status === 'review') assert.equal(d.suggestion?.id, 's')
  })
})
