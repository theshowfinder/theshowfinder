import test from 'node:test'
import assert from 'node:assert/strict'
import { parseDateText, parseClock, nextSession, eventFromHtml, isHtmlParser } from './localEventHtml.ts'

const NOW = Date.parse('2026-10-21T10:00:00Z')

test('dates written for people', () => {
  assert.deepEqual(parseDateText('16th June 2025 - 30th June 2025'), { start: [2025, 6, 16], end: [2025, 6, 30] })
  assert.deepEqual(parseDateText('Thu 29 Oct 2026'), { start: [2026, 10, 29], end: null })
  assert.deepEqual(parseDateText(' 19 Oct 2026 - 20 Oct 2026 '), { start: [2026, 10, 19], end: [2026, 10, 20] })
  assert.deepEqual(parseDateText('31 Oct  2026'), { start: [2026, 10, 31], end: null })
  assert.deepEqual(parseDateText('15th November 2026'), { start: [2026, 11, 15], end: null })
  assert.deepEqual(parseDateText('16/06/2025'), { start: [2025, 6, 16], end: null })
  assert.deepEqual(parseDateText('1 - 3 Nov 2026'), { start: [2026, 11, 1], end: [2026, 11, 3] })
  assert.deepEqual(parseDateText('6 Sept 2026'), { start: [2026, 9, 6], end: null })
  assert.equal(parseDateText('Every Thursday'), null)
  assert.equal(parseDateText(''), null)
})

test('clock times', () => {
  assert.equal(parseClock('7:30 pm'), '19:30')
  assert.equal(parseClock('12:00 pm - 5:30 pm'), '12:00')
  assert.equal(parseClock('12am'), '00:00')
  assert.equal(parseClock(' 19:00 '), '19:00')
  assert.equal(parseClock('2pm'), '14:00')
  assert.equal(parseClock('10.30am'), '10:30')
  assert.equal(parseClock('Free entry'), null)
})

test('next session: today counts, earlier days and already-running ranges do not', () => {
  const s = (d: [number, number, number], end: [number, number, number] | null = null) => ({ start: d, end, time: null })
  assert.deepEqual(nextSession([s([2026, 10, 20]), s([2026, 10, 21]), s([2026, 11, 2])], NOW)?.start, [2026, 10, 21])
  assert.deepEqual(nextSession([s([2026, 11, 2]), s([2026, 10, 25])], NOW)?.start, [2026, 10, 25])
  assert.equal(nextSession([s([2026, 6, 16], [2026, 12, 30])], NOW), null)
  assert.equal(nextSession([], NOW), null)
})

test('NewMind platform (Visit Nottinghamshire, Plymouth, Stoke, Bradford, Brighton, Exeter, Bath)', () => {
  const html = `<h1>Paint &amp; Sip</h1><meta property="og:image" content="/img/x.jpg">
  <div class="node openingTimes"><table class="dates openTypeSEAS"><thead><tr><th><span class="date">(14 Oct 2026)</span></th></tr></thead><tbody><tr><td class="times"><span class="from">14:00</span></td></tr></tbody></table>
  <table class="dates openTypeSEAS"><thead><tr><th><span class="date">(21 Nov 2026)</span></th></tr></thead><tbody><tr><td class="times"><span class="from">14:00</span></td></tr></tbody></table></div>
  <script>var x=[{ "product_name": "Paint & Sip", "latitude": 53.04525, "longitude": -1.10687, "address4": "Nottingham" }];</script>
  <div class="node address"> <span>Patchings Art Centre</span>, <span>Vantom Village</span>, <span>Calverton</span>, <span>NG14 6NU</span> </div>`
  const ev = eventFromHtml('newmind', html, 'https://www.visit-nottinghamshire.co.uk/whats-on/paint-and-sip-p1069421', 'Nottingham', NOW)!
  assert.equal(ev.title, 'Paint & Sip')
  assert.equal(ev.startDate, '2026-11-21T14:00:00.000Z')       // next session, 14:00 GMT
  assert.equal(ev.venueName, 'Patchings Art Centre')
  assert.equal(ev.postcode, 'NG14 6NU')
  assert.equal(ev.city, 'Nottingham')
  assert.deepEqual([ev.lat, ev.lng], [53.04525, -1.10687])
  assert.equal(ev.imageUrl, 'https://www.visit-nottinghamshire.co.uk/img/x.jpg')
  const passed = html.replace(/<table[\s\S]*<\/table>/, '<p class="expiredOpenings">Sorry, this event has passed</p>')
  assert.equal(eventFromHtml('newmind', passed, 'https://x/whats-on/a-p1', 'Nottingham', NOW), null)
})

test('Edinburgh: date attributes and address lines from the map link; no time = midnight UK', () => {
  const html = `<h1>Concert</h1><span data-event-start-date="31/10/2026" data-event-end-date="31/10/2026"> 31st October 2026 </span>
  <div aria-label="Event location"><img src="x.svg" /><a data-analytics-address href="https://www.google.com/maps/search/?api=1&query=St%20Giles%27%20Cathedral%0D%0AHigh%20Street%0D%0AEdinburgh%0D%0AEH1%201RE">x</a></div>
  <div data-latitude="55.9495" longitude="-3.1908"></div>`
  const ev = eventFromHtml('edinburgh', html, 'https://edinburgh.org/event/concert/', 'Edinburgh', NOW)!
  assert.equal(ev.startDate, '2026-10-31T00:00:00.000Z')
  assert.equal(ev.venueName, "St Giles' Cathedral")
  assert.equal(ev.postcode, 'EH1 1RE')
})

test('Glasgow: "When"/"Where" header, date in the URL as a fallback, single venue name', () => {
  const html = `<h1>Burrell Bites</h1><div class="page-header__meta-label">When</div> <div class="page-header__meta-value">Sat 14 Nov 2026</div>
  <div class="page-header__meta-label">Where</div> <div class="page-header__meta-value">The Burrell Collection</div>`
  const ev = eventFromHtml('glasgow', html, 'https://www.visitglasgow.com/events/burrell-bites-14112026-3162600/', 'Glasgow', NOW)!
  assert.equal(ev.startDate, '2026-11-14T00:00:00.000Z')
  assert.equal(ev.venueName, 'The Burrell Collection')
  assert.equal(ev.city, 'Glasgow')
  const noWhen = eventFromHtml('glasgow', '<h1>X</h1>', 'https://www.visitglasgow.com/events/x-05122026-1/', 'Glasgow', NOW)!
  assert.equal(noWhen.startDate, '2026-12-05T00:00:00.000Z')
})

test('Leeds, Cardiff, Cambridge, Sheffield, Bournemouth readers', () => {
  const leeds = eventFromHtml('leeds', `<h1>Halloween Mill Tour</h1><div class="date"> 30th October 2026 - 31st October 2026 </div><div class="attraction"><a href="/x">Leeds Industrial Museum</a></div>`, 'https://www.visitleeds.co.uk/whats-on/all-events/x/', 'Leeds', NOW)!
  assert.equal(leeds.startDate, '2026-10-30T00:00:00.000Z')
  assert.equal(leeds.venueName, 'Leeds Industrial Museum')

  const cardiff = eventFromHtml('cardiff', `<h1>Beaujolais Day</h1><h2 class="eventdetail-top">Date(s)</h2> <p class="eventdetail-text"> 19 Nov 2026 </p><h2 class="eventdetail-top">Times</h2> <p class="eventdetail-text"> 18:30 </p><h2 class="eventdetail-top">Venue</h2> <p class="eventdetail-text"> The Botanist, Church Street, Cardiff CF10 1BG </p>`, 'https://www.visitcardiff.com/events/x/', 'Cardiff', NOW)!
  assert.equal(cardiff.startDate, '2026-11-19T18:30:00.000Z')
  assert.equal(cardiff.venueName, 'The Botanist')
  assert.equal(cardiff.postcode, 'CF10 1BG')

  const cam = eventFromHtml('cambridge', `<h1>Switch On</h1><li class="period"> <span>15th November 2026</span> </li> <li class="period"> <span>12:00 pm - 5:30 pm</span> </li>`, 'https://www.visitcambridge.org/event/x/', 'Cambridge', NOW)!
  assert.equal(cam.startDate, '2026-11-15T12:00:00.000Z')

  const shef = eventFromHtml('sheffield', `<h1>Book Club</h1><small><span class="nobreak">06 Dec 2026</span></small><small><span class="nobreak">19:00</span> - <span class="nobreak">22:00</span></small>`, 'https://www.welcometosheffield.co.uk/content/events/x/', 'Sheffield', NOW)!
  assert.equal(shef.startDate, '2026-12-06T19:00:00.000Z')

  const bmth = eventFromHtml('bournemouth', `<h1>Christmas Market</h1><div>Start:</div><div class="text-block-22">20 November 2026</div><div class="text-block-22">5:00 pm</div></div><div><div>End:</div>
  <h3>Location</h3><div class="cta-item-wrapper"><a href="https://www.google.com/maps/place/Compton+Acres,+Poole/@50.7,-1.9,17z/data=!3d50.7186148!4d-1.9774971" class="x"><div class="action color-text-primary-black">164 Canford Cliffs Rd, Poole, BH13 7ES</div></a></div>`, 'https://www.bournemouth.co.uk/event/x', 'Bournemouth', NOW)!
  assert.equal(bmth.startDate, '2026-11-20T17:00:00.000Z')
  assert.equal(bmth.venueName, 'Compton Acres')
  assert.equal(bmth.postcode, 'BH13 7ES')
  assert.deepEqual([bmth.lat, bmth.lng], [50.7186148, -1.9774971])
})

test('no title or no date: not an event page', () => {
  assert.equal(eventFromHtml('leeds', '<div class="date">1st Nov 2026</div>', 'https://x/', 'Leeds', NOW), null)
  assert.equal(eventFromHtml('cardiff', '<h1>Tours</h1>', 'https://x/', 'Cardiff', NOW), null)
  assert.ok(isHtmlParser('newmind') && !isHtmlParser('jsonld') && !isHtmlParser(null))
})
