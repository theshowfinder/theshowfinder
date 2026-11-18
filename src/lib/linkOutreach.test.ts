import test from 'node:test'
import assert from 'node:assert/strict'
import { buildLinkEmail, isOwnSite, linksToUs, pagesToCheck, inSendingHours, domainOf, type LinkProspect } from './linkOutreach.ts'

const venue: LinkProspect = { id: '1', kind: 'venue', name: 'The Leadmill', city: 'Sheffield', website: 'https://leadmill.co.uk', email: 'info@leadmill.co.uk', contact_name: null, shows: 23, page_url: 'https://www.theshowfinder.com/venues/the-leadmill-sheffield', pitch: 'widget', unsubscribe_token: 'abc', venue_slug: 'the-leadmill-sheffield' }

test('venue email: real numbers, the widget code, unsubscribe link, no competitors', () => {
  const e = buildLinkEmail(venue, 'first')
  assert.equal(e.subject, 'The Leadmill: your 23 upcoming shows on TheShowFinder')
  assert.match(e.text, /We list 23 upcoming shows at The Leadmill/)
  assert.match(e.text, /embed\/venue\/the-leadmill-sheffield/)
  assert.match(e.text, /<a href="https:\/\/www\.theshowfinder\.com\/venues\/the-leadmill-sheffield">/)
  assert.match(e.text, /unsubscribe\/abc/)
  assert.doesNotMatch(e.text, /eventbrite|skiddle|ticketsource/i)
  const f = buildLinkEmail(venue, 'follow_up')
  assert.equal(f.subject, 'Re: The Leadmill: your 23 upcoming shows on TheShowFinder')
})

test('organiser and press emails', () => {
  const o = buildLinkEmail({ ...venue, kind: 'organiser', name: 'Absolutely Belting Comedy', city: 'Bedford', sample_event: 'Dan Evans Live', venue_slug: null }, 'first')
  assert.equal(o.subject, "Free listings for Absolutely Belting Comedy's events in Bedford")
  assert.match(o.text, /keep 100% of your ticket price/)
  const p = buildLinkEmail({ ...venue, kind: 'press', subject: 'Every panto in Leeds', body: 'Hi Sam,\n\nFigures…' }, 'first')
  assert.equal(p.subject, 'Every panto in Leeds')
  assert.match(p.text, /^Hi Sam/)
})

test('own sites, link detection, pages to check', () => {
  assert.equal(isOwnSite('https://www.leadmill.co.uk/'), true)
  assert.equal(isOwnSite('https://www.ticketmaster.co.uk/x/venue/1'), false)
  assert.equal(isOwnSite('https://facebook.com/leadmill'), false)
  assert.equal(domainOf('https://www.Leadmill.co.uk/whats-on'), 'leadmill.co.uk')
  assert.equal(linksToUs('<a href="https://www.theshowfinder.com/venues/x">Tickets</a>'), 'https://www.theshowfinder.com/venues/x')
  assert.equal(linksToUs('We are on theshowfinder.com'), null)
  assert.deepEqual(pagesToCheck('<a href="/whats-on">On</a><a href="https://other.com/events">x</a><a href="/menu">m</a>', 'https://leadmill.co.uk/'), ['https://leadmill.co.uk/whats-on'])
})

test('sending hours: weekdays 9 to 5 UK', () => {
  assert.equal(inSendingHours(new Date('2026-11-18T10:00:00Z')), true)    // Wed 10:00
  assert.equal(inSendingHours(new Date('2026-11-21T10:00:00Z')), false)   // Sat
  assert.equal(inSendingHours(new Date('2026-11-18T18:00:00Z')), false)   // 18:00
})
