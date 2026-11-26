import test from 'node:test'
import assert from 'node:assert/strict'
import { parseMailboxes, warmupLimit, mailboxChannel } from './outreachMailboxes.ts'

test('mailboxes: parsed from OUTREACH_MAILBOXES, bad entries skipped', () => {
  assert.deepEqual(parseMailboxes(undefined), [])
  assert.deepEqual(parseMailboxes('not json'), [])
  const ms = parseMailboxes(JSON.stringify([
    { user: 'chris@showfinderpartners.co.uk', pass: 'x', host: 'smtp.zoho.eu', start: '2026-12-01' },
    { user: 'CHRIS@showfinderpartners.co.uk', pass: 'y', host: 'smtp.zoho.eu', start: '2026-12-01' },   // duplicate
    { user: 'no-at-sign', pass: 'x', host: 'h', start: '2026-12-01' },
    { user: 'a@b.co', pass: '', host: 'h', start: '2026-12-01' },
    { user: 'a@b.co', pass: 'p', host: 'h', start: 'soon' },
    { user: 'hello@getshowfinder.com', pass: 'p', host: 'smtp.gmail.com', start: '2026-12-02', max: 500, replyTo: 'partners@theshowfinder.com' },
  ]))
  assert.equal(ms.length, 2)
  assert.equal(ms[0].from, 'Chris at TheShowFinder <chris@showfinderpartners.co.uk>')
  assert.equal(ms[0].port, 465)
  assert.equal(ms[0].max, 40)
  assert.equal(ms[1].max, 60)   // capped
  assert.equal(ms[1].replyTo, 'partners@theshowfinder.com')
  assert.equal(mailboxChannel(ms[0]), 'mbx:chris@showfinderpartners.co.uk')
})

test('mailboxes: warm up over four weeks', () => {
  const m = { start: '2026-12-01', max: 40 }
  assert.equal(warmupLimit(m, new Date('2026-11-30T12:00:00Z')), 0)
  assert.equal(warmupLimit(m, new Date('2026-12-01T12:00:00Z')), 5)
  assert.equal(warmupLimit(m, new Date('2026-12-09T12:00:00Z')), 10)
  assert.equal(warmupLimit(m, new Date('2026-12-16T12:00:00Z')), 20)
  assert.equal(warmupLimit(m, new Date('2026-12-23T12:00:00Z')), 30)
  assert.equal(warmupLimit(m, new Date('2027-01-10T12:00:00Z')), 40)
  assert.equal(warmupLimit({ start: '2026-12-01', max: 8 }, new Date('2026-12-20T12:00:00Z')), 8)
})
