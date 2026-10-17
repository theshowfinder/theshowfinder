import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildCityCollectionSchema,
  cityCanonicalUrl,
  cityPageDescription,
  cityPageTitle,
  roundedShowCount,
  cityThisWeekCanonicalUrl,
} from './citySeo.ts'

describe('city SEO helpers', () => {
  test('creates stable encoded canonical URLs', () => {
    assert.equal(cityCanonicalUrl('Stoke-on-Trent'), 'https://www.theshowfinder.com/cities/Stoke-on-Trent')
    assert.equal(cityThisWeekCanonicalUrl('Milton Keynes'), 'https://www.theshowfinder.com/cities/Milton%20Keynes/this-week')
  })

  test('description contains the city and useful search intents', () => {
    const description = cityPageDescription('Derby')
    assert.match(description, /Derby/)
    assert.match(description, /tonight/)
    assert.match(description, /presales/)
  })

  test('title leads with the city and "concerts" and stays short', () => {
    assert.equal(cityPageTitle('Derby'), 'Derby Concerts, Shows & Live Events')
    assert.ok(cityPageTitle('Wolverhampton').length <= 44)
    assert.ok(cityPageTitle('Stoke-on-Trent').length <= 44)
  })

  test('description uses a rounded live count and stays under 160 characters', () => {
    assert.equal(roundedShowCount(7), null)
    assert.equal(roundedShowCount(87), '80+')
    assert.equal(roundedShowCount(244), '200+')
    const d = cityPageDescription('Wolverhampton', 244)
    assert.match(d, /200\+ upcoming concerts/)
    assert.ok(d.length <= 160, String(d.length))
    assert.doesNotMatch(cityPageDescription('Derby', 3), /\d\+/)
  })

  test('builds an honest city collection schema', () => {
    const schema = buildCityCollectionSchema({
      cityName: 'Derby',
      url: cityCanonicalUrl('Derby'),
      name: 'Concerts & Live Events in Derby',
      description: cityPageDescription('Derby'),
    })
    assert.equal(schema['@type'], 'CollectionPage')
    assert.deepEqual(schema.about, {
      '@type': 'City',
      name: 'Derby',
      address: { '@type': 'PostalAddress', addressCountry: 'GB' },
    })
    assert.deepEqual(schema.isPartOf, {
      '@type': 'WebSite',
      name: 'TheShowFinder',
      url: 'https://www.theshowfinder.com',
    })
  })
})
