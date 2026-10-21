import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { automatedRequestReason, isTicketmasterDestination } from './outboundGuard.ts'

const CHROME = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36'
const SAFARI_IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'

function req(headers: Record<string, string>, method = 'GET') {
  const lower: Record<string, string> = {}
  for (const [k, v] of Object.entries(headers)) lower[k.toLowerCase()] = v
  return { method, headers: { get: (n: string) => lower[n.toLowerCase()] ?? null } }
}

const person = { 'User-Agent': CHROME, 'Accept-Language': 'en-GB,en;q=0.9', 'Sec-Fetch-Mode': 'navigate', 'Sec-Fetch-Dest': 'document' }

describe('automatedRequestReason', () => {
  test('lets a person clicking a link in Chrome through', () => {
    assert.equal(automatedRequestReason(req(person)), null)
  })

  test('lets a phone browser through (no Sec-Fetch headers on older Safari)', () => {
    assert.equal(automatedRequestReason(req({ 'User-Agent': SAFARI_IOS, 'Accept-Language': 'en-GB' })), null)
  })

  test('blocks crawlers, AI crawlers, HTTP libraries and link previewers', () => {
    for (const ua of [
      'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
      'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)',
      'Mozilla/5.0 AppleWebKit/537.36 (compatible; GPTBot/1.1; +https://openai.com/gptbot)',
      'Mozilla/5.0 (compatible; AhrefsBot/7.0; +http://ahrefs.com/robot/)',
      'python-requests/2.31.0',
      'curl/8.4.0 something',
      'node-fetch/1.0 (+https://github.com/bitinn/node-fetch)',
      'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
      'WhatsApp/2.23.20 A',
      'Mozilla/5.0 (X11; Linux x86_64) HeadlessChrome/120.0.0.0 Safari/537.36',
      'Go-http-client/2.0 1234567',
      'meta-externalagent/1.1 (+https://developers.facebook.com/docs/sharing/webmasters/crawler)',
      'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; OAI-SearchBot/1.0; +https://openai.com/searchbot',
      'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot)',
      'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; ChatGPT-User/1.0; +https://openai.com/bot',
    ]) {
      assert.equal(automatedRequestReason(req({ ...person, 'User-Agent': ua })), 'automated-user-agent', ua)
    }
  })

  test('blocks a missing or tiny user-agent', () => {
    assert.equal(automatedRequestReason(req({ 'Accept-Language': 'en' })), 'no-user-agent')
    assert.equal(automatedRequestReason(req({ ...person, 'User-Agent': 'Mozilla' })), 'no-user-agent')
  })

  test('blocks HEAD and other non-GET methods', () => {
    assert.equal(automatedRequestReason(req(person, 'HEAD')), 'method')
    assert.equal(automatedRequestReason(req(person, 'POST')), 'method')
  })

  test('blocks fetches that are not a page navigation', () => {
    assert.equal(automatedRequestReason(req({ ...person, 'Sec-Fetch-Mode': 'cors' })), 'not-a-navigation')
    assert.equal(automatedRequestReason(req({ ...person, 'Sec-Fetch-Dest': 'image' })), 'not-a-document')
  })

  test('blocks browser prefetch and prerender', () => {
    assert.equal(automatedRequestReason(req({ ...person, 'Sec-Purpose': 'prefetch' })), 'prefetch')
    assert.equal(automatedRequestReason(req({ ...person, 'Purpose': 'prefetch' })), 'prefetch')
  })

  test('blocks a request with no Accept-Language', () => {
    assert.equal(automatedRequestReason(req({ 'User-Agent': CHROME, 'Sec-Fetch-Mode': 'navigate' })), 'no-accept-language')
  })
})

describe('isTicketmasterDestination', () => {
  test('accepts Ticketmaster UK / IE / COM pages', () => {
    assert.ok(isTicketmasterDestination('https://www.ticketmaster.co.uk/event/123'))
    assert.ok(isTicketmasterDestination('https://ticketmaster.co.uk/search?q=a'))
    assert.ok(isTicketmasterDestination('https://www.ticketmaster.ie/x'))
    assert.ok(isTicketmasterDestination('https://www.ticketmaster.com/x'))
  })

  test('rejects anything else, so it can never be an open redirect', () => {
    for (const bad of [
      '', null, undefined, 'not a url', 'javascript:alert(1)', 'https://evil.example/ticketmaster.co.uk',
      'https://ticketmaster.co.uk.evil.example/x', 'https://evilticketmaster.co.uk/x',
      'https://user:pw@www.ticketmaster.co.uk/x', 'https://www.viagogo.co.uk/x', '//evil.example', '/events/x',
    ]) {
      assert.equal(isTicketmasterDestination(bad as string | null | undefined), false, String(bad))
    }
  })
})
