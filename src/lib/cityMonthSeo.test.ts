import test from 'node:test'
import assert from 'node:assert/strict'
import { parseMonthSlug, upcomingMonths, monthState, monthWindow, londonMonthStart, spreadAcrossDays, categorySummary, monthTitle } from './cityMonthSeo.ts'

const nov = new Date('2026-11-18T12:00:00Z')

test('slugs and months ahead', () => {
  assert.deepEqual(parseMonthSlug('december-2026'), { year: 2026, month: 11, slug: 'december-2026', label: 'December 2026', short: 'Dec' })
  assert.equal(parseMonthSlug('concerts'), null)
  assert.equal(parseMonthSlug('smarch-2026'), null)
  const ahead = upcomingMonths(nov)
  assert.equal(ahead.length, 12)
  assert.equal(ahead[0].slug, 'november-2026')
  assert.equal(ahead[11].slug, 'october-2027')
  assert.equal(monthState(parseMonthSlug('october-2026')!, nov), 'past')
  assert.equal(monthState(parseMonthSlug('november-2027')!, nov), 'too-far')
  assert.equal(monthState(parseMonthSlug('march-2027')!, nov), 'live')
})

test('windows are London months, current month from now', () => {
  assert.equal(londonMonthStart(2027, 5).toISOString(), '2027-05-31T23:00:00.000Z')   // 1 June BST
  assert.equal(londonMonthStart(2026, 11).toISOString(), '2026-12-01T00:00:00.000Z')
  assert.deepEqual(monthWindow(parseMonthSlug('november-2026')!, nov), { from: nov.toISOString(), to: '2026-12-01T00:00:00.000Z' })
})

test('spread across days, summary, title', () => {
  const runs = [...Array(10)].map((_, i) => ({ first: { start_date: `2026-12-01T${String(10 + i).padStart(2, '0')}:00:00Z` } }))
    .concat([{ first: { start_date: '2026-12-20T19:00:00Z' } }])
  const picked = spreadAcrossDays(runs, 4)
  assert.equal(picked.length, 4)
  assert.ok(picked.some(r => r.first.start_date.startsWith('2026-12-20')))
  assert.equal(categorySummary([['concerts', 42], ['comedy shows', 18], ['theatre shows', 30], ['sports events', 2]]), '42 concerts, 30 theatre shows and 18 comedy shows')
  assert.equal(monthTitle('Leeds', parseMonthSlug('december-2026')!), "What's On in Leeds in December 2026: Events & Tickets")
})
