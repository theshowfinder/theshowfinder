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

test('any UK town can list, not only our cities', () => {
  const r = validateSubmission({ ...base, city: 'ilkeston', postcode: 'de75rp' }, cities, now)
  assert.equal(r.ok, true)
  if (!r.ok) return
  assert.equal(r.value.city, 'Ilkeston')
  assert.equal(r.value.postcode, 'DE7 5RP')
})

test('problems are explained', () => {
  assert.equal(validateSubmission({ ...base, date: '2026-01-01' }, cities, now).ok, false)
  assert.equal(validateSubmission({ ...base, city: '' }, cities, now).ok, false)
  assert.equal(validateSubmission({ ...base, postcode: '' }, cities, now).ok, false)
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

test('free tickets through TheShowFinder need no ticket link', () => {
  const free = validateSubmission({ ...base, ticketUrl: '', ticketing: 'free', freeCapacity: '150' }, cities, now)
  assert.ok(free.ok)
  if (free.ok) {
    assert.equal(free.value.freeCapacity, 150)
    assert.equal(free.value.ticketUrl, null)
    assert.equal(free.value.priceFrom, 0)
    assert.equal(autoApproveCheck(free.value).approve, true)
  }
  assert.equal(validateSubmission({ ...base, ticketUrl: '', ticketing: 'free', freeCapacity: '0' }, cities, now).ok, false)
  assert.equal(validateSubmission({ ...base, ticketUrl: '', ticketing: 'link' }, cities, now).ok, false)
})

test('paid tickets through TheShowFinder', () => {
  const paid = validateSubmission({ ...base, ticketUrl: '', ticketing: 'paid', paidPrice: '£12.50', paidCapacity: '200' }, cities, now)
  assert.ok(paid.ok)
  if (paid.ok) {
    assert.equal(paid.value.paidPricePence, 1250)
    assert.equal(paid.value.paidCapacity, 200)
    assert.equal(paid.value.priceFrom, 12.5)
    assert.equal(paid.value.freeCapacity, null)
  }
  assert.equal(validateSubmission({ ...base, ticketUrl: '', ticketing: 'paid', paidPrice: '0.20', paidCapacity: '200' }, cities, now).ok, false)
  assert.equal(validateSubmission({ ...base, ticketUrl: '', ticketing: 'paid', paidPrice: '10', paidCapacity: '' }, cities, now).ok, false)
})
