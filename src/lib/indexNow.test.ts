import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { cleanIndexNowUrls, buildIndexNowPayload, indexNowKeyLocation, INDEXNOW_KEY } from './indexNow.ts'

describe('indexNow', () => {
  test('keeps only https URLs on our host, de-duplicated', () => {
    const out = cleanIndexNowUrls([
      'https://www.theshowfinder.com/events/a',
      'https://www.theshowfinder.com/events/a',
      'http://www.theshowfinder.com/events/b',
      'https://evil.example/events/c',
      'not a url',
    ])
    assert.deepEqual(out, ['https://www.theshowfinder.com/events/a'])
  })
  test('caps the list', () => {
    const urls = Array.from({ length: 50 }, (_, i) => `https://www.theshowfinder.com/events/${i}`)
    assert.equal(cleanIndexNowUrls(urls, 10).length, 10)
  })
  test('payload carries host, key and key location', () => {
    const p = buildIndexNowPayload(['https://www.theshowfinder.com/'])
    assert.equal(p.host, 'www.theshowfinder.com')
    assert.equal(p.key, INDEXNOW_KEY)
    assert.equal(p.keyLocation, indexNowKeyLocation())
    assert.match(p.keyLocation, /\.txt$/)
    assert.equal(p.urlList.length, 1)
  })
})
