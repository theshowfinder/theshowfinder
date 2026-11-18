import test from 'node:test'
import assert from 'node:assert/strict'
import { SELL_PAGES, sellPageBySlug } from './sellTicketsPages.ts'

test('sell pages: unique slugs, sensible lengths, no competitors named', () => {
  assert.equal(new Set(SELL_PAGES.map(p => p.slug)).size, SELL_PAGES.length)
  for (const p of SELL_PAGES) {
    assert.ok(p.title.length <= 65, p.title)
    assert.ok(p.description.length <= 160, p.description)
    assert.doesNotMatch(JSON.stringify(p), /eventbrite|ticketsource|skiddle|ticket tailor|\d%\s*\+/i)
  }
  assert.equal(sellPageBySlug('gigs')?.cta, 'paid')
})
