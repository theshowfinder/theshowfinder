import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { venueBuildingName, sameBuilding, sameShow, pickKeeper, findDuplicateGroups, findExtraHomes, isSameShow, titlesFullyMatch, type GroupEvent } from './venueFamily.ts'

const academy  = { id: 'v1', name: 'O2 Academy Birmingham',  city: 'Birmingham', postcode: 'B1 1DB' }
const academy2 = { id: 'v2', name: 'O2 Academy2 Birmingham', city: 'Birmingham', postcode: 'B1 1DB' }
const leeds    = { id: 'v3', name: 'O2 Academy Leeds',       city: 'Leeds',      postcode: 'LS1 3DT' }
const musicHall = { id: 'v4', name: 'Music Hall', city: 'Aberdeen', postcode: 'AB10 1QS' }
const aberdeenMusicHall = { id: 'v5', name: 'Aberdeen Music Hall', city: 'Aberdeen', postcode: 'AB10 1QS' }

function ev(p: Partial<GroupEvent> & { id: string; venue: GroupEvent['venue'] }): GroupEvent {
  return {
    title: 'Airbag', start_date: '2026-10-23T18:00:00+00:00', created_at: '2026-10-01T00:00:00Z', source: null,
    ticketmaster_id: 'x', tickets_url: null, details: null, artists: [], venue_id: p.venue.id!, ...p,
  }
}

// Airbag, 23 Oct 2026: Ticketmaster's full listing in O2 Academy2, its bare TicketWeb copy in O2 Academy.
const airbagFull = ev({ id: 'full', venue: academy2, ticketmaster_id: 'G5dzZ_amM-xPa', tickets_url: 'https://www.ticketmaster.co.uk/airbag-birmingham/event/1', details: { promoter: 'AMG', seatmapUrl: 'x', support: ['Lesoir'] } })
const airbagBare = ev({ id: 'bare', venue: academy, ticketmaster_id: '1AdFZ_aGkmb4vF6', tickets_url: 'https://www.ticketweb.uk/event/airbag', created_at: '2026-09-01T00:00:00Z' })

describe('venue families', () => {
  test('rooms of one building share a building name', () => {
    assert.equal(venueBuildingName('O2 Academy2 Birmingham', 'Birmingham'), venueBuildingName('O2 Academy Birmingham', 'Birmingham'))
    assert.equal(sameBuilding(academy, academy2), 'name')
  })
  test('the same chain in another town is another building', () => {
    assert.equal(sameBuilding(academy, leeds), null)
  })
})

describe('duplicate groups', () => {
  test('Airbag in O2 Academy and O2 Academy2 at 19:00 is one show; the full Ticketmaster listing is kept', () => {
    assert.equal(sameShow(airbagFull, airbagBare), 'strong')
    assert.equal(pickKeeper([airbagBare, airbagFull]).id, 'full')
    const groups = findDuplicateGroups([airbagBare, airbagFull], () => false)
    assert.equal(groups.length, 1)
    assert.equal(groups[0].confident, true)
    assert.equal(groups[0].keep.id, 'full')
    assert.deepEqual(groups[0].duplicates.map(d => d.id), ['bare'])
  })
  test('two different acts in Academy 1 and Academy 2 on the same night are two shows', () => {
    const other = ev({ id: 'other', venue: academy, title: 'The Lathums', ticketmaster_id: 'y' })
    assert.equal(findDuplicateGroups([airbagFull, other], () => false).length, 0)
  })
  test('a council copy at the same venue record with a shorter title is merged', () => {
    const tm = ev({ id: 'tm', venue: academy2, title: 'Placebo - 30th Anniversary Tour', tickets_url: 'https://www.ticketmaster.co.uk/x', details: { promoter: 'p' } })
    const council = ev({ id: 'c', venue: academy2, title: 'Placebo', source: 'cardiff_council', ticketmaster_id: null, start_date: '2026-10-23T23:00:00+00:00' })
    const [g] = findDuplicateGroups([tm, { ...council, start_date: '2026-10-22T23:00:00+00:00' }], s => s === 'cardiff_council')
    assert.equal(g?.keep.id, 'tm')
    assert.equal(g?.confident, true)
  })
  test('the same act in two towns on one day is not merged', () => {
    const leedsShow = ev({ id: 'leeds', venue: leeds, ticketmaster_id: 'z' })
    assert.equal(findDuplicateGroups([airbagFull, leedsShow], () => false).length, 0)
  })
  test('a council copy with the same act and time merges into the Ticketmaster listing', () => {
    const tm = ev({ id: 'tm', venue: aberdeenMusicHall, title: 'Hue and Cry', tickets_url: 'https://www.ticketmaster.co.uk/x', details: { promoter: 'p' } })
    const council = ev({ id: 'c', venue: musicHall, title: 'Hue & Cry - Music Hall', source: 'aberdeen_council', ticketmaster_id: null })
    const [g] = findDuplicateGroups([tm, council], s => s === 'aberdeen_council')
    assert.equal(g.confident, true)
    assert.equal(g.keep.id, 'tm')
  })
  test('a council copy more than 15 minutes off goes to review, not the merge', () => {
    const tm = ev({ id: 'tm', venue: aberdeenMusicHall, title: 'Hue and Cry', start_date: '2026-10-23T18:00:00+00:00' })
    const council = ev({ id: 'c', venue: musicHall, title: 'Hue and Cry', source: 'aberdeen_council', ticketmaster_id: null, start_date: '2026-10-23T18:25:00+00:00' })
    const [g] = findDuplicateGroups([tm, council], s => s === 'aberdeen_council')
    assert.equal(g.confident, false)
  })
  test('title match: leading words count, a different act does not', () => {
    assert.equal(titlesFullyMatch('Boyzlife Featuring Keith Duffy & Brian McFadden', 'Boyzlife - Music Hall'), true)
    assert.equal(titlesFullyMatch('Christmas Concert', 'Hue and Cry'), false)
  })
})

describe('extras', () => {
  const park = { id: 'dp', name: 'Donington Park', city: 'Derby', postcode: 'DE74 2RP' }
  test('festival extras fold into the festival, a hotel bundle into its show', () => {
    const festival = ev({ id: 'fest', venue: park, title: 'Download 2027 - Weekend Arena', start_date: '2027-06-10T10:00:00Z' })
    const candy = ev({ id: 'x1', venue: park, title: 'Download 2027 - Charge Candy', start_date: '2027-06-09T19:00:00Z' })
    const madness = ev({ id: 'mad', venue: academy, title: 'Madness', start_date: '2027-07-02T16:00:00Z' })
    const bundle = ev({ id: 'x2', venue: academy, title: 'Madness - Official Ticket and Hotel Bundle', start_date: '2027-07-02T16:01:00Z' })
    const homes = findExtraHomes([candy, bundle], [festival, madness])
    assert.equal(homes.find(h => h.extra.id === 'x1')?.main?.id, 'fest')
    assert.equal(homes.find(h => h.extra.id === 'x2')?.main?.id, 'mad')
  })
  test('an extra with no main show nearby is left for a person', () => {
    const lonely = ev({ id: 'x3', venue: park, title: 'Creamfields 2027 - Non Camping Parking', start_date: '2027-08-27T19:00:00Z' })
    assert.equal(findExtraHomes([lonely], [])[0].main, null)
  })
})

describe('festival ticket types', () => {
  const field = { id: 'cf', name: 'Daresbury', city: 'Warrington', postcode: 'WA4 4AB' }
  test('entry tickets are shows, tents and parking are extras that fold into an entry ticket', async () => {
    const { isExtraTitle } = await import('./eventTitles.ts')
    assert.equal(isExtraTitle('Creamfields 2027 - 3 Day Camping - Standard'), false)
    assert.equal(isExtraTitle('Reading Festival 2027 - Weekend Non-Camping'), false)
    assert.equal(isExtraTitle('Creamfields 2027 - Non Camping Parking'), true)
    assert.equal(isExtraTitle('Download 2027 - RIP Luxury Yurt for 2 in Metal Meadow 2'), true)
    assert.equal(isExtraTitle('Reading Festival 2027 - Event Lineup T-Shirt'), true)
    assert.equal(isExtraTitle('Caravan Palace'), false)
    assert.equal(isExtraTitle('Souvenir - a Tribute to Orchestral Manoeuvres in the Dark'), false)
    assert.equal(isExtraTitle('The Caravan, Camping and Motorhome Show 2027'), false)
    assert.equal(isExtraTitle('Madness- Official Ticket and Hotel Bundls'), true)
    assert.equal(isExtraTitle('Kehlani VIP Upgrades (UPGRADE ONLY NO TICKET INCLUDED)'), true)
    const fri = ev({ id: 'fri', venue: field, title: 'Creamfields 2027 - Friday - Standard', start_date: '2027-08-27T12:00:00Z' })
    const parking = ev({ id: 'park', venue: field, title: 'Creamfields 2027 - Non Camping Parking', start_date: '2027-08-26T19:00:00Z' })
    assert.equal(findExtraHomes([parking], [fri])[0].main?.id, 'fri')
  })
})

describe('the one same-show rule (isSameShow)', () => {
  const guildhall = { id: 'g', name: 'O2 Guildhall Southampton', city: 'Southampton', postcode: 'SO14 7LP' }
  const townOnly = { id: 't', name: 'Southampton', city: 'Southampton', postcode: null }
  const at = (id: string, title: string, start: string, venue: typeof guildhall | typeof townOnly, artists: { id: string; name: string }[] = []) => ({ id, title, start_date: start, venue, artists })
  test('a council listing with no time and only the town is the Ticketmaster show that night', () => {
    const tm = at('tm', 'Massive Wagons + Terrorvision', '2027-01-28T19:00:00Z', guildhall)
    const council = at('c', 'Massive Wagons & Terrorvision', '2027-01-28T00:00:00Z', townOnly)
    assert.equal(isSameShow(council, tm), 'strong')
  })
  test('the act named with extra words ("Take That Live") is the same show when the act is linked', () => {
    const tm = at('tm', 'Take That', '2027-01-28T19:00:00Z', guildhall, [{ id: 'a', name: 'Take That' }])
    assert.equal(isSameShow(at('c', 'Take That Live', '2027-01-28T19:15:00Z', guildhall), tm), 'strong')
  })
  test('a tribute night is not the act', () => {
    const tm = at('tm', 'Take That', '2027-01-28T19:00:00Z', guildhall)
    assert.equal(isSameShow(at('c', 'Take That Tribute Night', '2027-01-28T19:00:00Z', guildhall), tm), null)
  })
  test('two festivals with a shared word are not the same', () => {
    assert.equal(isSameShow(at('a', 'Derby Beer Festival', '2027-01-28T12:00:00Z', guildhall), at('b', 'Derby Gin Festival', '2027-01-28T12:00:00Z', guildhall)), null)
  })
  test('early and late shows are two shows', () => {
    const early = at('e', 'Mica Paris', '2027-01-28T17:00:00Z', guildhall)
    const late = at('l', 'Mica Paris', '2027-01-28T19:45:00Z', guildhall)
    assert.equal(isSameShow(early, late), null)
  })
  test('door time vs stage time (45 minutes) is the same show', () => {
    assert.equal(isSameShow(at('a', 'Lucia & The Best Boys', '2027-01-28T19:30:00Z', guildhall), at('b', 'Lucia & the Best Boys', '2027-01-28T20:15:00Z', guildhall)), 'strong')
  })
})

// Glasgow, Nov 2026: the council feed lists "Scarlet Rebels" at "The Garage" with no time; Ticketmaster at "G2".
describe('council copy at a differently named venue in the same town', () => {
  const garage = { id: 'g1', name: 'The Garage', city: 'Glasgow', postcode: null }
  const g2 = { id: 'g2', name: 'G2', city: 'Glasgow', postcode: null }
  const tm = ev({ id: 'tm', title: 'Scarlet Rebels', venue: g2, start_date: '2027-02-15T19:00:00+00:00', tickets_url: 'https://www.ticketmaster.co.uk/x/event/1' })
  const council = ev({ id: 'gc', title: 'Scarlet Rebels', venue: garage, start_date: '2027-02-15T00:00:00+00:00', source: 'glasgow_council', ticketmaster_id: null })
  const isLocal = (s: string | null) => s === 'glasgow_council'
  test('merged into the Ticketmaster listing', () => {
    const [g] = findDuplicateGroups([tm, council], isLocal)
    assert.ok(g)
    assert.equal(g.keep.id, 'tm')
    assert.equal(g.confident, true, g.reasons.join('; '))
  })
  test('not when the titles differ', () => {
    const other = ev({ ...council, id: 'gc2', title: 'Scarlet Rebels Tribute Night' })
    assert.equal(findDuplicateGroups([tm, other], isLocal).filter(x => x.confident).length, 0)
  })
  test('not between two seller listings in different venues', () => {
    const tm2 = ev({ ...tm, id: 'tm2', venue: garage })
    assert.equal(findDuplicateGroups([tm, tm2], isLocal).length, 0)
  })
})

describe('Ticketmaster ticket types and tour-name variants at one venue', () => {
  const tmEv = (id: string, title: string, start = '2026-12-19T15:00:00+00:00') => ev({ id, title, venue: academy, start_date: start, tickets_url: `https://www.ticketmaster.co.uk/x/event/${id}` })
  test('"Day Fever" and "Day Fever - Birmingham" are one show, the plain title kept', () => {
    const [g] = findDuplicateGroups([tmEv('a', 'Day Fever - Birmingham'), tmEv('b', 'Day Fever')], () => false)
    assert.ok(g); assert.equal(g.confident, true, g.reasons.join('; ')); assert.equal(g.keep.title, 'Day Fever')
  })
  test('festival ticket types fold into one listing', () => {
    const gs = findDuplicateGroups([tmEv('a', 'Creamfields 2027 - 2 Day Camping - Gold'), tmEv('b', 'Creamfields 2027 - 2 Day Camping - Silver'), tmEv('c', 'Creamfields 2027 - 2 Day Camping - Bronze')], () => false)
    assert.equal(gs.length, 1); assert.equal(gs[0].duplicates.length, 2); assert.equal(gs[0].confident, true, gs[0].reasons.join('; '))
  })
  test('not when they start more than 15 minutes apart (early and late show)', () => {
    assert.equal(findDuplicateGroups([tmEv('a', 'Day Fever'), tmEv('b', 'Day Fever', '2026-12-19T19:00:00+00:00')], () => false).length, 0)
  })
  test('not different acts, nor a date used as the title', () => {
    assert.equal(findDuplicateGroups([tmEv('a', 'Jake Bugg'), tmEv('b', 'Gabrielle - The Hits')], () => false).length, 0)
    assert.equal(findDuplicateGroups([tmEv('a', 'Mon 28th Dec - Real Deal Comedy Jam'), tmEv('b', 'Mon 28th Dec - Stand Up Comedy Show')], () => false).length, 0)
  })
})
