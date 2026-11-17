import test from 'node:test'
import assert from 'node:assert/strict'
import { eventbriteCitySlug, citySearchUrl, serverData, listedEvents, organiserProfile, isReadableWebsite, socialFromWebsite } from './eventbriteOrganisers.ts'

const page = (data: unknown) => `<html><script>window.__SERVER_DATA__ = ${JSON.stringify(data)};</script><p>{not json}</p></html>`

test('city slugs and search URLs', () => {
  assert.equal(eventbriteCitySlug('Milton Keynes'), 'united-kingdom--milton-keynes')
  assert.equal(eventbriteCitySlug('Stoke-on-Trent'), 'united-kingdom--stoke-on-trent')
  assert.equal(citySearchUrl('Derby', 1), 'https://www.eventbrite.co.uk/d/united-kingdom--derby/all-events/')
  assert.equal(citySearchUrl('Derby', 3), 'https://www.eventbrite.co.uk/d/united-kingdom--derby/all-events/?page=3')
})

test('server data survives braces inside strings', () => {
  assert.deepEqual(serverData(page({ a: 'x { y } "z"' })), { a: 'x { y } "z"' })
  assert.equal(serverData('<html>nothing</html>'), null)
})

test('listing pages give organisers, not online or cancelled events', () => {
  const html = page({ search_data: { events: { pagination: { page_count: 49 }, results: [
    { primary_organizer_id: '67089944053', name: 'Christmas Market', url: 'https://www.eventbrite.co.uk/e/x-1', start_date: '2026-12-13', primary_venue: { name: 'The West Mill', address: { city: 'Darley Abbey', postal_code: 'DE22 1DZ', country: 'GB' } } },
    { primary_organizer_id: '111111', name: 'Webinar', is_online_event: true },
    { primary_organizer_id: '222222', name: 'Called off', is_cancelled: true },
    { primary_organizer_id: 'abc', name: 'Bad id' },
  ], promoted_results: [] } } })
  const { events, pageCount } = listedEvents(html)
  assert.equal(pageCount, 49)
  assert.deepEqual(events.map(e => [e.organiserId, e.town, e.postcode]), [['67089944053', 'Darley Abbey', 'DE22 1DZ']])
})

test('organiser profile gives their own website and socials', () => {
  const html = page({ props: { organizer: { id: '67089944053', name: 'The West Mill Venue', metrics: { totalEvents: 9, attendeesHosted: '2.2k' }, socials: { website: 'https://thewestmillvenue.com/', instagram: 'westmillvenue' }, profilePageUrl: 'https://www.eventbrite.co.uk/o/the-west-mill-venue-67089944053' } } })
  const p = organiserProfile(html)
  assert.equal(p?.name, 'The West Mill Venue')
  assert.equal(p?.website, 'https://thewestmillvenue.com/')
  assert.equal(p?.instagram, 'https://www.instagram.com/westmillvenue')
  assert.equal(p?.totalEvents, 9)
  assert.equal(organiserProfile(page({})), null)
  const next = `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify({ props: { pageProps: { organizer: { id: '9', name: 'Next Org', socials: { facebook: 'nextorg' } } } } })}</script>`
  assert.equal(organiserProfile(next)?.facebook, 'https://www.facebook.com/nextorg')
})

test('only real websites are read for an email', () => {
  assert.equal(isReadableWebsite('https://thewestmillvenue.com/'), true)
  assert.equal(isReadableWebsite('https://www.facebook.com/westmill'), false)
  assert.equal(isReadableWebsite('https://linktr.ee/westmill'), false)
  assert.equal(isReadableWebsite('https://www.eventbrite.co.uk/o/x-1'), false)
  assert.equal(isReadableWebsite(null), false)
  assert.deepEqual(socialFromWebsite('https://instagram.com/westmill'), { instagram: 'https://instagram.com/westmill' })
})
