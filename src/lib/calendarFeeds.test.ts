import { test } from 'node:test'
import assert from 'node:assert/strict'
import { showFeedEvents, onSaleFeedEvents, webcalUrl, googleSubscribeUrl, cityFeedPath, type FeedRow } from './calendarFeeds.ts'
import { buildIcsFeed } from './ics.ts'

const NOW = Date.parse('2026-10-17T10:00:00Z')
let n = 0
function row(over: Partial<FeedRow> = {}): FeedRow {
  n++
  return {
    slug: `show-${n}`, title: `Band ${n}`, start_date: `2026-11-${String(10 + (n % 15)).padStart(2, '0')}T19:30:00Z`,
    venue_name: 'Arena', venue_city: 'Derby', public_onsale_start: null, presale_start: null, presale_name: null, ...over,
  }
}

test('show feed drops hospitality listings and same-day duplicates, and orders by date', () => {
  const a = row({ title: 'Band A', start_date: '2026-12-02T19:30:00Z', slug: 'a1' })
  const dup = row({ title: 'band a', start_date: '2026-12-02T20:00:00Z', slug: 'a2' })
  const premium = row({ title: 'Arena - Premium Packages', slug: 'p1' })
  const earlier = row({ title: 'Band B', start_date: '2026-11-20T19:30:00Z', slug: 'b1' })
  const out = showFeedEvents([a, dup, premium, earlier])
  assert.deepEqual(out.map(e => e.uid), ['show-b1', 'show-a1'])
  assert.equal(out[0].title, 'Band B at Arena')
  assert.equal(out[0].location, 'Arena, Derby')
  assert.equal(out[0].url, 'https://www.theshowfinder.com/events/b1')
})

test('on-sale feed groups a tour into one reminder with an alarm', () => {
  const t = '2026-10-22T11:00:00Z'
  const rows = [
    row({ title: 'Darts 2027', slug: 'd-glasgow', venue_city: 'Glasgow', venue_name: 'OVO Hydro', public_onsale_start: t }),
    row({ title: 'Darts 2027', slug: 'd-cardiff', venue_city: 'Cardiff', venue_name: 'Utilita Arena', public_onsale_start: t }),
  ]
  const out = onSaleFeedEvents(rows, NOW)
  assert.equal(out.length, 1)
  assert.equal(out[0].title, 'Tickets on sale: Darts 2027 (2 UK dates)')
  assert.equal(out[0].startISO, new Date(t).toISOString())
  assert.equal(out[0].alarmMinutesBefore, 15)
  assert.equal(out[0].url, 'https://www.theshowfinder.com/on-sale-this-week')
  assert.equal(out[0].uid, `onsale-general-d-cardiff-${Date.parse(t)}`)
})

test('on-sale feed includes presales, and ignores past, far-off and placeholder dates', () => {
  const rows = [
    row({ title: 'Solo', slug: 's1', presale_start: '2026-10-20T09:00:00Z', presale_name: 'O2 Priority' }),
    row({ title: 'Past', public_onsale_start: '2026-10-01T09:00:00Z' }),
    row({ title: 'Far', public_onsale_start: '2027-03-01T09:00:00Z' }),
    row({ title: 'Junk', public_onsale_start: '1900-01-01T00:00:00Z' }),
  ]
  const out = onSaleFeedEvents(rows, NOW)
  assert.equal(out.length, 1)
  assert.equal(out[0].title, 'Presale (O2 Priority): Solo')
  assert.equal(out[0].location, 'Arena, Derby')
  assert.equal(out[0].url, 'https://www.theshowfinder.com/events/s1')
})

test('a feed is a valid calendar with name, refresh hint, alarm and many events', () => {
  const events = onSaleFeedEvents([row({ title: 'Solo', slug: 's1', public_onsale_start: '2026-10-20T09:00:00Z' })], NOW)
  const ics = buildIcsFeed({ name: 'Derby gigs', description: 'Upcoming shows', events: [...events, ...showFeedEvents([row()])] }, new Date(NOW))
  assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\n') && ics.endsWith('END:VCALENDAR\r\n'))
  assert.match(ics, /X-WR-CALNAME:Derby gigs/)
  assert.match(ics, /REFRESH-INTERVAL;VALUE=DURATION:PT6H/)
  assert.match(ics, /BEGIN:VALARM\r\nACTION:DISPLAY\r\nDESCRIPTION:Tickets on sale: Solo\r\nTRIGGER:-PT15M\r\nEND:VALARM/)
  assert.equal(ics.split('BEGIN:VEVENT').length - 1, 2)
})

test('subscribe links', () => {
  assert.equal(cityFeedPath('Stoke-on-Trent'), '/calendar/cities/Stoke-on-Trent.ics')
  assert.equal(webcalUrl('/calendar/on-sale.ics'), 'webcal://www.theshowfinder.com/calendar/on-sale.ics')
  assert.ok(googleSubscribeUrl('/calendar/on-sale.ics').startsWith('https://calendar.google.com/calendar/r?cid=webcal%3A%2F%2F'))
})

test('on-sale feed skips venue-premium listings and on-sale times at or after the show starts', () => {
  const t = '2026-10-22T11:00:00Z'
  const rows = [
    row({ title: 'BetMGM Premier League Darts - Venue Premium Tickets', slug: 'vp', public_onsale_start: t }),
    row({ title: 'Indie Afternoon', slug: 'door', start_date: '2026-10-24T14:00:00Z', public_onsale_start: '2026-10-24T14:00:00Z' }),
    row({ title: 'Real Show', slug: 'ok', public_onsale_start: t }),
  ]
  const out = onSaleFeedEvents(rows, NOW)
  assert.deepEqual(out.map(e => e.title), ['Tickets on sale: Real Show'])
})
