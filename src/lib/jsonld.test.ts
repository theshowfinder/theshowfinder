import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  jsonLdScript,
  buildEventSchema,
  buildBreadcrumbSchema,
  buildItemListSchema,
  buildWebsiteSchema,
  buildOrganizationSchema,
} from './jsonld.ts'
import { SOCIAL_LINKS } from './socialLinks.ts'

describe('jsonLdScript', () => {
  test('serializes an object to JSON', () => {
    assert.equal(jsonLdScript({ a: 1, b: 'x' }), '{"a":1,"b":"x"}')
  })

  test('escapes a closing script tag so content cannot break out of <script>', () => {
    // Only '<' is escaped (to the literal 6-character sequence \u003c) —
    // '>' is left alone, which is enough: a browser's HTML parser looks
    // for a literal '<' to start recognizing '</script>' as a tag.
    const result = jsonLdScript({ name: '</script><script>alert(1)</script>' })
    assert.equal(result.includes('</script>'), false)
    assert.ok(result.includes('\\u003c/script>'))
    assert.ok(result.includes('\\u003cscript>'))
  })
})

describe('buildEventSchema', () => {
  const base = { name: 'Oasis', url: 'https://theshowfinder.com/events/oasis', startDate: '2026-06-01T19:00:00.000Z', status: 'upcoming' as const }

  test('includes required Event fields', () => {
    const schema = buildEventSchema(base)
    assert.equal(schema['@type'], 'Event')
    assert.equal(schema.name, 'Oasis')
    assert.equal(schema.startDate, base.startDate)
  })

  test('omits optional fields that are not provided', () => {
    const schema = buildEventSchema(base)
    assert.equal('endDate' in schema, false)
    assert.equal('description' in schema, false)
    assert.equal('image' in schema, false)
  })

  test('includes optional fields when provided', () => {
    const schema = buildEventSchema({ ...base, endDate: '2026-06-01T22:00:00.000Z', description: 'A great show', image: 'https://x.com/img.jpg' })
    assert.equal(schema.endDate, '2026-06-01T22:00:00.000Z')
    assert.equal(schema.description, 'A great show')
    assert.deepEqual(schema.image, ['https://x.com/img.jpg'])
  })

  test('maps cancelled status to EventCancelled', () => {
    assert.equal(buildEventSchema({ ...base, status: 'cancelled' }).eventStatus, 'https://schema.org/EventCancelled')
  })

  test('sold out is still EventScheduled, not EventCancelled', () => {
    assert.equal(buildEventSchema({ ...base, status: 'sold_out' }).eventStatus, 'https://schema.org/EventScheduled')
  })

  test('sold out sets offer availability to SoldOut', () => {
    assert.equal(buildEventSchema({ ...base, status: 'sold_out' }).offers.availability, 'https://schema.org/SoldOut')
  })

  test('uses the real venue as location and organizer when provided', () => {
    const schema = buildEventSchema({ ...base, venue: { name: 'O2 Arena', address: '1 Arena St', city: 'London', postcode: 'SE10' } })
    assert.equal(schema.location.name, 'O2 Arena')
    assert.equal(schema.organizer.name, 'O2 Arena')
  })

  test('falls back to a UK placeholder location and TheShowFinder as organizer with no venue', () => {
    const schema = buildEventSchema(base)
    assert.equal(schema.location.name, 'United Kingdom')
    assert.equal(schema.organizer.name, 'TheShowFinder')
  })

  test('never fabricates a price when priceFrom is missing', () => {
    assert.equal('price' in buildEventSchema(base).offers, false)
  })

  test('includes a price when priceFrom is provided', () => {
    assert.equal(buildEventSchema({ ...base, priceFrom: 45 }).offers.price, 45)
  })

  test('offer URL falls back to the event URL when no offerUrl is given', () => {
    assert.equal(buildEventSchema(base).offers.url, base.url)
  })

  test('performers become an array of PerformingGroup entries', () => {
    const schema = buildEventSchema({ ...base, performers: ['Oasis', 'Cast'] })
    assert.deepEqual(schema.performer, [{ '@type': 'PerformingGroup', name: 'Oasis' }, { '@type': 'PerformingGroup', name: 'Cast' }])
  })
})

describe('buildBreadcrumbSchema', () => {
  test('numbers items by position starting at 1', () => {
    const schema = buildBreadcrumbSchema([{ name: 'Home', url: 'https://x.com' }, { name: 'Events', url: 'https://x.com/events' }])
    assert.equal(schema.itemListElement[0].position, 1)
    assert.equal(schema.itemListElement[1].position, 2)
  })

  test('maps name/url onto a ListItem', () => {
    const schema = buildBreadcrumbSchema([{ name: 'Home', url: 'https://x.com' }])
    assert.equal(schema.itemListElement[0]['@type'], 'ListItem')
    assert.equal(schema.itemListElement[0].item, 'https://x.com')
  })
})

describe('buildItemListSchema', () => {
  test('is a valid ItemList with positioned entries', () => {
    const schema = buildItemListSchema([{ name: 'Story one', url: 'https://a.com/1' }, { name: 'Story two', url: 'https://a.com/2' }])
    assert.equal(schema['@type'], 'ItemList')
    assert.equal(schema.itemListElement[1].position, 2)
    assert.equal(schema.itemListElement[1].name, 'Story two')
  })

  test('an empty list produces an empty itemListElement array', () => {
    assert.deepEqual(buildItemListSchema([]).itemListElement, [])
  })
})

describe('buildWebsiteSchema', () => {
  test('includes a SearchAction target for sitelinks search box', () => {
    const schema = buildWebsiteSchema()
    assert.equal(schema['@type'], 'WebSite')
    assert.ok(schema.potentialAction.target.includes('{search_term_string}'))
  })
})

describe('buildOrganizationSchema', () => {
  test('includes name, url and logo', () => {
    const schema = buildOrganizationSchema()
    assert.equal(schema['@type'], 'Organization')
    assert.equal(schema.name, 'TheShowFinder')
    assert.ok(schema.logo.startsWith('https://'))
  })

  test('includes sameAs with all three social profile URLs, sourced from socialLinks.ts', () => {
    const schema = buildOrganizationSchema()
    assert.deepEqual(schema.sameAs, SOCIAL_LINKS.map((link) => link.href))
    assert.equal(schema.sameAs.length, 3)
  })

  test('sameAs contains the exact Instagram, Facebook and TikTok URLs', () => {
    const schema = buildOrganizationSchema()
    assert.ok(schema.sameAs.includes('https://www.instagram.com/the_show_finder/'))
    assert.ok(schema.sameAs.includes('https://www.facebook.com/profile.php?id=61592305512592'))
    assert.ok(schema.sameAs.includes('https://www.tiktok.com/@theshowfinder'))
  })
})
