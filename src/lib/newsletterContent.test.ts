import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  isEligibleForNewsletter,
  canSendNewsletter,
  isNewsletterLocked,
  chunkRecipients,
  buildUnsubscribeLink,
  resolveNewsletterArticles,
  applyNewsletterTracking,
  type NewsletterArticleSummary,
} from './newsletterContent.ts'

describe('isEligibleForNewsletter', () => {
  test('approved is eligible', () => {
    assert.equal(isEligibleForNewsletter('approved'), true)
  })

  test('published is eligible', () => {
    assert.equal(isEligibleForNewsletter('published'), true)
  })

  test('pending is not eligible', () => {
    assert.equal(isEligibleForNewsletter('pending'), false)
  })

  test('rejected is not eligible', () => {
    assert.equal(isEligibleForNewsletter('rejected'), false)
  })
})

describe('canSendNewsletter', () => {
  test('false with no subject', () => {
    assert.equal(canSendNewsletter({ subject: '', article_ids: ['a'] }), false)
  })

  test('false with a whitespace-only subject', () => {
    assert.equal(canSendNewsletter({ subject: '   ', article_ids: ['a'] }), false)
  })

  test('false with no articles selected', () => {
    assert.equal(canSendNewsletter({ subject: 'This week', article_ids: [] }), false)
  })

  test('true with a subject and at least one article', () => {
    assert.equal(canSendNewsletter({ subject: 'This week', article_ids: ['a'] }), true)
  })
})

describe('isNewsletterLocked', () => {
  test('a draft is not locked', () => {
    assert.equal(isNewsletterLocked('draft'), false)
  })

  test('a sent newsletter is locked', () => {
    assert.equal(isNewsletterLocked('sent'), true)
  })
})

describe('chunkRecipients', () => {
  test('a list smaller than the batch size is a single chunk', () => {
    const chunks = chunkRecipients([1, 2, 3], 100)
    assert.deepEqual(chunks, [[1, 2, 3]])
  })

  test('splits a list exactly at the batch size boundary', () => {
    const items = Array.from({ length: 250 }, (_, i) => i)
    const chunks = chunkRecipients(items, 100)
    assert.equal(chunks.length, 3)
    assert.equal(chunks[0].length, 100)
    assert.equal(chunks[1].length, 100)
    assert.equal(chunks[2].length, 50)
  })

  test('an empty list produces no chunks', () => {
    assert.deepEqual(chunkRecipients([], 100), [])
  })

  test('defaults to a batch size of 100', () => {
    const items = Array.from({ length: 150 }, (_, i) => i)
    const chunks = chunkRecipients(items)
    assert.equal(chunks.length, 2)
    assert.equal(chunks[0].length, 100)
  })

  test('throws on a non-positive size', () => {
    assert.throws(() => chunkRecipients([1, 2], 0))
  })
})

describe('buildUnsubscribeLink', () => {
  test('encodes the email as a query parameter on the production domain by default', () => {
    assert.equal(
      buildUnsubscribeLink('chris+newsletter@theshowfinder.com'),
      'https://www.theshowfinder.com/unsubscribe?email=chris%2Bnewsletter%40theshowfinder.com'
    )
  })

  test('accepts a different base URL', () => {
    assert.equal(buildUnsubscribeLink('a@b.com', 'http://localhost:3000'), 'http://localhost:3000/unsubscribe?email=a%40b.com')
  })
})

describe('resolveNewsletterArticles', () => {
  const article = (id: string): NewsletterArticleSummary => ({ id, headline: `Headline ${id}`, summary: null, source: null, url: `https://a.com/${id}` })

  test('resolves ids to their articles in the given order', () => {
    const available = new Map([['b', article('b')], ['a', article('a')]])
    const result = resolveNewsletterArticles(['a', 'b'], available)
    assert.deepEqual(result.map(a => a.id), ['a', 'b'])
  })

  test('drops an id that is no longer available (unpublished or deleted since selection)', () => {
    const available = new Map([['a', article('a')]])
    const result = resolveNewsletterArticles(['a', 'gone'], available)
    assert.deepEqual(result.map(a => a.id), ['a'])
  })

  test('an empty id list resolves to an empty array', () => {
    assert.deepEqual(resolveNewsletterArticles([], new Map()), [])
  })
})

describe('applyNewsletterTracking', () => {
  const article = (id: string, url: string): NewsletterArticleSummary => ({ id, headline: `Headline ${id}`, summary: null, source: null, url })

  test('tags each article url with the newsletter id as the utm campaign', () => {
    const [result] = applyNewsletterTracking([article('a', 'https://theshowfinder.com/events/show')], 'nl-42')
    const url = new URL(result.url)
    assert.equal(url.searchParams.get('utm_source'), 'newsletter')
    assert.equal(url.searchParams.get('utm_medium'), 'email')
    assert.equal(url.searchParams.get('utm_campaign'), 'newsletter-nl-42')
  })

  test('leaves every other field untouched', () => {
    const [result] = applyNewsletterTracking([{ id: 'a', headline: 'H', summary: 'S', source: 'Src', url: 'https://x.com' }], 'nl-1')
    assert.equal(result.id, 'a')
    assert.equal(result.headline, 'H')
    assert.equal(result.summary, 'S')
    assert.equal(result.source, 'Src')
  })

  test('tags multiple articles independently, preserving order', () => {
    const result = applyNewsletterTracking(
      [article('a', 'https://x.com/a'), article('b', 'https://x.com/b')],
      'nl-7'
    )
    assert.deepEqual(result.map(r => r.id), ['a', 'b'])
    assert.ok(result[0].url.includes('utm_campaign=newsletter-nl-7'))
    assert.ok(result[1].url.includes('utm_campaign=newsletter-nl-7'))
  })

  test('an empty article list returns an empty array', () => {
    assert.deepEqual(applyNewsletterTracking([], 'nl-1'), [])
  })
})
