import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildCityCollectionSchema,
  cityCanonicalUrl,
  cityPageDescription,
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
