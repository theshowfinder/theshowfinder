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
  getSeeTicketsAffiliateLink,
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
    ['GIGSBERG_AFFILIATE_TEMPLATE', getGigsbergAffiliateLink, 'https://www.gigsberg.com/tickets?q=x'],
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
