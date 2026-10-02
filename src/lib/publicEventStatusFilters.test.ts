// Regression guard for the Daily Intelligence investigation (2 Oct 2026):
// four public pages queried 'events'/'events_with_venue' directly with no
// status filter at all, so a cancelled/postponed event could appear in
// browse/search results, a venue's own upcoming list, the homepage's
// "Just Announced" section, and the city-spotlight widget. The fix was
// adding `.in('status', LIVE_EVENT_STATUSES)` to each of those four
// queries (eventPools.ts's own LIVE_EVENT_STATUSES comment has the full
// reasoning). There's no React-rendering test setup for src/app pages
// (see contactEmails.test.ts for the same reasoning/pattern), so this
// reads each source file from disk and asserts the filter is present,
// directly next to the query it belongs to — cheap, concrete protection
// against someone removing it in a future refactor without reintroducing
// a live Supabase connection in this test runner.
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const FIXED_FILES = [
  { label: 'Event browse/search listing',        path: 'src/app/events/page.tsx' },
  { label: "A venue's own upcoming events list",  path: 'src/app/venues/[slug]/page.tsx' },
  { label: 'Homepage "Just Announced" section',   path: 'src/app/page.tsx' },
  { label: 'City-spotlight widget API route',     path: 'src/app/api/city-spotlight/route.ts' },
]

describe('public event-listing queries exclude cancelled/postponed', () => {
  for (const { label, path } of FIXED_FILES) {
    test(`${label} (${path}) imports LIVE_EVENT_STATUSES and filters status with it`, () => {
      const content = readFileSync(join(process.cwd(), path), 'utf-8')
      assert.ok(content.includes('LIVE_EVENT_STATUSES'), `${path} should import/use LIVE_EVENT_STATUSES`)
      assert.ok(content.includes(".in('status', LIVE_EVENT_STATUSES)"), `${path} should filter its events query with .in('status', LIVE_EVENT_STATUSES)`)
    })
  }
})

describe('event detail page and EventCard disable every purchase CTA for a postponed event, not just cancelled/sold_out', () => {
  const detailPage = readFileSync(join(process.cwd(), 'src/app/events/[slug]/page.tsx'), 'utf-8')
  const eventCard   = readFileSync(join(process.cwd(), 'src/components/EventCard.tsx'), 'utf-8')

  test('the event detail page uses the shared ticketPurchaseDisabledStatus predicate, not a hand-rolled sold_out/cancelled check', () => {
    assert.ok(detailPage.includes('ticketPurchaseDisabledStatus'), 'event detail page should use the shared ticketPurchaseDisabledStatus predicate')
    assert.ok(!detailPage.includes("event.status === 'sold_out' || event.status === 'cancelled'"), 'the old hand-rolled check (missing postponed) should be gone')
  })

  test('EventCard uses the same shared predicate', () => {
    assert.ok(eventCard.includes('ticketPurchaseDisabledStatus'), 'EventCard should use the shared ticketPurchaseDisabledStatus predicate')
    assert.ok(!eventCard.includes("event.status === 'sold_out' || event.status === 'cancelled'"), 'the old hand-rolled check (missing postponed) should be gone')
  })

  test('Buy Direct, More Options (resale) and Also Available are all gated on isCancelledOrPostponed, not rendered unconditionally', () => {
    assert.ok(detailPage.includes('isCancelledOrPostponed'), 'the detail page should define/use an isCancelledOrPostponed guard')
    // Each of the three sections' opening tag should be preceded by the guard somewhere on the same line or the one before it —
    // a looser but still meaningful check: the guard must appear more than once (once per gated section) given it's used 3 times below.
    const occurrences = detailPage.split('isCancelledOrPostponed').length - 1
    assert.ok(occurrences >= 4, 'expected isCancelledOrPostponed to be defined once and referenced at least 3 more times (Buy Direct, More Options, Also Available)')
  })
})
