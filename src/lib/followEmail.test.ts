import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { buildFollowAlertEmail, buildFollowConfirmEmail, followShowUrl, followTargetUrl } from './followEmail.ts'
import type { FollowAlertBatch } from './follows.ts'

const UNSUB = 'https://www.theshowfinder.com/unsubscribe?email=a%40x.com'
const batch: FollowAlertBatch = {
  email: 'a@x.com',
  totalShows: 2,
  items: [{
    followId: 'f1', kind: 'artist', name: 'Nickelback & Friends', slug: 'nickelback',
    shows: [
      { id: '1', slug: 'nb-o2', title: 'Nickelback', startISO: '2027-03-01T19:30:00Z', createdISO: '', venueId: null, venueName: 'The O2', city: 'London', artistIds: [] },
      { id: '2', slug: 'nb-hydro', title: 'Nickelback <live>', startISO: '2027-03-03T19:30:00Z', createdISO: '', venueId: null, venueName: null, city: 'Glasgow', artistIds: [] },
    ],
    more: 2,
  }],
}

describe('follow alert email', () => {
  test('subject names the artist and counts shows', () => {
    assert.equal(buildFollowAlertEmail(batch, UNSUB).subject, '2 new shows added for Nickelback & Friends')
  })
  test('single show subject', () => {
    const one: FollowAlertBatch = { ...batch, totalShows: 1, items: [{ ...batch.items[0], shows: [batch.items[0].shows[0]], more: 0 }] }
    assert.equal(buildFollowAlertEmail(one, UNSUB).subject, 'New show added: Nickelback & Friends')
  })
  test('several follows are summarised in the subject', () => {
    const two: FollowAlertBatch = { ...batch, items: [batch.items[0], { ...batch.items[0], followId: 'f2', name: 'The O2', kind: 'venue' }] }
    assert.match(buildFollowAlertEmail(two, UNSUB).subject, /Nickelback & Friends and The O2/)
  })
  test('links go to our own pages with tracking, and the unsubscribe link is present', () => {
    const mail = buildFollowAlertEmail(batch, UNSUB)
    assert.ok(mail.html.includes(followShowUrl('nb-o2')))
    assert.ok(mail.html.includes(followTargetUrl('artist', 'nickelback')))
    assert.ok(mail.html.includes('Stop these emails'))
    assert.ok(mail.text.includes(UNSUB))
    assert.match(mail.html, /\+ 2 more shows/)
    assert.match(followShowUrl('x'), /utm_source=follow/)
  })
  test('user-controlled text is escaped in the html', () => {
    const mail = buildFollowAlertEmail(batch, UNSUB)
    assert.ok(mail.html.includes('Nickelback &lt;live&gt;'))
    assert.ok(!mail.html.includes('<live>'))
    assert.ok(mail.html.includes('Nickelback &amp; Friends'))
  })
  test('times are London time', () => {
    assert.match(buildFollowAlertEmail(batch, UNSUB).text, /Mon 1 Mar, 19:30 GMT/)
  })
})

describe('follow confirmation email', () => {
  test('says what they follow and how to stop', () => {
    const mail = buildFollowConfirmEmail('The O2', 'venue', 'the-o2', UNSUB)
    assert.equal(mail.subject, "You're following The O2")
    assert.match(mail.text, /new shows are added at this venue/)
    assert.ok(mail.text.includes(UNSUB))
    assert.ok(mail.html.includes(followTargetUrl('venue', 'the-o2')))
  })
})
