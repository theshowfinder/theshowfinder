import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  londonDayWindow,
  londonDaysAheadWindow,
  hasNoUsableTicketLink,
  isBareProviderHomepage,
  findBareProviderHomepages,
  isStaleUpcomingEvent,
  isCancelledOrPostponedButUpcoming,
  wasRecentlyChanged,
  isMajorTourAnnouncement,
  summarizeNewsQueue,
  newsCandidateDashboardStatus,
  STALE_SYNC_THRESHOLD_MS,
  RECENT_CHANGE_WINDOW_MS,
} from './intelligence.ts'

// ── UK timezone / date boundaries ────────────────────────────────────────

describe('londonDayWindow', () => {
  test('GMT (winter): midnight London IS midnight UTC', () => {
    // 15 Jan 2026 is firmly outside BST.
    const { startISO, endISO } = londonDayWindow(new Date('2026-01-15T10:00:00.000Z'))
    assert.equal(startISO, '2026-01-15T00:00:00.000Z')
    assert.equal(endISO, '2026-01-16T00:00:00.000Z')
  })

  test('BST (summer): midnight London is 23:00 UTC the previous day', () => {
    // 15 Jun 2026 is firmly inside BST (UTC+1).
    const { startISO, endISO } = londonDayWindow(new Date('2026-06-15T10:00:00.000Z'))
    assert.equal(startISO, '2026-06-14T23:00:00.000Z')
    assert.equal(endISO, '2026-06-15T23:00:00.000Z')
  })

  test('an event at 23:30 UTC in summer is still "today" in London (00:30 BST the next UK day)', () => {
    // 23:30 UTC on 14 Jun 2026 is 00:30 BST on 15 Jun — i.e. "now" from
    // London's perspective is the 15th, not the 14th a naive UTC-midnight
    // boundary would assume.
    const now = new Date('2026-06-14T23:30:00.000Z')
    const { startISO, endISO } = londonDayWindow(now)
    assert.equal(startISO, '2026-06-14T23:00:00.000Z') // = 15 Jun 00:00 BST
    assert.equal(endISO, '2026-06-15T23:00:00.000Z')   // = 16 Jun 00:00 BST
    assert.ok(new Date(startISO).getTime() <= now.getTime())
    assert.ok(now.getTime() < new Date(endISO).getTime())
  })

  test('just before UK midnight and just after both resolve to the correct, different UK days', () => {
    const lateEvening = londonDayWindow(new Date('2026-01-15T23:59:00.000Z'))
    const earlyNextDay = londonDayWindow(new Date('2026-01-16T00:01:00.000Z'))
    assert.equal(lateEvening.startISO, '2026-01-15T00:00:00.000Z')
    assert.equal(earlyNextDay.startISO, '2026-01-16T00:00:00.000Z')
  })
})

describe('londonDaysAheadWindow', () => {
  test('spans exactly N London calendar days from today', () => {
    const { startISO, endISO } = londonDaysAheadWindow(new Date('2026-01-15T10:00:00.000Z'), 7)
    assert.equal(startISO, '2026-01-15T00:00:00.000Z')
    assert.equal(endISO, '2026-01-22T00:00:00.000Z')
  })

  test('crossing the BST start (clocks go forward) still spans 7 real London days', () => {
    // UK clocks went forward on 29 Mar 2026. A window starting a few days
    // before should still land exactly 7 London calendar days later.
    const { startISO, endISO } = londonDaysAheadWindow(new Date('2026-03-26T10:00:00.000Z'), 7)
    assert.equal(startISO, '2026-03-26T00:00:00.000Z') // still GMT
    assert.equal(endISO, '2026-04-01T23:00:00.000Z')   // now BST (UTC+1)
  })
})

// ── Quality checks: missing-link detection ───────────────────────────────

describe('hasNoUsableTicketLink', () => {
  test('flags an event with neither tickets_url nor own_ticket_url', () => {
    assert.equal(hasNoUsableTicketLink({ tickets_url: null, own_ticket_url: null }), true)
  })

  test('does not flag an event with a Ticketmaster URL', () => {
    assert.equal(hasNoUsableTicketLink({ tickets_url: 'https://ticketmaster.co.uk/x', own_ticket_url: null }), false)
  })

  test('does not flag an event with only an own_ticket_url (local/manual event)', () => {
    assert.equal(hasNoUsableTicketLink({ tickets_url: null, own_ticket_url: 'https://venue.example/tickets' }), false)
  })

  test('does not flag an event with an empty-string URL treated as falsy... actually empty string IS falsy', () => {
    // Guard against a blank string in the DB silently passing as "has a link".
    assert.equal(hasNoUsableTicketLink({ tickets_url: '', own_ticket_url: '' }), true)
  })
})

describe('isBareProviderHomepage', () => {
  test('flags the exact bare Eventim homepage', () => {
    assert.equal(isBareProviderHomepage('https://www.eventim.co.uk'), true)
  })

  test('flags the bare homepage with a trailing slash', () => {
    assert.equal(isBareProviderHomepage('https://www.eventim.co.uk/'), true)
  })

  test('flags the bare homepage with a query string', () => {
    assert.equal(isBareProviderHomepage('https://www.skiddle.com?ref=x'), true)
  })

  test('does not flag a real artist-specific search URL', () => {
    assert.equal(isBareProviderHomepage('https://www.eventim.co.uk/search?q=Oasis'), false)
  })

  test('does not flag null', () => {
    assert.equal(isBareProviderHomepage(null), false)
  })

  test('does not flag a malformed URL (fails closed, never throws)', () => {
    assert.equal(isBareProviderHomepage('not a url'), false)
  })
})

describe('findBareProviderHomepages', () => {
  const baseArtist = {
    name: 'Example Artist',
    eventim_url: null, axs_url: null, gigantic_url: null, see_tickets_url: null,
    viagogo_url: null, stubhub_url: null, gigsberg_url: null, vivid_seats_url: null,
  }

  test('finds every bare-homepage provider link on an artist', () => {
    const findings = findBareProviderHomepages([
      { ...baseArtist, eventim_url: 'https://www.eventim.co.uk', viagogo_url: 'https://www.viagogo.co.uk/ww/SearchResults?q=Oasis' },
    ])
    assert.equal(findings.length, 1)
    assert.equal(findings[0].provider, 'Eventim')
    assert.equal(findings[0].artistName, 'Example Artist')
  })

  test('returns nothing for an artist with only real search links', () => {
    const findings = findBareProviderHomepages([
      { ...baseArtist, eventim_url: 'https://www.eventim.co.uk/search?q=Example' },
    ])
    assert.equal(findings.length, 0)
  })

  test('scans every artist in the list', () => {
    const findings = findBareProviderHomepages([
      { ...baseArtist, name: 'A', axs_url: 'https://www.axs.com' },
      { ...baseArtist, name: 'B' },
      { ...baseArtist, name: 'C', gigantic_url: 'https://www.gigantic.com/' },
    ])
    assert.deepEqual(findings.map(f => f.artistName).sort(), ['A', 'C'])
  })
})

// ── Quality checks: staleness / status ───────────────────────────────────

describe('isStaleUpcomingEvent', () => {
  const now = new Date('2026-06-15T12:00:00.000Z').getTime()

  test('flags a Ticketmaster event not synced in over the threshold', () => {
    const lastSynced = new Date(now - STALE_SYNC_THRESHOLD_MS - 1000).toISOString()
    assert.equal(isStaleUpcomingEvent({
      title: 'x', start_date: '2026-07-01T00:00:00.000Z', status: 'upcoming',
      last_synced_at: lastSynced, ticketmaster_id: 'tm-1',
    }, now), true)
  })

  test('does not flag a recently-synced Ticketmaster event', () => {
    const lastSynced = new Date(now - 1000).toISOString()
    assert.equal(isStaleUpcomingEvent({
      title: 'x', start_date: '2026-07-01T00:00:00.000Z', status: 'upcoming',
      last_synced_at: lastSynced, ticketmaster_id: 'tm-1',
    }, now), false)
  })

  test('does not flag a manually-added local event (no ticketmaster_id)', () => {
    assert.equal(isStaleUpcomingEvent({
      title: 'x', start_date: '2026-07-01T00:00:00.000Z', status: 'upcoming',
      last_synced_at: null, ticketmaster_id: null,
    }, now), false)
  })

  test('does not flag a past event', () => {
    assert.equal(isStaleUpcomingEvent({
      title: 'x', start_date: '2026-01-01T00:00:00.000Z', status: 'upcoming',
      last_synced_at: null, ticketmaster_id: 'tm-1',
    }, now), false)
  })

  test('flags a Ticketmaster event that has never been synced', () => {
    assert.equal(isStaleUpcomingEvent({
      title: 'x', start_date: '2026-07-01T00:00:00.000Z', status: 'upcoming',
      last_synced_at: null, ticketmaster_id: 'tm-1',
    }, now), true)
  })
})

describe('isCancelledOrPostponedButUpcoming', () => {
  const now = new Date('2026-06-15T12:00:00.000Z').getTime()

  test('flags an upcoming cancelled event', () => {
    assert.equal(isCancelledOrPostponedButUpcoming({ start_date: '2026-07-01T00:00:00.000Z', status: 'cancelled' }, now), true)
  })

  test('flags an upcoming postponed event', () => {
    assert.equal(isCancelledOrPostponedButUpcoming({ start_date: '2026-07-01T00:00:00.000Z', status: 'postponed' }, now), true)
  })

  test('does not flag a past cancelled event', () => {
    assert.equal(isCancelledOrPostponedButUpcoming({ start_date: '2026-01-01T00:00:00.000Z', status: 'cancelled' }, now), false)
  })

  test('does not flag an upcoming on-sale event', () => {
    assert.equal(isCancelledOrPostponedButUpcoming({ start_date: '2026-07-01T00:00:00.000Z', status: 'on_sale' }, now), false)
  })
})

describe('wasRecentlyChanged', () => {
  const now = new Date('2026-06-15T12:00:00.000Z').getTime()

  test('does not flag a freshly-inserted row (updated_at === created_at)', () => {
    const t = new Date(now - 1000).toISOString()
    assert.equal(wasRecentlyChanged({ created_at: t, updated_at: t }, now), false)
  })

  test('flags a row edited well after its creation, within the recent window', () => {
    const created = new Date(now - RECENT_CHANGE_WINDOW_MS).toISOString()
    const updated = new Date(now - 1000).toISOString()
    assert.equal(wasRecentlyChanged({ created_at: created, updated_at: updated }, now), true)
  })

  test('does not flag a row last edited outside the recent window', () => {
    const created = new Date(now - RECENT_CHANGE_WINDOW_MS * 5).toISOString()
    const updated = new Date(now - RECENT_CHANGE_WINDOW_MS - 1000).toISOString()
    assert.equal(wasRecentlyChanged({ created_at: created, updated_at: updated }, now), false)
  })
})

describe('isMajorTourAnnouncement', () => {
  const now = new Date('2026-06-15T12:00:00.000Z').getTime()
  const comingUpWindowEnd = '2026-06-22T00:00:00.000Z' // now + 7 days

  test('flags a brand-new artist row regardless of featured/onsale status', () => {
    assert.equal(isMajorTourAnnouncement({
      created_at: new Date(now - 1000).toISOString(), is_featured: false, onsale_date: null,
    }, now, comingUpWindowEnd), true)
  })

  test('flags a featured artist with an onsale date beyond the 7-day window but within lookahead', () => {
    assert.equal(isMajorTourAnnouncement({
      created_at: new Date(now - 365 * 24 * 60 * 60 * 1000).toISOString(),
      is_featured: true,
      onsale_date: '2026-07-01T00:00:00.000Z', // beyond comingUpWindowEnd, within 60d
    }, now, comingUpWindowEnd), true)
  })

  test('does not flag a featured artist whose onsale falls inside the 7-day Coming Up window (avoids duplicate signal)', () => {
    assert.equal(isMajorTourAnnouncement({
      created_at: new Date(now - 365 * 24 * 60 * 60 * 1000).toISOString(),
      is_featured: true,
      onsale_date: '2026-06-18T00:00:00.000Z', // inside the 7-day window
    }, now, comingUpWindowEnd), false)
  })

  test('does not flag a non-featured old artist with a future onsale', () => {
    assert.equal(isMajorTourAnnouncement({
      created_at: new Date(now - 365 * 24 * 60 * 60 * 1000).toISOString(),
      is_featured: false,
      onsale_date: '2026-07-01T00:00:00.000Z',
    }, now, comingUpWindowEnd), false)
  })

  test('does not flag a featured artist whose onsale is too far out (beyond the lookahead)', () => {
    assert.equal(isMajorTourAnnouncement({
      created_at: new Date(now - 365 * 24 * 60 * 60 * 1000).toISOString(),
      is_featured: true,
      onsale_date: '2027-06-01T00:00:00.000Z',
    }, now, comingUpWindowEnd), false)
  })
})

// ── News queue counts ─────────────────────────────────────────────────────

describe('summarizeNewsQueue', () => {
  const noDest = () => false
  const yesDest = () => true

  test('counts pending candidates', () => {
    const counts = summarizeNewsQueue([
      { review_status: 'pending', priority: 'normal', intake_method: 'manual', ai_review_status: 'not_applicable' },
      { review_status: 'approved', priority: 'normal', intake_method: 'manual', ai_review_status: 'not_applicable' },
    ], noDest)
    assert.equal(counts.pending, 1)
  })

  test('counts high-priority candidates only among pending/approved, not published/rejected', () => {
    const counts = summarizeNewsQueue([
      { review_status: 'pending',   priority: 'high', intake_method: 'manual', ai_review_status: 'not_applicable' },
      { review_status: 'approved',  priority: 'high', intake_method: 'manual', ai_review_status: 'not_applicable' },
      { review_status: 'published', priority: 'high', intake_method: 'manual', ai_review_status: 'not_applicable' },
      { review_status: 'rejected',  priority: 'high', intake_method: 'manual', ai_review_status: 'not_applicable' },
    ], noDest)
    assert.equal(counts.highPriority, 2)
  })

  test('counts unreviewed URL imports (pending + url_import only)', () => {
    const counts = summarizeNewsQueue([
      { review_status: 'pending',  priority: 'normal', intake_method: 'url_import', ai_review_status: 'unreviewed' },
      { review_status: 'approved', priority: 'normal', intake_method: 'url_import', ai_review_status: 'unreviewed' },
      { review_status: 'pending',  priority: 'normal', intake_method: 'manual',     ai_review_status: 'not_applicable' },
    ], noDest)
    assert.equal(counts.unreviewedUrlImports, 1)
  })

  test('counts AI suggestions awaiting review via ai_review_status alone', () => {
    const counts = summarizeNewsQueue([
      { review_status: 'approved', priority: 'normal', intake_method: 'url_import', ai_review_status: 'unreviewed' },
      { review_status: 'pending',  priority: 'normal', intake_method: 'manual',     ai_review_status: 'not_applicable' },
    ], noDest)
    assert.equal(counts.aiAwaitingReview, 1)
  })

  test('counts missing-destination candidates using the caller-supplied predicate', () => {
    const candidates = [
      { review_status: 'pending',   priority: 'normal', intake_method: 'manual', ai_review_status: 'not_applicable' },
      { review_status: 'published', priority: 'normal', intake_method: 'manual', ai_review_status: 'not_applicable' },
    ]
    assert.equal(summarizeNewsQueue(candidates, yesDest).missingDestination, 1) // only the pending one counts
    assert.equal(summarizeNewsQueue(candidates, noDest).missingDestination, 0)
  })

  test('all-zero counts for an empty queue', () => {
    const counts = summarizeNewsQueue([], noDest)
    assert.deepEqual(counts, { pending: 0, highPriority: 0, unreviewedUrlImports: 0, aiAwaitingReview: 0, missingDestination: 0 })
  })
})

describe('newsCandidateDashboardStatus', () => {
  test('published always wins', () => {
    assert.equal(newsCandidateDashboardStatus({ review_status: 'published', intake_method: 'manual', ai_review_status: 'not_applicable' }, true), 'published')
  })

  test('rejected is always blocked', () => {
    assert.equal(newsCandidateDashboardStatus({ review_status: 'rejected', intake_method: 'manual', ai_review_status: 'not_applicable' }, false), 'blocked')
  })

  test('a blocking issue overrides approved/pending into blocked', () => {
    assert.equal(newsCandidateDashboardStatus({ review_status: 'approved', intake_method: 'manual', ai_review_status: 'not_applicable' }, true), 'blocked')
  })

  test('approved with no blocking issue is approved', () => {
    assert.equal(newsCandidateDashboardStatus({ review_status: 'approved', intake_method: 'manual', ai_review_status: 'not_applicable' }, false), 'approved')
  })

  test('a pending, unreviewed-AI url_import is "discovered"', () => {
    assert.equal(newsCandidateDashboardStatus({ review_status: 'pending', intake_method: 'url_import', ai_review_status: 'unreviewed' }, false), 'discovered')
  })

  test('a pending manual candidate is "needs_review"', () => {
    assert.equal(newsCandidateDashboardStatus({ review_status: 'pending', intake_method: 'manual', ai_review_status: 'not_applicable' }, false), 'needs_review')
  })
})
