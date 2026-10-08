import { afterEach, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import {
  getGigsbergAffiliateEvent,
  getGigsbergAffiliateOrders,
  searchGigsbergAffiliateEvents,
} from './gigsbergAffiliate.ts'

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
  delete process.env.GIGSBERG_AFFILIATE_API_KEY
})

describe('Gigsberg affiliate API', () => {
  test('searches events with the API key and filters', async () => {
    process.env.GIGSBERG_AFFILIATE_API_KEY = 'test-key'
    const calls: Array<[RequestInfo | URL, RequestInit | undefined]> = []
    globalThis.fetch = (async (input, init) => {
      calls.push([input, init])
      return new Response(JSON.stringify({ items: [], total: 0 }))
    }) as typeof fetch

    await searchGigsbergAffiliateEvents({ name: 'Russell Howard', city: 'Manchester', per_page: 10 })

    assert.equal(calls[0]?.[0], 'https://integration2.gigsberg.com/v2/event/search?name=Russell+Howard&city=Manchester&per_page=10')
    assert.equal(calls[0]?.[1]?.method, 'POST')
    assert.equal((calls[0]?.[1]?.headers as Record<string, string>)['x-api-key'], 'test-key')
  })

  test('retrieves a single event', async () => {
    process.env.GIGSBERG_AFFILIATE_API_KEY = 'test-key'
    let calledUrl: RequestInfo | URL | undefined
    globalThis.fetch = (async input => {
      calledUrl = input
      return new Response(JSON.stringify({ id: 123, url: 'https://gigsberg.example/event?affiliate=1' }))
    }) as typeof fetch

    const event = await getGigsbergAffiliateEvent(123)
    assert.match(event.url, /affiliate=1/)
    assert.equal(calledUrl, 'https://integration2.gigsberg.com/v2/event/123')
  })

  test('retrieves affiliate orders for reporting', async () => {
    process.env.GIGSBERG_AFFILIATE_API_KEY = 'test-key'
    let calledUrl: RequestInfo | URL | undefined
    globalThis.fetch = (async input => {
      calledUrl = input
      return new Response(JSON.stringify({ items: [], total: 0 }))
    }) as typeof fetch

    await getGigsbergAffiliateOrders({ sort_by: 'order_id', sort_order: 'desc' })
    assert.equal(calledUrl, 'https://integration2.gigsberg.com/v2/affiliate-order/search?sort_by=order_id&sort_order=desc')
  })
})
