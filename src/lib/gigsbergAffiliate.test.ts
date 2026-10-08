import { describe, expect, test, vi, afterEach } from 'vitest'
import {
  getGigsbergAffiliateEvent,
  getGigsbergAffiliateOrders,
  searchGigsbergAffiliateEvents,
} from './gigsbergAffiliate'

afterEach(() => {
  vi.unstubAllGlobals()
  delete process.env.GIGSBERG_AFFILIATE_API_KEY
})

describe('Gigsberg affiliate API', () => {
  test('searches events with the API key and filters', async () => {
    process.env.GIGSBERG_AFFILIATE_API_KEY = 'test-key'
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ items: [], total: 0 })))
    vi.stubGlobal('fetch', fetchMock)

    await searchGigsbergAffiliateEvents({ name: 'Russell Howard', city: 'Manchester', per_page: 10 })

    expect(fetchMock).toHaveBeenCalledWith(
      'https://integration2.gigsberg.com/v2/event/search?name=Russell+Howard&city=Manchester&per_page=10',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'x-api-key': 'test-key' }),
      }),
    )
  })

  test('retrieves a single event', async () => {
    process.env.GIGSBERG_AFFILIATE_API_KEY = 'test-key'
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 123, url: 'https://gigsberg.example/event?affiliate=1' })))
    vi.stubGlobal('fetch', fetchMock)

    const event = await getGigsbergAffiliateEvent(123)
    expect(event.url).toContain('affiliate=1')
    expect(fetchMock.mock.calls[0][0]).toBe('https://integration2.gigsberg.com/v2/event/123')
  })

  test('retrieves affiliate orders for reporting', async () => {
    process.env.GIGSBERG_AFFILIATE_API_KEY = 'test-key'
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ items: [], total: 0 })))
    vi.stubGlobal('fetch', fetchMock)

    await getGigsbergAffiliateOrders({ sort_by: 'order_id', sort_order: 'desc' })
    expect(fetchMock.mock.calls[0][0]).toBe('https://integration2.gigsberg.com/v2/affiliate-order/search?sort_by=order_id&sort_order=desc')
  })
})
