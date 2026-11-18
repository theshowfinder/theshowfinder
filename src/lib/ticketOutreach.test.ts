import test from 'node:test'
import assert from 'node:assert/strict'
import { buildTicketEmail, type TicketProspect } from './ticketOutreach.ts'

const p: TicketProspect = { id: '1', name: 'Seed Talks', city: 'London', email: 'hello@seedtalks.co.uk', sample_event: 'Seed Talks: Future Cities', sample_venue: 'The Book Club', events_seen: 6, unsubscribe_token: 'tok' }

test('paid tickets live: ticketing-first email', () => {
  const e = buildTicketEmail(p, 'first', true)
  assert.equal(e.subject, 'Selling tickets for Seed Talks: keep 100% of your price')
  assert.match(e.text, /keep 100% of your ticket price/)
  assert.match(e.text, /list-your-event\?ticketing=paid/)
  assert.match(e.text, /unsubscribe\/tok/)
  assert.doesNotMatch(e.text, /eventbrite|skiddle|ticketsource|\d%\s*\+/i)
})

test('paid tickets not live yet: never promises paid sales', () => {
  const e = buildTicketEmail(p, 'first', false)
  assert.equal(e.subject, 'Free listings and free tickets for Seed Talks')
  assert.doesNotMatch(e.text, /keep 100%|paid as you sell|ticketing=paid/)
  assert.match(e.text, /free tickets/)
  assert.equal(buildTicketEmail(p, 'follow_up', false).subject, 'Re: Free listings and free tickets for Seed Talks')
})
