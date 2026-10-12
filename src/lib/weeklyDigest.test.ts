import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  digestWeekKey, digestCampaignId, digestLink, digestSubject, hasEnoughContent,
  resolveDigestMode, resolvePreviewRecipient, digestMarkerSubject, limitDigestContent,
  DEFAULT_PREVIEW_EMAIL, type DigestContent,
} from './weeklyDigest.ts'

const item = (n: number) => ({ name: `Act ${n}`, slug: `act-${n}`, dateCount: 2, whenLabel: 'Fri 9 Oct 09:00 GMT', saleType: 'onsale' as const })
const ev = (n: number) => ({ title: `Ev ${n}`, slug: `ev-${n}`, startDate: '2026-10-14T19:00:00Z', venueName: 'V', venueCity: 'C' })
const show = (n: number) => ({ title: `Show ${n}`, venueName: 'V', slug: `show-${n}`, nextDate: '2026-10-14' })
const empty: DigestContent = { onSale: [], events: [], shows: [] }

describe('digestWeekKey', () => {
  test('uses the UK calendar date', () => {
    assert.equal(digestWeekKey(new Date('2026-10-12T07:00:00Z')), '2026-10-12')
  })
  test('late evening UTC in summer is already the next day in the UK', () => {
    assert.equal(digestWeekKey(new Date('2026-07-12T23:30:00Z')), '2026-07-13')
  })
})

describe('digestLink', () => {
  test('tags site paths for GA4', () => {
    const u = new URL(digestLink('/on-sale-this-week/coldplay', '2026-10-12', 'on-sale'))
    assert.equal(u.origin + u.pathname, 'https://www.theshowfinder.com/on-sale-this-week/coldplay')
    assert.equal(u.searchParams.get('utm_source'), 'newsletter')
    assert.equal(u.searchParams.get('utm_medium'), 'email')
    assert.equal(u.searchParams.get('utm_campaign'), digestCampaignId('2026-10-12'))
    assert.equal(u.searchParams.get('utm_content'), 'on-sale')
  })
  test('accepts a path without a leading slash', () => {
    assert.ok(digestLink('events/x', '2026-10-12', 'a').startsWith('https://www.theshowfinder.com/events/x?'))
  })
})

describe('digestSubject', () => {
  test('leads with the top on-sale act and counts the rest', () => {
    assert.equal(digestSubject({ ...empty, onSale: [item(1), item(2), item(3)] }), 'Act 1 on sale + 2 more on sale this week')
  })
  test('single act', () => {
    assert.equal(digestSubject({ ...empty, onSale: [item(1)] }), 'Act 1 on sale this week')
  })
  test('presale wording', () => {
    assert.equal(digestSubject({ ...empty, onSale: [{ ...item(1), saleType: 'presale' }] }), 'Act 1 presale this week')
  })
  test('falls back to a West End show, then a generic subject', () => {
    assert.equal(digestSubject({ ...empty, shows: [show(1)] }), 'This week: Show 1 and more UK shows')
    assert.equal(digestSubject(empty), 'This week on TheShowFinder')
  })
})

describe('hasEnoughContent', () => {
  test('needs at least three items across sections', () => {
    assert.equal(hasEnoughContent(empty), false)
    assert.equal(hasEnoughContent({ onSale: [item(1)], events: [ev(1)], shows: [] }), false)
    assert.equal(hasEnoughContent({ onSale: [item(1)], events: [ev(1)], shows: [show(1)] }), true)
  })
})

describe('resolveDigestMode', () => {
  test('only the exact string "true" goes live', () => {
    assert.equal(resolveDigestMode('true'), 'live')
    for (const v of [undefined, null, '', 'TRUE', '1', 'yes', 'false', ' true']) {
      assert.equal(resolveDigestMode(v as string | undefined), 'preview')
    }
  })
})

describe('resolvePreviewRecipient', () => {
  test('uses a valid-looking configured address, lowercased', () => {
    assert.equal(resolvePreviewRecipient(' Me@Example.com '), 'me@example.com')
  })
  test('falls back to the default', () => {
    assert.equal(resolvePreviewRecipient(undefined), DEFAULT_PREVIEW_EMAIL)
    assert.equal(resolvePreviewRecipient('not-an-email'), DEFAULT_PREVIEW_EMAIL)
  })
})

describe('digestMarkerSubject / limitDigestContent', () => {
  test('marker subject is keyed by week', () => {
    assert.equal(digestMarkerSubject('2026-10-12'), 'Weekly digest 2026-10-12')
  })
  test('caps each section', () => {
    const big: DigestContent = {
      onSale: Array.from({ length: 12 }, (_, i) => item(i)),
      events: Array.from({ length: 12 }, (_, i) => ev(i)),
      shows: Array.from({ length: 12 }, (_, i) => show(i)),
    }
    const l = limitDigestContent(big)
    assert.deepEqual([l.onSale.length, l.events.length, l.shows.length], [6, 6, 3])
  })
})
