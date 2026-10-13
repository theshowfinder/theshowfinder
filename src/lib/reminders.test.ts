import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { canRemind, dueWindow, groupRemindersByEmail, type DueReminder } from './reminders.ts'
import { buildReminderEmail, reminderEventUrl } from './reminderEmail.ts'

const now = new Date('2026-10-13T06:10:00Z')

describe('canRemind', () => {
  test('future on-sale for an upcoming show', () => {
    assert.equal(canRemind('2026-10-14T08:00:00Z', 'upcoming', now), true)
  })
  test('not when already on sale, missing, cancelled or postponed', () => {
    assert.equal(canRemind('2026-10-12T08:00:00Z', 'upcoming', now), false)
    assert.equal(canRemind(null, 'upcoming', now), false)
    assert.equal(canRemind('2026-10-14T08:00:00Z', 'cancelled', now), false)
    assert.equal(canRemind('2026-10-14T08:00:00Z', 'postponed', now), false)
    assert.equal(canRemind('garbage', 'upcoming', now), false)
  })
})

describe('dueWindow', () => {
  test('covers the next 24 hours', () => {
    const w = dueWindow(now)
    assert.equal(w.fromISO, '2026-10-13T06:10:00.000Z')
    assert.equal(w.toISO, '2026-10-14T06:10:00.000Z')
  })
})

const row = (over: Partial<DueReminder>): DueReminder => ({
  id: 'r1', email: 'a@x.com', title: 'Nickelback', slug: 'nickelback-o2', onsaleISO: '2026-10-14T09:00:00Z',
  venueName: 'The O2', city: 'London', ...over,
})

describe('groupRemindersByEmail', () => {
  test('one batch per address (case-insensitive), soonest first', () => {
    const batches = groupRemindersByEmail([
      row({ id: '1', onsaleISO: '2026-10-14T10:00:00Z' }),
      row({ id: '2', email: 'A@X.com', onsaleISO: '2026-10-14T08:00:00Z', title: 'Will Young', slug: 'will-young' }),
      row({ id: '3', email: 'b@x.com' }),
    ])
    assert.equal(batches.length, 2)
    const a = batches.find(b => b.email === 'a@x.com')!
    assert.deepEqual(a.reminderIds, ['2', '1'])
  })
})

describe('buildReminderEmail', () => {
  test('single show: subject, London time with zone, own-site tracked link, escaped html', () => {
    const e = buildReminderEmail([row({ title: 'Hear\'Say & <b>X</b>' })])
    assert.equal(e.subject, "Tickets for Hear'Say & <b>X</b> go on sale soon")
    assert.ok(e.text.includes('On sale: Wed 14 Oct, 10:00 BST'))
    assert.ok(e.text.includes(reminderEventUrl('nickelback-o2')))
    assert.ok(e.html.includes('Hear&#39;Say') || e.html.includes("Hear'Say &amp; &lt;b&gt;X&lt;/b&gt;"))
    assert.ok(!e.html.includes('<b>X</b>'))
    assert.ok(e.html.includes('utm_source=reminder'))
  })
  test('several shows get a count subject', () => {
    const e = buildReminderEmail([row({}), row({ id: '2', slug: 'will-young', title: 'Will Young' })])
    assert.equal(e.subject, '2 shows you saved go on sale soon')
  })
})
