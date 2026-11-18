import test from 'node:test'
import assert from 'node:assert/strict'
import { weekendDatesLondon, cityTypeBySlug, cityTypeByCategory, cityTypePath, cityTypeTitle, cityTypeDescription, cityTypeFaqs, groupRuns, CITY_TYPES } from './cityTypeSeo.ts'

test('every type has a slug and maps from its category', () => {
  assert.equal(new Set(CITY_TYPES.map(t => t.slug)).size, CITY_TYPES.length)
  assert.equal(cityTypeBySlug('Concerts')?.category, 'concert')
  assert.equal(cityTypeByCategory('sports')?.slug, 'sport')
  assert.equal(cityTypeBySlug('this-week'), undefined)
  assert.equal(cityTypePath('Milton Keynes', CITY_TYPES[0]), '/cities/Milton%20Keynes/concerts')
})

test('titles and descriptions fit search results', () => {
  for (const t of CITY_TYPES) {
    assert.ok(cityTypeTitle('Stoke-on-Trent', t).length <= 60, t.slug)
    assert.ok(cityTypeDescription('Stoke-on-Trent', t, 1234, ['Victoria Hall', 'Regent Theatre', 'The Sugarmill']).length <= 160, t.slug)
  }
  assert.match(cityTypeTitle('Coventry', CITY_TYPES[0]), /^Concerts & Gigs in Coventry/)
  assert.match(cityTypeDescription('Hull', CITY_TYPES[1], 37, ['Hull City Hall']), /^30\+ upcoming comedy shows in Hull at Hull City Hall\./)
})

test('FAQs only state what the listings show', () => {
  const faqs = cityTypeFaqs('Derby', CITY_TYPES[1], { count: 12, venueNames: ['Derby Theatre'], nextTitle: 'Joe Bloggs', nextWhen: 'Fri 21 Nov', weekendCount: 0, priceFrom: 12.5 })
  assert.equal(faqs.length, 4)
  assert.match(faqs[0].a, /12 upcoming comedy shows in Derby/)
  assert.match(faqs[2].a, /Nothing in this category this weekend/)
  assert.match(faqs[3].a, /£12\.50/)
  assert.equal(cityTypeFaqs('Derby', CITY_TYPES[1], { count: 0, venueNames: [], nextTitle: null, nextWhen: null, weekendCount: 0, priceFrom: null }).length, 1)
})

test('a theatre run becomes one card with its date count', () => {
  const rows = [
    { title: 'Mamma Mia!', venue_id: 'v1', start_date: '2026-12-02' },
    { title: 'Mamma Mia!', venue_id: 'v1', start_date: '2026-12-01' },
    { title: 'Mamma Mia!', venue_id: 'v2', start_date: '2026-12-05' },
    { title: 'Other', venue_id: 'v1', start_date: '2026-11-30' },
  ]
  const g = groupRuns(rows)
  assert.deepEqual(g.map(x => [x.first.title, x.first.start_date, x.dates]), [['Other', '2026-11-30', 1], ['Mamma Mia!', '2026-12-01', 2], ['Mamma Mia!', '2026-12-05', 1]])
})

test('the coming weekend in London', () => {
  assert.deepEqual(weekendDatesLondon(new Date('2026-11-18T12:00:00Z')), ['2026-11-20', '2026-11-21', '2026-11-22'])
  assert.deepEqual(weekendDatesLondon(new Date('2026-11-21T12:00:00Z')), ['2026-11-21', '2026-11-22'])
})
