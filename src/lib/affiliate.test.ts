// Phase 5A, requirement 6: this module had zero test coverage before —
// every ticket/affiliate button on the site (requirement 4's "Affiliate
// or ticket-link clicks") ultimately goes through one of these wrappers,
// so a regression here would silently send every click through broken
// or missing tracking. Pure functions, no imports — testable as-is with
// node --test like every other lib file in this phase.

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  getTicketmasterAffiliateLink,
  ticketmasterOutLink,
  getSeeTicketsAffiliateLink,
  isAwinTrackingLink,
  wrapWithEnvTemplate,
  getViagogoAffiliateLink,
  getEventimAffiliateLink,
  getStubHubAffiliateLink,
  getGigsbergAffiliateLink,
  getVividSeatsAffiliateLink,
  getEventbriteAffiliateLink,
  getSkiddleAffiliateLink,
  getSeatUniqueAffiliateLink,
} from './affiliate.ts'

describe('getTicketmasterAffiliateLink', () => {
  test('wraps the destination URL in the Impact tracking link with the right IDs', () => {
    const link = getTicketmasterAffiliateLink('https://www.ticketmaster.co.uk/event/123')
    assert.ok(link.startsWith('https://ticketmaster.evyy.net/c/7328658/1965662/24023?u='))
  })

  test('URL-encodes the destination so it survives as a single query value', () => {
    const link = getTicketmasterAffiliateLink('https://www.ticketmaster.co.uk/search?q=Donny Osmond')
    const encoded = link.split('?u=')[1]
    assert.equal(decodeURIComponent(encoded), 'https://www.ticketmaster.co.uk/search?q=Donny Osmond')
  })
})

describe('ticketmasterOutLink', () => {
  test('points at our own /out/tm hop, never at Impact', () => {
    const link = ticketmasterOutLink('https://www.ticketmaster.co.uk/event/123', 'evt-abc')
    assert.equal(link, '/out/tm?u=https%3A%2F%2Fwww.ticketmaster.co.uk%2Fevent%2F123&s=evt-abc')
    assert.ok(!link.includes('evyy.net'))
  })

  test('leaves the tag out when there is none, and cleans an unsafe one', () => {
    assert.ok(!ticketmasterOutLink('https://www.ticketmaster.co.uk/x').includes('&s='))
    assert.ok(ticketmasterOutLink('https://www.ticketmaster.co.uk/x', 'a b&c=d').endsWith('&s=a-b-c-d'))
  })

  test('absolute form is used for share buttons', () => {
    assert.ok(ticketmasterOutLink('https://www.ticketmaster.co.uk/x', undefined, true).startsWith('https://www.theshowfinder.com/out/tm?u='))
    assert.ok(ticketmasterOutLink('https://www.ticketmaster.co.uk/x', undefined, true).endsWith('&v=s'))
  })
})

describe('getSeeTicketsAffiliateLink', () => {
  test('wraps the destination URL in the Awin cread.php tracking link with the right IDs', () => {
    const link = getSeeTicketsAffiliateLink('https://www.seetickets.com/event/123')
    assert.ok(link.startsWith('https://www.awin1.com/cread.php?awinmid=7816&awinaffid=2896631&ued='))
  })

  test('URL-encodes the destination', () => {
    const link = getSeeTicketsAffiliateLink('https://www.seetickets.com/search?q=a&b=c')
    const encoded = link.split('ued=')[1]
    assert.equal(decodeURIComponent(encoded), 'https://www.seetickets.com/search?q=a&b=c')
  })

  test('returns a feed-supplied Awin pclick link unchanged — never nests one tracking link inside another', () => {
    const feedLink = 'https://www.awin1.com/pclick.php?p=45810948876&a=2896631&m=7816'
    assert.equal(getSeeTicketsAffiliateLink(feedLink), feedLink)
  })

  test('adds one event clickref to a feed-supplied Awin link without nesting tracking URLs', () => {
    const feedLink = 'https://www.awin1.com/pclick.php?p=45810948876&a=2896631&m=7816'
    const tracked = new URL(getSeeTicketsAffiliateLink(feedLink, 'evt-test-show'))
    assert.equal(tracked.pathname, '/pclick.php')
    assert.equal(tracked.searchParams.get('p'), '45810948876')
    assert.equal(tracked.searchParams.get('clickref'), 'evt-test-show')
    assert.equal(getSeeTicketsAffiliateLink(tracked.toString(), 'evt-test-show'), tracked.toString())
  })

  test('replaces an old clickref for a different event instead of adding a duplicate', () => {
    const feedLink = 'https://www.awin1.com/pclick.php?p=1&a=2896631&m=7816&clickref=old'
    const tracked = new URL(getSeeTicketsAffiliateLink(feedLink, 'evt-new'))
    assert.deepEqual(tracked.searchParams.getAll('clickref'), ['evt-new'])
  })

  test('returns an existing Awin cread link unchanged too (idempotent)', () => {
    const once = getSeeTicketsAffiliateLink('https://www.seetickets.com/event/123')
    assert.equal(getSeeTicketsAffiliateLink(once), once)
  })

  test('still wraps a plain seetickets.com URL that merely mentions awin1.com in its query string', () => {
    const link = getSeeTicketsAffiliateLink('https://www.seetickets.com/event/123?ref=https://www.awin1.com')
    assert.ok(link.startsWith('https://www.awin1.com/cread.php?'))
  })
})

describe('isAwinTrackingLink', () => {
  test('recognises awin1.com and its subdomains', () => {
    assert.equal(isAwinTrackingLink('https://www.awin1.com/pclick.php?p=1&a=2&m=3'), true)
    assert.equal(isAwinTrackingLink('https://awin1.com/cread.php?x=1'), true)
  })

  test('rejects other hosts, look-alikes, and malformed input without throwing', () => {
    assert.equal(isAwinTrackingLink('https://www.seetickets.com/event/1'), false)
    assert.equal(isAwinTrackingLink('https://notawin1.com/x'), false)
    assert.equal(isAwinTrackingLink('not a url'), false)
    assert.equal(isAwinTrackingLink(''), false)
  })
})

describe('wrapWithEnvTemplate', () => {
  const ENV_VAR = 'TEST_AFFILIATE_TEMPLATE'
  const original = process.env[ENV_VAR]

  test('returns the plain destination URL unchanged when the env var is not set', () => {
    delete process.env[ENV_VAR]
    assert.equal(wrapWithEnvTemplate('https://example.com/show', ENV_VAR), 'https://example.com/show')
  })

  test('substitutes the encoded destination into the template when the env var is set', () => {
    process.env[ENV_VAR] = 'https://prf.hn/click/camref:XXXXX/destination:{url}'
    const result = wrapWithEnvTemplate('https://example.com/show?q=a b', ENV_VAR)
    assert.equal(result, `https://prf.hn/click/camref:XXXXX/destination:${encodeURIComponent('https://example.com/show?q=a b')}`)
    process.env[ENV_VAR] = original
  })
})

describe('provider-specific env-template wrappers', () => {
  const cases: Array<[string, (url: string) => string, string]> = [
    ['VIAGOGO_AFFILIATE_TEMPLATE', getViagogoAffiliateLink, 'https://www.viagogo.co.uk/search?q=x'],
    ['EVENTIM_AFFILIATE_TEMPLATE', getEventimAffiliateLink, 'https://www.eventim.co.uk'],
    ['STUBHUB_AFFILIATE_TEMPLATE', getStubHubAffiliateLink, 'https://www.stubhub.co.uk/srp/?q=x'],
    ['VIVIDSEATS_AFFILIATE_TEMPLATE', getVividSeatsAffiliateLink, 'https://www.vividseats.com/search?searchTerm=x'],
    ['EVENTBRITE_AFFILIATE_TEMPLATE', getEventbriteAffiliateLink, 'https://www.eventbrite.co.uk/d/united-kingdom/x/'],
    ['SKIDDLE_AFFILIATE_TEMPLATE', getSkiddleAffiliateLink, 'https://www.skiddle.com'],
    ['SEATUNIQUE_AFFILIATE_TEMPLATE', getSeatUniqueAffiliateLink, 'https://www.seatunique.com/search?q=x'],
  ]

  for (const [envVar, fn, destination] of cases) {
    test(`${fn.name} returns the plain link untouched with no env var set (no affiliate programme approved yet)`, () => {
      delete process.env[envVar]
      assert.equal(fn(destination), destination)
    })

    test(`${fn.name} uses its own dedicated env var, not another provider's`, () => {
      const original = process.env[envVar]
      process.env[envVar] = 'https://tracked.example/{url}'
      assert.equal(fn(destination), `https://tracked.example/${encodeURIComponent(destination)}`)
      if (original === undefined) delete process.env[envVar]
      else process.env[envVar] = original
    })
  }
})


import { cleanSubId, isTicketmasterCommissionEligible } from './affiliate.ts'

describe('sub-IDs', () => {
  test('cleanSubId keeps safe characters only and caps at 50', () => {
    assert.equal(cleanSubId('evt-donny-osmond_hydro'), 'evt-donny-osmond_hydro')
    assert.equal(cleanSubId('a b&c=d?e'), 'a-b-c-d-e')
    assert.equal(cleanSubId('x'.repeat(80)).length, 50)
    assert.equal(cleanSubId(undefined), '')
  })
  test('Ticketmaster link gains subId1 only when a tag is given; See Tickets gains clickref', () => {
    assert.ok(!getTicketmasterAffiliateLink('https://www.ticketmaster.co.uk/x').includes('subId1'))
    assert.ok(getTicketmasterAffiliateLink('https://www.ticketmaster.co.uk/x', 'evt-abc').endsWith('&subId1=evt-abc'))
    assert.ok(getSeeTicketsAffiliateLink('https://www.seetickets.com/x', 'evt-abc').endsWith('&clickref=evt-abc'))
    assert.ok(!getSeeTicketsAffiliateLink('https://www.seetickets.com/x').includes('clickref'))
  })
})

describe('isTicketmasterCommissionEligible', () => {
  const at = (iso: string) => new Date(iso)
  test('no on-sale dates known -> eligible', () => {
    assert.equal(isTicketmasterCommissionEligible({}, at('2026-10-15T12:00:00Z')), true)
  })
  test('inside the first 24h of general on-sale -> not eligible; just after -> eligible', () => {
    const ev = { public_onsale_start: '2026-10-15T09:00:00Z' }
    assert.equal(isTicketmasterCommissionEligible(ev, at('2026-10-15T20:00:00Z')), false)
    assert.equal(isTicketmasterCommissionEligible(ev, at('2026-10-16T09:00:01Z')), true)
  })
  test('presale through the first 24h is one window; before presale opens is eligible', () => {
    const ev = { presale_start: '2026-10-13T09:00:00Z', public_onsale_start: '2026-10-15T09:00:00Z' }
    assert.equal(isTicketmasterCommissionEligible(ev, at('2026-10-12T09:00:00Z')), true)
    assert.equal(isTicketmasterCommissionEligible(ev, at('2026-10-14T09:00:00Z')), false)
    assert.equal(isTicketmasterCommissionEligible(ev, at('2026-10-16T08:00:00Z')), false)
    assert.equal(isTicketmasterCommissionEligible(ev, at('2026-10-16T10:00:00Z')), true)
  })
  test('falls back to onsale_date, and ignores unparseable dates', () => {
    assert.equal(isTicketmasterCommissionEligible({ onsale_date: '2026-10-15T09:00:00Z' }, at('2026-10-15T10:00:00Z')), false)
    assert.equal(isTicketmasterCommissionEligible({ public_onsale_start: 'nonsense' }, at('2026-10-15T10:00:00Z')), true)
  })
})


describe('getGigsbergAffiliateLink', () => {
  test('adds the affiliate tag to an untagged Gigsberg link', () => {
    assert.equal(
      getGigsbergAffiliateLink('https://gigsberg.com/tickets/tickets/tickets-tickets/show-123456'),
      'https://gigsberg.com/tickets/tickets/tickets-tickets/show-123456?aff=showfinder',
    )
  })

  test('keeps existing query parameters and appends the tag', () => {
    assert.equal(
      getGigsbergAffiliateLink('https://www.gigsberg.com/en/concert-tickets/x?lang=en'),
      'https://www.gigsberg.com/en/concert-tickets/x?lang=en&aff=showfinder',
    )
  })

  test('never tags a link twice', () => {
    const tagged = 'https://www.gigsberg.com/en/comedy-tickets/comedy/adam-rowe-tickets/show-1?aff=showfinder'
    assert.equal(getGigsbergAffiliateLink(tagged), tagged)
    assert.equal(getGigsbergAffiliateLink(getGigsbergAffiliateLink('https://gigsberg.com/x')), 'https://gigsberg.com/x?aff=showfinder')
  })

  test('leaves non-Gigsberg and malformed links alone', () => {
    assert.equal(getGigsbergAffiliateLink('https://www.viagogo.co.uk/x'), 'https://www.viagogo.co.uk/x')
    assert.equal(getGigsbergAffiliateLink('https://notgigsberg.com/x'), 'https://notgigsberg.com/x')
    assert.equal(getGigsbergAffiliateLink('not a url'), 'not a url')
  })
})
