import test from 'node:test'
import assert from 'node:assert/strict'
import {
  parseAddressString, extractEventsJsonLd, startDateToIso, parseLocation, eventFromPage, parseSitemap, matchesDetailPattern,
  chooseUrlsToFetch, pageId, mapSchemaStatus, isUkMidnight, startOfUkDayIso, isPastStart, parseRobots, robotsAllows, type LedgerRow,
} from './localEventParsing.ts'

const page = (json: unknown) => `<html><script type="application/ld+json">${JSON.stringify(json)}</script></html>`

test('finds an Event inside @graph and accepts subtypes', () => {
  const html = page({ '@context': 'https://schema.org', '@graph': [{ '@type': 'WebPage' }, { '@type': 'MusicEvent', name: 'Gig', startDate: '2026-11-01T20:00:00Z' }] })
  assert.equal(extractEventsJsonLd(html).length, 1)
})

test('ignores pages with no Event and events with no start date', () => {
  assert.equal(extractEventsJsonLd(page({ '@type': 'Article', name: 'x' })).length, 0)
  assert.equal(extractEventsJsonLd(page({ '@type': 'Event', name: 'x' })).length, 0)
  assert.equal(extractEventsJsonLd('<script type="application/ld+json">{broken</script>').length, 0)
})

test('start dates with no zone are UK wall-clock time (BST and GMT)', () => {
  assert.equal(startDateToIso('2026-10-24T19:30:00'), '2026-10-24T18:30:00.000Z')   // BST
  assert.equal(startDateToIso('2026-11-07T19:30:00'), '2026-11-07T19:30:00.000Z')   // GMT
  assert.equal(startDateToIso('2026-10-24T00:00:00Z'), '2026-10-23T23:00:00.000Z')   // date only written as UTC midnight -> UK midnight (BST)
  assert.equal(startDateToIso('2026-10-24T19:30:00+01:00'), '2026-10-24T18:30:00.000Z')   // a real time with an offset is kept
  assert.equal(startDateToIso('2026-10-24T19:30:00+01:00'), '2026-10-24T18:30:00.000Z')
  assert.equal(startDateToIso('2026-10-24T19:30:00Z'), '2026-10-24T19:30:00.000Z')
})

test('a bare date lands at midnight UK time (= "time not known"), so no made-up time is shown', () => {
  assert.equal(startDateToIso('2026-07-04'), '2026-07-03T23:00:00.000Z')   // BST
  assert.equal(startDateToIso('2026-12-04'), '2026-12-04T00:00:00.000Z')   // GMT
  assert.equal(startDateToIso('2026-10-30 18:30:00'), '2026-10-30T18:30:00.000Z')   // no zone, GMT day
  assert.equal(startDateToIso('2026-10-22 14:00:00 +0100'), '2026-10-22T13:00:00.000Z')
  assert.equal(startDateToIso(''), null)
})

test('midnight UK means the time is not known; such events stay current all day', () => {
  assert.ok(isUkMidnight('2026-07-03T23:00:00.000Z'))
  assert.ok(isUkMidnight('2026-12-04T00:00:00.000Z'))
  assert.ok(!isUkMidnight('2026-12-04T12:00:00.000Z'))
  assert.equal(startOfUkDayIso(Date.parse('2026-07-04T15:00:00Z')), '2026-07-03T23:00:00.000Z')
  assert.equal(startOfUkDayIso(Date.parse('2026-12-04T15:00:00Z')), '2026-12-04T00:00:00.000Z')
  const now = Date.parse('2026-07-04T20:00:00Z')
  assert.equal(isPastStart('2026-07-03T23:00:00.000Z', now), false)    // today, no time: still on
  assert.equal(isPastStart('2026-07-02T23:00:00.000Z', now), true)     // yesterday
  assert.equal(isPastStart('2026-07-04T10:00:00.000Z', now), true)     // timed, 10 hours ago
  assert.equal(isPastStart('2026-07-04T18:00:00.000Z', now), false)    // timed, 2 hours ago
})

test('location accepts an object, an array or a plain string', () => {
  const l = parseLocation([{ name: 'The Hall &amp; Rooms', address: { streetAddress: '1 High St', addressLocality: 'Derby', postalCode: 'DE1 1AA' }, geo: { latitude: '52.9', longitude: '-1.4' } }])
  assert.deepEqual([l.venueName, l.city, l.postcode, l.lat, l.lng], ['The Hall & Rooms', 'Derby', 'DE1 1AA', 52.9, -1.4])
  assert.equal(parseLocation('Market Place').venueName, 'Market Place')
  assert.equal(parseLocation(undefined).venueName, null)
})

test('eventFromPage maps a typical tourist-board page', () => {
  const html = page({
    '@type': 'Event', name: 'Christmas Lights &amp; Market', startDate: '2026-11-20T17:00:00', image: ['/img/a.jpg'],
    eventStatus: 'https://schema.org/EventScheduled', location: { name: 'Castle Park', address: { addressLocality: 'Bristol' } },
    offers: [{ url: 'https://tickets.example.com/x' }], description: '<p>Lights on.</p>',
  })
  const ev = eventFromPage(html, 'https://visit.example.com/event/lights/123/', 'Bristol')!
  assert.equal(ev.title, 'Christmas Lights & Market')
  assert.equal(ev.startDate, '2026-11-20T17:00:00.000Z')
  assert.equal(ev.imageUrl, 'https://visit.example.com/img/a.jpg')
  assert.equal(ev.ticketUrl, 'https://tickets.example.com/x')
  assert.equal(ev.sourceUrl, 'https://visit.example.com/event/lights/123/')
  assert.equal(ev.description, 'Lights on.')
})

test('eventFromPage falls back to the source city and the page url, and rejects non-events', () => {
  const ev = eventFromPage(page({ '@type': 'Event', name: 'X', startDate: '2026-11-20' }), 'https://a.com/event/x', 'Hull')!
  assert.equal(ev.city, 'Hull'); assert.equal(ev.venueName, 'Hull'); assert.equal(ev.ticketUrl, 'https://a.com/event/x')
  assert.equal(eventFromPage('<html></html>', 'https://a.com/x', 'Hull'), null)
})

test('cancelled and postponed markers map to statuses', () => {
  assert.equal(mapSchemaStatus('https://schema.org/EventCancelled'), 'cancelled')
  assert.equal(mapSchemaStatus('EventPostponed'), 'postponed')
  assert.equal(mapSchemaStatus(undefined), 'upcoming')
})

test('sitemap parsing handles indexes, lastmod and entities', () => {
  const idx = parseSitemap('<sitemapindex><sitemap><loc>https://a.com/event-sitemap.xml</loc><lastmod>2026-10-01</lastmod></sitemap></sitemapindex>')
  assert.equal(idx.isIndex, true); assert.equal(idx.entries[0].url, 'https://a.com/event-sitemap.xml')
  const flat = parseSitemap('<urlset><url><loc>https://a.com/e?a=1&amp;b=2</loc></url><url><loc>https://a.com/f</loc><lastmod>2026-10-20T01:00:00Z</lastmod></url></urlset>')
  assert.equal(flat.isIndex, false); assert.equal(flat.entries[0].url, 'https://a.com/e?a=1&b=2'); assert.equal(flat.entries[1].lastmod, '2026-10-20T01:00:00Z')
})

test('detail patterns match the path only', () => {
  assert.equal(matchesDetailPattern('https://a.com/event/some-show/123/', '^/event/[^/]+/\\d+/?$'), true)
  assert.equal(matchesDetailPattern('https://a.com/whats-on/event/x/1/', '^/event/[^/]+/\\d+/?$'), false)
  assert.equal(matchesDetailPattern('https://a.com/events/category/music', '^/events/(?!category)[^/]+$'), false)
  assert.equal(matchesDetailPattern('https://a.com/events/some-show', '^/events/(?!category)[^/]+$'), true)
})

test('fetch order: never-seen first (newest lastmod first), then due refreshes; past/gone are left alone', () => {
  const now = Date.parse('2026-10-21T12:00:00Z')
  const day = 86_400_000
  const ledger = new Map<string, LedgerRow>([
    ['https://a.com/old-event', { state: 'event', checked_at: new Date(now - 5 * day).toISOString(), start_date: '2026-11-30T00:00:00Z' }],
    ['https://a.com/fresh-event', { state: 'event', checked_at: new Date(now - 1 * day).toISOString(), start_date: '2026-11-30T00:00:00Z' }],
    ['https://a.com/finished', { state: 'event', checked_at: new Date(now - 9 * day).toISOString(), start_date: '2026-10-01T00:00:00Z' }],
    ['https://a.com/past', { state: 'past', checked_at: new Date(now - 40 * day).toISOString(), start_date: '2026-09-01T00:00:00Z' }],
    ['https://a.com/gone', { state: 'gone', checked_at: new Date(now - 10 * day).toISOString(), start_date: null }],
    ['https://a.com/article', { state: 'noevent', checked_at: new Date(now - 30 * day).toISOString(), start_date: null }],
  ])
  const found = ['old-event', 'fresh-event', 'finished', 'past', 'gone', 'article', 'new-a', 'new-b'].map(s => ({ url: `https://a.com/${s}`, lastmod: s === 'new-b' ? '2026-10-20' : s === 'new-a' ? '2026-10-01' : null }))
  assert.deepEqual(chooseUrlsToFetch(found, ledger, now, 10), ['https://a.com/new-b', 'https://a.com/new-a', 'https://a.com/article', 'https://a.com/old-event'])
  assert.deepEqual(chooseUrlsToFetch(found, ledger, now, 1), ['https://a.com/new-b'])
})


test('address strings and map-place objects give a venue, town and postcode', () => {
  assert.deepEqual(parseAddressString('60 Low Petergate, York, YO1 7HZ, United Kingdom'), { address: '60 Low Petergate', city: 'York', postcode: 'YO1 7HZ' })
  assert.deepEqual(parseAddressString('Portlethen, AB12 4PT'), { address: null, city: 'Portlethen', postcode: 'AB12 4PT' })
  const l = parseLocation({ name: { name: 'Epic Studios', street_number: '112-114', street_name: 'Magdalen Street', city: 'Norwich', post_code: 'NR3 1JD', lat: 52.63, lng: 1.29 }, address: { streetAddress: '112-114 Magdalen Street' } })
  assert.deepEqual([l.venueName, l.address, l.city, l.postcode, l.lat], ['Epic Studios', '112-114 Magdalen Street', 'Norwich', 'NR3 1JD', 52.63])
  assert.equal(parseLocation({ '@type': 'LocalBusiness', name: 'Birmingham Hippodrome', geo: { latitude: 52.47, longitude: -1.89 } }).city, null)
})

test('offsets written without a colon are understood', () => {
  assert.equal(startDateToIso('2027-09-23T19:00:00+0100'), '2027-09-23T18:00:00.000Z')
  assert.equal(startDateToIso('2026-11-19 20:00:00'), '2026-11-19T20:00:00.000Z')
})

test('never-seen pages: same lastmod day falls back to highest id first', () => {
  assert.equal(pageId('https://a.com/event/some-show/176524101/'), 176524101)
  assert.equal(pageId('https://a.com/events/3163019-fajitas-with-fair'), 3163019)
  assert.equal(pageId('https://a.com/event/some-show/'), 0)
  assert.equal(pageId('https://a.com/whats-on/2026-iihf-cup-final-p1036981'), 1036981)
  assert.equal(pageId('https://a.com/events/art-show-29102026-3162662/'), 3162662)
  const found = [
    { url: 'https://a.com/event/old/100000101/', lastmod: '2026-10-20T01:00:00Z' },
    { url: 'https://a.com/event/new/900000101/', lastmod: '2026-10-20T03:00:00Z' },
    { url: 'https://a.com/event/mid/500000101/', lastmod: '2026-10-20T02:00:00Z' },
  ]
  assert.deepEqual(chooseUrlsToFetch(found, new Map(), Date.now(), 2), ['https://a.com/event/new/900000101/', 'https://a.com/event/mid/500000101/'])
})

test('a large backlog still leaves room for refreshes', () => {
  const now = Date.parse('2026-10-21T12:00:00Z')
  const ledger = new Map<string, LedgerRow>([['https://a.com/event/known/100/', { state: 'event', checked_at: new Date(now - 9 * 86_400_000).toISOString(), start_date: '2026-12-01T00:00:00Z' }]])
  const found = [{ url: 'https://a.com/event/known/100/', lastmod: null }, ...Array.from({ length: 50 }, (_, i) => ({ url: `https://a.com/event/new-${i}/${1000 + i}/`, lastmod: null }))]
  const chosen = chooseUrlsToFetch(found, ledger, now, 10)
  assert.equal(chosen.length, 10)
  assert.ok(chosen.includes('https://a.com/event/known/100/'))
})

test('robots.txt: our group or *, longest match wins, crawl-delay', () => {
  const txt = `User-agent: *\nDisallow: /plugins/crm/count/\nAllow: /\nCrawl-delay: 2\n\nUser-agent: GPTBot\nDisallow: /`
  const r = parseRobots(txt)
  assert.equal(r.crawlDelaySec, 2)
  assert.ok(robotsAllows(r, '/event/foo/123/'))
  assert.ok(!robotsAllows(r, '/plugins/crm/count/x'))
  const own = parseRobots(`User-agent: *\nDisallow: /\n\nUser-agent: TheShowFinderBot\nAllow: /events/\nDisallow: /`)
  assert.ok(robotsAllows(own, '/events/x'))
  assert.ok(!robotsAllows(own, '/other'))
  const wild = parseRobots(`User-agent: *\nDisallow: /*?print=\nDisallow: /search$`)
  assert.ok(!robotsAllows(wild, '/event/a?print=1'))
  assert.ok(robotsAllows(wild, '/search/results'))
  assert.ok(!robotsAllows(wild, '/search'))
  assert.deepEqual(parseRobots(''), { allow: [], disallow: [], crawlDelaySec: null })
})
