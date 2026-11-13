import test from 'node:test'
import assert from 'node:assert/strict'
import { sellerFromUrl, emailTicketLink } from './emailTicketLink.ts'

test('known sellers go straight out, through our tracked hop', () => {
  assert.equal(sellerFromUrl('https://www.ticketmaster.co.uk/x/event/1'), 'tm')
  assert.equal(sellerFromUrl('https://www.seetickets.com/event/x'), 'st')
  assert.equal(sellerFromUrl('https://example.com/tickets'), null)
  assert.equal(sellerFromUrl('not a url'), null)
  const l = emailTicketLink('https://www.ticketmaster.co.uk/download-2027/event/360064BCA25E6857', 'email-follow')
  assert.ok(l)
  assert.match(l.href, /^https:\/\/www\.theshowfinder\.com\/out\/tm\?u=https%3A%2F%2Fwww\.ticketmaster\.co\.uk/)
  assert.match(l.href, /&s=email-follow&v=s$/)
  assert.equal(l.seller, 'Ticketmaster')
  assert.equal(emailTicketLink(null, 'x'), null)
  assert.equal(emailTicketLink('https://example.com', 'x'), null)
})
