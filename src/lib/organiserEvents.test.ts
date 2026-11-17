import test from 'node:test'
import assert from 'node:assert/strict'
import { validateSubmission, autoApproveCheck, hostOf, type SubmissionInput } from './organiserEvents.ts'

const cities = ['Derby', 'Nottingham', 'London']
const now = new Date('2026-11-17T12:00:00Z')
const base: SubmissionInput = {
  organiserName: 'Christmas Bliss', email: 'Hello@Bliss.co.uk ', website: '', title: 'Christmas Bliss Derby: 80s, 90s & 00s Party',
  category: 'concert', date: '2026-12-05', time: '19:00', venueName: 'The Old Bell Hotel', city: 'derby', postcode: 'de1 3ab',
  ticketUrl: 'https://www.eventbrite.co.uk/e/christmas-bliss-123', priceFrom: '£15', description: 'Dance the night away.',
}

test('a good submission is tidied', () => {
  const r = validateSubmission(base, cities, now)
  assert.equal(r.ok, true)
  if (!r.ok) return
  assert.equal(r.value.email, 'hello@bliss.co.uk')
  assert.equal(r.value.city, 'Derby')
  assert.equal(r.value.postcode, 'DE1 3AB')
  assert.equal(r.value.priceFrom, 15)
})

test('problems are explained', () => {
  assert.equal(validateSubmission({ ...base, date: '2026-01-01' }, cities, now).ok, false)
  assert.equal(validateSubmission({ ...base, city: 'Atlantis' }, cities, now).ok, false)
  assert.equal(validateSubmission({ ...base, ticketUrl: 'not a link' }, cities, now).ok, false)
  assert.equal(validateSubmission({ ...base, title: 'Party https://spam.example' }, cities, now).ok, false)
  assert.equal(validateSubmission({ ...base, date: '2029-01-01' }, cities, now).ok, false)
})

test('known ticket sites go live straight away; others wait for a look', () => {
  const ok = validateSubmission(base, cities, now)
  assert.ok(ok.ok)
  if (!ok.ok) return
  assert.equal(autoApproveCheck(ok.value).approve, true)
  assert.equal(autoApproveCheck({ ...ok.value, ticketUrl: 'https://random-site.example/tix' }).approve, false)
  assert.equal(autoApproveCheck({ ...ok.value, ticketUrl: 'https://thepub.co.uk/events', website: 'https://www.thepub.co.uk' }).approve, true)
  assert.equal(autoApproveCheck({ ...ok.value, title: 'Festival 2027 - Car Parking' }).approve, false)
  assert.equal(hostOf('https://www.Eventbrite.co.uk/e/1'), 'eventbrite.co.uk')
})
