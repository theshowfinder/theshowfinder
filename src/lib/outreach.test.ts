import test from 'node:test'
import assert from 'node:assert/strict'
import { buildOutreachEmail, canEmail, type Prospect } from './outreach.ts'

const p: Prospect = {
  id: 'x', business_name: 'The Blue Door', category: 'Restaurant', city: 'Manchester', near_venue: 'Co-op Live',
  distance_label: 'a 6-minute walk from Co-op Live', email: 'info@bluedoor.co.uk', company_type: 'ltd', status: 'approved',
  ref_code: 'abc123', unsubscribe_token: 'tok',
}

test('first email: personal, offer link, unsubscribe, no numbers', () => {
  const e = buildOutreachEmail(p, 'first')
  assert.match(e.subject, /The Blue Door/)
  assert.match(e.text, /You're a 6-minute walk from Co-op Live, so you'd be shown on every show there/)
  assert.match(e.text, /only take three Featured partners around each venue/)
  assert.doesNotMatch(e.text, /nine/)
  assert.match(e.text, /£29\.95 a month/)
  assert.match(e.text, /decide where to eat before the show/)
  assert.match(e.subject, /We'd love to feature The Blue Door on TheShowFinder Manchester/)
  assert.doesNotMatch(e.text, /chains|independent/i)
  assert.match(e.text, /\/p\/abc123/)
  assert.match(e.text, /\/unsubscribe\/tok/)
  assert.match(e.html, /Unsubscribe/)
  assert.doesNotMatch(e.text, /visitors|clicks|views a month/i)
})

test('follow-up is short and keeps the link', () => {
  const f = buildOutreachEmail({ ...p, contact_name: 'Sam Jones' }, 'follow_up')
  assert.match(f.subject, /^Re: /)
  assert.match(f.text, /^Hi Sam,/)
  assert.match(f.text, /\/p\/abc123/)
})

test('only approved businesses that have not opted out are emailed', () => {
  assert.equal(canEmail(p), true)
  assert.equal(canEmail({ ...p, company_type: 'sole_trader' }), true)
  assert.equal(canEmail({ ...p, status: 'to_check' }), false)
  assert.equal(canEmail({ ...p, company_type: 'consented' }), true)
  assert.equal(canEmail({ ...p, status: 'unsubscribed' }), false)
  assert.equal(canEmail({ ...p, status: 'onboarding' }), false)
})

test('cities take turns in the send queue', async () => {
  const { takeAcrossCities } = await import('./outreach.ts')
  const rows = [{ city: 'London', n: 1 }, { city: 'London', n: 2 }, { city: 'London', n: 3 }, { city: 'Leeds', n: 4 }, { city: 'Hull', n: 5 }]
  assert.deepEqual(takeAcrossCities(rows, 4).map(r => r.n), [1, 4, 5, 2])
})

test('one city a weekday: Manchester, London, Birmingham…, weekends look ahead to Monday', async () => {
  const { cityOfTheDay } = await import('./outreach.ts')
  const cities = ['London', 'Manchester', 'Birmingham', 'Glasgow']
  assert.equal(cityOfTheDay(cities, new Date('2026-11-05T10:00:00Z')), 'Manchester') // Thu
  assert.equal(cityOfTheDay(cities, new Date('2026-11-06T10:00:00Z')), 'London')     // Fri
  assert.equal(cityOfTheDay(cities, new Date('2026-11-07T10:00:00Z')), 'Birmingham') // Sat → Monday's city
  assert.equal(cityOfTheDay(cities, new Date('2026-11-09T10:00:00Z')), 'Birmingham') // Mon
  assert.equal(cityOfTheDay(cities, new Date('2026-11-10T10:00:00Z')), 'Glasgow')
  assert.equal(cityOfTheDay(cities, new Date('2026-11-11T10:00:00Z')), 'Manchester') // starts over
})

test('small independents only: chains, groups and the venues themselves are skipped', async () => {
  const { looksLikeChain, looksMultiSite } = await import('./outreach.ts')
  for (const name of ["Nando's", 'BrewDog Lothian Road', 'Hilton Garden Inn Glasgow City Centre', 'Six by Nico', 'Las Iguanas', 'Theatre Royal']) assert.equal(looksLikeChain({ name }), true, name)
  assert.equal(looksLikeChain({ name: 'Bar 1', email: 'events@slugandlettuce.co.uk' }), true)
  for (const name of ['The Blue Door', 'Ma Egertons', 'The 78', 'Kelvingrove Café', 'Porter & Rye']) assert.equal(looksLikeChain({ name, website: 'https://example.co.uk' }), false, name)
  assert.equal(looksMultiSite('Our venues: Leeds, York, Bath, Bristol and Cardiff', 'Manchester'), true)
  assert.equal(looksMultiSite('A family bar in Manchester since 1998, near the Leeds road', 'Manchester'), false)
})
