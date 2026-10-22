import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { skipReason, londonToUtcIso, isNotAShow, resolveFeedCity, feedCategory, cleanFeedDescription, feedPriceFrom, postcodeFrom, type FeedRow, type KnownEvent } from './feedImportRules.ts'

const today = '2026-10-20'
const row = (over: Partial<FeedRow> = {}): FeedRow => ({ id: 1, name: 'Black Stone Cherry', event_date: '2026-11-20', venue: 'Rock City Nottingham', city: 'Nottingham', url: 'https://x/1', ...over })
const known = (over: Partial<KnownEvent> = {}): KnownEvent => ({ title: 'Some Other Band', date: '2026-11-20', city: 'Nottingham', venue: 'Rock City', ...over })

describe('skipReason', () => {
  test('a real show with nothing like it on the day may be imported', () => {
    assert.equal(skipReason(row(), [], today), null)
    assert.equal(skipReason(row(), [known()], today), null)   // another band in the same room is fine
  })
  test('the same show under a sponsor-style title is a duplicate (Cremonini case)', () => {
    const r = row({ name: 'Cesare Cremonini', venue: "O2 Shepherd's Bush Empire", city: 'London' })
    const e = known({ title: 'Mastercard Presents: Cremonini - Amateur Live (One Night in London)', city: 'London', venue: 'O2 Shepherds Bush Empire' })
    assert.equal(skipReason(r, [e], today), 'duplicate')
  })
  test('same title at a different venue in the same city is still a duplicate; another city is not', () => {
    assert.equal(skipReason(row(), [known({ title: 'Black Stone Cherry', venue: 'Rock City' })], today), 'duplicate')
    assert.equal(skipReason(row(), [known({ title: 'Black Stone Cherry', city: 'Leeds', venue: 'O2 Academy' })], today), null)
  })
  test('packages, past shows, missing venue/city/link and junk names are never imported', () => {
    assert.equal(skipReason(row({ name: 'Gladiators Live - Venue Premium Tickets' }), [], today), 'package')
    assert.equal(skipReason(row({ event_date: '2026-10-20' }), [], today), 'not_in_future')
    assert.equal(skipReason(row({ venue: ' ' }), [], today), 'no_venue_or_city')
    assert.equal(skipReason(row({ city: null }), [], today), 'no_venue_or_city')
    assert.equal(skipReason(row({ url: null }), [], today), 'no_link')
    assert.equal(skipReason(row({ name: '??' }), [], today), 'bad_name')
  })
})

describe('not a show (live feed examples, 22 Oct 2026)', () => {
  const no = (name: string, genre: string | null = null) => assert.equal(isNotAShow({ name, genre }), true, name)
  const yes = (name: string, genre: string | null = null) => assert.equal(isNotAShow({ name, genre }), false, name)
  test('walking tours, attractions, screenings, quizzes, fairs, add-ons and test rows are left out', () => {
    no('GREAT FIRE OF LONDON WALKING TOUR', 'ATTRACTIONS')
    no('Christmas Eve', 'ATTRACTIONS')
    no('SPOOKY SCREENING:Hotel Transylvania', 'CINEMA')
    no('A NOSEY AROUND SOHO WALK')
    no('SOUNDS FAMILIAR MUSIC QUIZ - LEEDS')
    no('I DO WEDDING EXHIBITIONS - BIRMINGHAM')
    no('The National Wedding Show')
    no('LINGFIELD RACECOURSE ANTIQUES AND VINTAGE FAIR')
    no('The Caravan, Camping & Motorhome Show 2027')
    no('Rock Oyster 2027 - Shuttle Buses')
    no('Rock Oyster 2027 - Accommodation')
    no('MAGNETAR DANCE - CAR PARK')
    no('Test Event 1')
    no('ONLY FOR TEST') // a Gigsberg test listing at Wembley Stadium
    no('The Whole Me Global Conference 2027')
    assert.equal(skipReason(row({ name: 'HUGE POP QUIZ' }), [], today), 'not_a_show')
  })
  test('real shows stay in, including ones whose names look close', () => {
    yes('Hermanos Gutiérrez', 'NAGIOS_CHECK2') // mislabelled genre, real gig
    yes('THE PARACHUTE TESTERS')
    yes('Walk The Moon')
    yes('CELEBRATING EAGLES: 50 YEARS OF HOTEL CALIFORNIA')
    yes('Bingo Lingo: Christmas - The Greatest Show')
    yes('Midge Ure - A Man Of Two Worlds', 'ROCK')
    yes('World Snooker Championship: Quarter Final Table One')
    yes('Book of Mormon')
  })
})

describe('londonToUtcIso', () => {
  test('summer (BST) shows are an hour earlier in UTC, winter (GMT) the same', () => {
    assert.equal(londonToUtcIso('2027-06-24', '19:30:00'), '2027-06-24T18:30:00.000Z')
    assert.equal(londonToUtcIso('2027-01-20', '19:30'), '2027-01-20T19:30:00.000Z')
    // no time in the feed: midnight UK = "time not known", never a made-up 7pm
    assert.equal(londonToUtcIso('2026-11-20', null), '2026-11-20T00:00:00.000Z')
    assert.equal(londonToUtcIso('2027-06-24', null), '2027-06-23T23:00:00.000Z')
    assert.equal(londonToUtcIso('2026-11-20', 'doors'), '2026-11-20T00:00:00.000Z')
  })
})

describe('resolveFeedCity (live See Tickets / Gigsberg spellings, 22 Oct 2026)', () => {
  const is = (city: string | null, address: string | null, want: string | null) => assert.equal(resolveFeedCity(city, address), want, `${city} | ${address}`)
  test('our cities, however the feed spells them', () => {
    is('London', '', 'London')
    is('Newcastle Upon Tyne', '36 Lime Street, Ouseburn, Newcastle Upon Tyne, NE1 2PQ', 'Newcastle')
    is('Newcastle upon Tyne', null, 'Newcastle')
    is('Newcastle-Upon-Tyne', '81 Blandford Street, Newcastle-Upon-Tyne, NE13PZ', 'Newcastle')
    is('Kingston Upon Hull', '63 Humber Street, Kingston Upon Hull, HU1 1TU', 'Hull')
    is('Stoke', 'MORLEY STREET, HANLEY, STOKE-ON-TRENT, ST1 4LS', 'Stoke-on-Trent')
    is('Middlesborough', 'ALBERT ROAD, MIDDLESBOROUGH, TS12QJ', 'Middlesbrough')
    is('Gr Manchester', '296 Oxford Rd, Manchester, Lancashire , Gr Manchester, M13 9NS', 'Manchester')
    is('Digbeth', '50 Adderley St, B9 4ED', 'Birmingham')
    is('Warwick Arts Centre - Coventry', 'WARWICK ARTS CENTRE, UNIVERSITY OF WARWICK, COVENTRY, CV4 7AL', 'Coventry')
    is('Cardiff University', 'Park Place, Cardiff, CF10 3QN', 'Cardiff')
    is('Brighton and Hove', '30 CHEAPSIDE, BRIGHTON AND HOVE, BN1 4GD', 'Brighton')
  })
  test('London districts and spellings', () => {
    is('West Central London', 'The Strand, West Central London, WC2R 1ES', 'London')
    is('Kings Cross', '5-13 Vale Royal,  London , Kings Cross, N7 9AP', 'London')
    is('Kings Cross,', '275 Pentonville Road, N1 9NL', 'London')
    is('Mayfair', '11-16 Dering Street, London, Mayfair, W1S 1AR', 'London')
    is('Camden, London', '5 Parkway, London, NW1 7PG', 'London')
    is('Brixton', '261 BRIXTON ROAD, LONDON, SW96LH', 'London')
    is('ExceL London', 'EXCEL LONDON, 1 WESTERN GATEWAY, ROYAL VICTORIA DOCK, LONDON, E16 1XL', 'London')
    is('London Borough Of Islington', 'Clerkenwell, London Borough Of Islington, ZFD', 'London')
    is('Butlers Wharf Pier', 'TOWER PIER, LOWER THAMES RIVER, LONDON, EC3N 4DT', 'London')
    is('Ealing', "St John's Ealing, Mattock Lane, W13 9LA", 'London')
  })
  test('separate towns stay themselves (no stretching a city to its neighbours)', () => {
    is('Chester', '2 Rufus Court, Northgate Street, Chester, Chester, CH1 2JW', 'Chester')
    is('Birkenhead', '75 Argyle Street, Birkenhead, CH41 6AB', 'Birkenhead')
    is('Port Glasgow', 'Shore Street, Port Glasgow, Port Glasgow, PA14 5HD', 'Port Glasgow')
    is('Salford', '2 Adelphi St, Salford, M3 6EN', 'Salford')
    is('Gateshead', 'Half Moon Lane, Gateshead, Gateshead, NE8 2AN', 'Gateshead')
    is('Twickenham', 'The Patch, 67 London Road, Twickenham, TW1 3SZ', 'Twickenham')
    is('Hove', '1-3 Holland Road, Hove, BN3 1JF', 'Hove')
  })
  test('counties and regions become the town in the address', () => {
    is('Kent', 'THE FORUM, FONTHILL, THE COMMON, TUNBRIDGE WELLS, KENT, TN48YU', 'Tunbridge Wells')
    is('Warwickshire', 'COVENTRY, WEST MIDLANDS, CV8 3DR', 'Coventry')
    is('Devon', 'ESPLANADE, EXMOUTH, DEVON, EX8 2AZ', 'Exmouth')
    is('Cornwall', "ST MARY'S STREET, TRURO, CORNWALL, TR1 2AF", 'Truro')
    is('Hampshire', '1 THE CLOSE, WINCHESTER, HAMPSHIRE, SO23 9LS', 'Winchester')
    is('North Yorkshire', 'WEST CLIFF, YO213EN', 'North Yorkshire')
  })
  test('tidying', () => {
    is('Ely, Cambridgeshire', 'Ship Lane, Ely, Cambridgeshire, CB7 4BB', 'Ely')
    is('Torquay TQ1 1DZ', '39-41 Torwood St, TQ1 1DZ', 'Torquay')
    is('ILFORD', 'Kenneth More Theatre, IG1 1BT', 'Ilford')
    is('BURY ST EDMUNDS', 'The Apex, IP33 3FD', 'Bury St Edmunds')
    is('Launceston,', 'Western Road, Cornwall, Launceston,, PL15 7AR', 'Launceston')
  })
})

describe('feedCategory', () => {
  test('See Tickets genres', () => {
    assert.equal(feedCategory('see_tickets', 'COMEDY'), 'comedy')
    assert.equal(feedCategory('see_tickets', 'THEATRE'), 'theatre')
    assert.equal(feedCategory('see_tickets', 'SPORT'), 'sports')
    assert.equal(feedCategory('see_tickets', 'ROCK'), 'concert')
    assert.equal(feedCategory('see_tickets', 'DANCE AND CLUBS'), 'concert')
    // labels that say nothing: use the title-based guess
    assert.equal(feedCategory('see_tickets', 'SPECIAL EVENTS'), null)
    assert.equal(feedCategory('see_tickets', 'NAGIOS_CHECK2'), null)
    assert.equal(feedCategory('see_tickets', null), null)
  })
  test('Gigsberg types', () => {
    assert.equal(feedCategory('gigsberg', 'Sport', 'Football'), 'sports')
    assert.equal(feedCategory('gigsberg', 'Comedy', 'Comedy'), 'comedy')
    assert.equal(feedCategory('gigsberg', 'Theatre', 'Cirque'), 'theatre')
    assert.equal(feedCategory('gigsberg', 'Festival', 'UK Festivals'), 'concert')
    assert.equal(feedCategory('gigsberg', 'Theatre', 'Conferences And Speaking Tours'), null)
    assert.equal(feedCategory('gigsberg', 'Theatre', 'Museums and Exhibitions'), null)
  })
})

describe('description, price and postcode from the feeds', () => {
  test('description: entities and tags removed, paragraphs kept, capped on a sentence', () => {
    assert.equal(
      cleanFeedDescription('The Luke&nbsp;Combs&nbsp;Experience Is Back&nbsp;In&nbsp;Bournemouth! Join us for an <b>unforgettable</b> evening.<br>Doors 7pm.'),
      'The Luke Combs Experience Is Back In Bournemouth! Join us for an unforgettable evening.\nDoors 7pm.',
    )
    assert.equal(cleanFeedDescription('Short.'), null)
    assert.equal(cleanFeedDescription(null), null)
    const long = 'A sentence that goes on. '.repeat(60)
    const out = cleanFeedDescription(long)!
    assert.ok(out.length <= 900 && out.endsWith('.'))
  })
  test('price: minimum first, then search price; free or junk values ignored', () => {
    assert.equal(feedPriceFrom('37.8', '37.80'), 37.8)
    assert.equal(feedPriceFrom(null, '23.10'), 23.1)
    assert.equal(feedPriceFrom(null, 'GBP11.00'), 11)
    assert.equal(feedPriceFrom('0', '0.00'), null)
    assert.equal(feedPriceFrom(null, null), null)
  })
  test('postcode', () => {
    assert.equal(postcodeFrom('261 BRIXTON ROAD, LONDON, SW96LH'), 'SW9 6LH')
    assert.equal(postcodeFrom('The Strand, West Central London, WC2R 1ES'), 'WC2R 1ES')
    assert.equal(postcodeFrom('Long road, Canvey, SS8 OJA'), 'SS8 0JA')
    assert.equal(postcodeFrom('No postcode here'), null)
  })
})

import { inferEventCategory } from './eventImages.ts'
describe('title-based category guess (fallback when a feed label says nothing)', () => {
  test('a circus is a family show unless the title says it is an adult night', () => {
    assert.equal(inferEventCategory('Zippos Circus'), 'family')
    assert.equal(inferEventCategory('York LesBiQueer Collective: The Circus Of Fools!'), 'concert')
    assert.equal(inferEventCategory('Circus of Horrors: Adults Only'), 'concert')
  })
})
