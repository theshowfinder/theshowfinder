import { test } from 'node:test'
import assert from 'node:assert/strict'
import { decideProviderOutbound, isAllowedDestination } from './outboundGuard.ts'

const page = 'https://www.theatreticketsdirect.co.uk/shows/500/the-book-of-mormon-tickets'
const browser = { method: 'GET', headers: { get: (n: string) => ({ 'user-agent': 'Mozilla/5.0 (Macintosh) AppleWebKit/537.36 Chrome/141 Safari/537.36', 'accept-language': 'en-GB', accept: 'text/html', 'sec-fetch-mode': 'navigate', 'sec-fetch-dest': 'document' } as Record<string, string>)[n.toLowerCase()] ?? null } }

test('Theatre Tickets Direct: only its own pages are accepted', () => {
  assert.ok(isAllowedDestination('td', page))
  assert.ok(!isAllowedDestination('td', 'https://evil.example.com/'))
})
test('a real click goes through our Awin link for advertiser 1936', () => {
  const d = decideProviderOutbound('td', browser as never, page, 'evt-x', true)
  assert.equal(d.kind, 'redirect')
  if (d.kind === 'redirect') {
    assert.ok(d.tracked)
    assert.match(d.location, /^https:\/\/www\.awin1\.com\/cread\.php\?awinmid=1936&awinaffid=2896631&ued=/)
  }
})
test('no click marker: plain page, no affiliate click', () => {
  const d = decideProviderOutbound('td', browser as never, page)
  assert.equal(d.kind, 'redirect')
  if (d.kind === 'redirect') { assert.equal(d.tracked, false); assert.equal(d.location, page) }
})
