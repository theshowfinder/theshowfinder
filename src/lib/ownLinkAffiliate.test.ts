import { test } from 'node:test'
import assert from 'node:assert/strict'
import { monetisedOwnLink, sellerPage } from './ownLinkAffiliate.ts'

test("another partner's Impact Ticketmaster link goes through our hop", () => {
  const theirs = 'https://ticketmaster.evyy.net/c/4066575/1965662/24023?u=' + encodeURIComponent('https://www.ticketmaster.co.uk/event/1F006')
  assert.deepEqual(sellerPage(theirs), { provider: 'tm', page: 'https://www.ticketmaster.co.uk/event/1F006' })
  assert.equal(monetisedOwnLink(theirs), '/out/tm?u=' + encodeURIComponent('https://www.ticketmaster.co.uk/event/1F006'))
})
test('plain Ticketmaster and See Tickets pages go through our hop', () => {
  assert.match(monetisedOwnLink('https://www.ticketmaster.co.uk/x/event/1')!, /^\/out\/tm\?u=/)
  assert.match(monetisedOwnLink('https://theatre.ticketmaster.co.uk/x')!, /^\/out\/tm\?u=/)
  assert.match(monetisedOwnLink('https://www.seetickets.com/event/x/1')!, /^\/out\/st\?u=/)
  const awin = 'https://www.awin1.com/cread.php?awinmid=7816&awinaffid=999&ued=' + encodeURIComponent('https://www.seetickets.com/event/y/2')
  assert.equal(sellerPage(awin)?.page, 'https://www.seetickets.com/event/y/2')
})
test('everything else is left alone', () => {
  assert.equal(monetisedOwnLink('https://www.visitbristol.co.uk/event/abc'), 'https://www.visitbristol.co.uk/event/abc')
  assert.equal(monetisedOwnLink('https://fever.pxf.io/abc?u=https%3A%2F%2Ffeverup.com'), 'https://fever.pxf.io/abc?u=https%3A%2F%2Ffeverup.com')
  assert.equal(monetisedOwnLink('not a url'), 'not a url')
  assert.equal(monetisedOwnLink(null), null)
})
