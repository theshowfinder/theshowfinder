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
  assert.match(e.text, /You're a 6-minute walk from Co-op Live, so you'd be shown on every show there/)
  assert.match(e.text, /only take three Featured partners around each venue/)
  assert.doesNotMatch(e.text, /nine/)
  assert.match(e.text, /decide where to eat before the show/)
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

test('chains and groups are recognised (emailed after independents); venues themselves are not emailed', async () => {
  const { looksLikeChain, looksMultiSite } = await import('./outreach.ts')
  for (const name of ["Nando's", 'BrewDog Lothian Road', 'Hilton Garden Inn Glasgow City Centre', 'Six by Nico', 'Las Iguanas']) assert.equal(looksLikeChain({ name }), true, name)
  const { isVenueName } = await import('./outreach.ts')
  assert.equal(isVenueName('Theatre Royal'), true)
  assert.equal(isVenueName('Arts Bar Hope Street'), false)
  assert.equal(looksLikeChain({ name: 'Bar 1', email: 'events@slugandlettuce.co.uk' }), true)
  for (const name of ['The Blue Door', 'Ma Egertons', 'The 78', 'Kelvingrove Café', 'Porter & Rye']) assert.equal(looksLikeChain({ name, website: 'https://example.co.uk' }), false, name)
  assert.equal(looksMultiSite('Our venues: Leeds, York, Bath, Bristol and Cardiff', 'Manchester'), true)
  assert.equal(looksMultiSite('A family bar in Manchester since 1998, near the Leeds road', 'Manchester'), false)
})

test('accented chain names and placeholder venues', async () => {
  const { looksLikeChain } = await import('./outreach.ts')
  assert.equal(looksLikeChain({ name: 'Caffè Nero' }), true)
  assert.equal(looksLikeChain({ name: 'YO! Sushi' }), true)
  const e = buildOutreachEmail({ ...p, city: 'Liverpool', near_venue: 'Liverpool', distance_label: '1 min walk from Liverpool' }, 'first')
  assert.doesNotMatch(e.text, /walk from Liverpool/)
  assert.match(e.text, /three Featured partners around each venue in Liverpool/)
})

test('A/B subjects: venue, category, length, and follow-ups reply to the subject actually sent', async () => {
  const { outreachSubject, subjectVariantFor, shortVenue } = await import('./outreach.ts')
  assert.equal(outreachSubject(p, 'A'), 'Where do Co-op Live crowds eat before the show?')
  assert.equal(outreachSubject(p, 'B'), "3 spots next to Co-op Live's shows. One for The Blue Door?")
  assert.equal(outreachSubject({ ...p, category: 'Pub' }, 'A'), 'Where do Co-op Live crowds grab a drink before the show?')
  assert.equal(outreachSubject({ ...p, category: 'Hotel' }, 'A'), 'Where do Co-op Live crowds stay the night?')
  assert.equal(outreachSubject({ ...p, near_venue: null }, 'A'), 'Where do Manchester show-goers eat before the show?')
  assert.equal(outreachSubject({ ...p, near_venue: null }, 'B'), '3 spots on our Manchester page. One for The Blue Door?')
  assert.equal(shortVenue('OVO Hydro', 'Glasgow'), 'the Hydro')
  assert.equal(shortVenue('Ulster Hall Belfast', 'Belfast'), 'Ulster Hall')
  assert.equal(shortVenue('O2 Academy Glasgow', 'Glasgow'), 'O2 Academy')
  assert.equal(shortVenue('The Bodega', 'Nottingham'), 'the Bodega')
  assert.equal(shortVenue('Utilita Arena Birmingham', 'Birmingham'), 'Utilita Arena')
  const long = { ...p, business_name: 'The Very Long Named Restaurant and Cocktail Lounge', near_venue: 'Glasgow Royal Concert Hall', city: 'Glasgow' }
  for (const v of ['A', 'B'] as const) assert.ok(outreachSubject(long, v).length <= 60, outreachSubject(long, v))
  assert.ok(['E', 'F'].includes(subjectVariantFor('3f2a9c1e-0000-4000-8000-00000000000b', new Date('2027-02-01T00:00:00Z'))))
  // follow-up to a business emailed with version B
  assert.equal(buildOutreachEmail({ ...p, status: 'sent', sent_at: '2026-11-13T08:00:00Z', subject_variant: 'B' }, 'follow_up').subject, "Re: 3 spots next to Co-op Live's shows. One for The Blue Door?")
  // follow-up to a business emailed before the A/B test keeps the old subject
  assert.equal(buildOutreachEmail({ ...p, status: 'sent', sent_at: '2026-11-10T08:00:00Z', subject_variant: null }, 'follow_up').subject, "Re: We'd love to feature The Blue Door on TheShowFinder Manchester")
})

test('visual email: banner, show card, offer badge, button, no stray values, small', () => {
  const show = { title: 'Example Band', when: 'Sat 21 Nov, 19:30', venue: 'Co-op Live', imageUrl: 'https://s1.ticketm.net/x.jpg', url: 'https://www.theshowfinder.com/events/example-band-abc12345' }
  const e = buildOutreachEmail(p, 'first', { show })
  assert.match(e.html, /email\/city\/manchester\.jpg/)
  assert.match(e.html, /Example Band/)
  assert.match(e.html, /BEFORE THE SHOW/)
  assert.match(e.html, /10% off with your show ticket/)
  assert.match(e.html, /\/p\/abc123/)
  assert.match(e.html, /\/unsubscribe\/tok/)
  assert.match(e.text, /For example, on the page for Example Band at Co-op Live \(Sat 21 Nov, 19:30\), The Blue Door would sit right under the ticket buttons/)
  assert.doesNotMatch(e.html + e.text, /undefined|null|NaN/)
  assert.ok(e.html.length < 60_000)
  const noShow = buildOutreachEmail({ ...p, city: 'Atlantis', near_venue: null }, 'first')
  assert.doesNotMatch(noShow.html, /email\/city\//)
  assert.match(noShow.html, /On our Atlantis page/)
  assert.match(buildOutreachEmail({ ...p, category: 'Hotel' }, 'first').html, /STAY NEARBY/)
})

test('every city gets a turn: fewest-so-far cities first, more venues searched in big cities', async () => {
  const { spreadAcrossCities, anchorCountFor } = await import('./outreach.ts')
  const rows = [{ city: 'Edinburgh', n: 1 }, { city: 'Edinburgh', n: 2 }, { city: 'Edinburgh', n: 3 }, { city: 'London', n: 4 }, { city: 'London', n: 5 }, { city: 'Bath', n: 6 }]
  const have = new Map([['Edinburgh', 49], ['London', 14]])
  assert.deepEqual(spreadAcrossCities(rows, 5, have).map(r => r.n), [6, 4, 1, 5, 2])   // Bath (0) → London (14) → Edinburgh (49), in turns
  const names = ['London', 'Manchester', 'Birmingham', 'Glasgow', 'Edinburgh', 'Leeds', 'Liverpool', 'Bristol', 'Cardiff', 'Belfast', 'Bath']
  assert.equal(anchorCountFor('London', names), 20)
  assert.equal(anchorCountFor('Cardiff', names), 10)
  assert.equal(anchorCountFor('Belfast', names), 6)
  assert.equal(anchorCountFor('Nowhere', names), 6)
})

test('pricing reset (20 Nov 2026): first month free then £9.95, no capitals, no strike-through', () => {
  const now = new Date('2026-12-01T10:00:00Z')
  const e = buildOutreachEmail(p, 'first', { now })
  assert.match(e.text, /It's free to join and there's no card to enter: your first month costs nothing\./)
  assert.match(e.text, /only stay on \(£9\.95 a month, cancel any time\) if it's working for you/)
  assert.match(e.text, /See one that's live: The Pudding Pantry in Nottingham, https:\/\/www\.theshowfinder\.com\/partners\//)
  assert.match(e.html, /NO CARD NEEDED/)
  assert.doesNotMatch(e.text, /FOUNDING PARTNER OFFER|normally £|24\.95|44\.95/)
  assert.match(e.html, /Your first month <span[^>]*>FREE<\/span>/)
  assert.doesNotMatch(e.html, /line-through|31 DECEMBER/)
  // the offer comes after the pitch, not straight after "Hi there,"
  assert.ok(e.text.indexOf('free to join') > e.text.indexOf('Places like The Blue Door'))
  const later = buildOutreachEmail(p, 'first', { now: new Date('2027-06-01T10:00:00Z') })
  assert.match(later.text, /first month/)
  const f = buildOutreachEmail({ ...p, status: 'sent', sent_at: '2026-11-13T08:00:00Z', subject_variant: 'A' }, 'follow_up', { now })
  assert.match(f.text, /£9\.95 a month/)
  assert.match(f.text, /Start The Blue Door's free month/)
})

test('offer subjects (C/D) while the founding offer is open; A/B after', async () => {
  const { outreachSubject, subjectVariantFor } = await import('./outreach.ts')
  assert.equal(outreachSubject(p, 'C'), 'Free month for The Blue Door beside Co-op Live\'s shows')
  assert.equal(outreachSubject(p, 'D'), 'Be one of 3 spots by Co-op Live, first month free')
  assert.equal(outreachSubject({ ...p, near_venue: null }, 'C'), 'Free month for The Blue Door on our Manchester page')
  const long = { ...p, business_name: 'The Very Long Named Restaurant and Cocktail Lounge', near_venue: 'Glasgow Royal Concert Hall', city: 'Glasgow' }
  for (const v of ['C', 'D', 'E', 'F'] as const) assert.ok(outreachSubject(long, v).length <= 60, outreachSubject(long, v))
  // no card to join (26 Nov 2026): new emails say so in the subject
  assert.equal(outreachSubject(p, 'E'), 'Free listing for The Blue Door by Co-op Live, no card needed')
  assert.equal(outreachSubject(p, 'F'), 'One of 3 spots by Co-op Live: free, no card needed')
  assert.ok(['E', 'F'].includes(subjectVariantFor('abc', new Date('2026-12-01T00:00:00Z'))))
  assert.ok(['E', 'F'].includes(subjectVariantFor('abc', new Date('2027-01-05T00:00:00Z'))))   // the free month never ends now
  const e = buildOutreachEmail(p, 'first', { now: new Date('2026-12-01T00:00:00Z') })
  assert.match(e.subject, /free/i)
  assert.match(e.subject, /no card/i)
  assert.match(e.text, /£9\.95 a month/)
  // a business first emailed with C gets "Re:" the same subject
  assert.equal(buildOutreachEmail({ ...p, status: 'sent', sent_at: '2026-11-13T08:00:00Z', subject_variant: 'C' }, 'follow_up').subject, "Re: Free month for The Blue Door beside Co-op Live's shows")
})

test('founding-offer update email to businesses emailed before the offer', () => {
  const show = { title: 'Example Band', when: 'Sat 21 Nov, 19:30', venue: 'Co-op Live', imageUrl: 'https://s1.ticketm.net/x.jpg', url: 'https://www.theshowfinder.com/events/x' }
  const u = buildOutreachEmail({ ...p, status: 'sent', sent_at: '2026-11-05T08:00:00Z', subject_variant: null }, 'offer_update', { show, now: new Date('2026-11-20T08:00:00Z') })
  assert.equal(u.subject, 'The Blue Door: now £9.95 a month, first month free')
  assert.match(u.text, /A quick update since I last emailed about The Blue Door: we've made it much simpler\. Your first month is free, then it's just £9\.95 a month/)
  assert.match(u.text, /Start The Blue Door's free month: https:\/\/www\.theshowfinder\.com\/p\/abc123/)
  assert.match(u.text, /For example, The Blue Door would be on the page for Example Band at Co-op Live/)
  assert.doesNotMatch(u.text, /Here's how it would look:/)
  assert.match(u.html, /BEFORE THE SHOW/)
  assert.match(u.html, /\/unsubscribe\/tok/)
  assert.equal(canEmail({ ...p, status: 'no_response' }), true)
  assert.equal(canEmail({ ...p, status: 'unsubscribed' }), false)
})
