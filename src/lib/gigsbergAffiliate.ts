// Gigsberg affiliate integration API (v2).
// This is deliberately separate from gigsberg.ts, which is the existing
// seller-listing sync for Chris's own inventory.

const GIGSBERG_AFFILIATE_BASE = 'https://integration2.gigsberg.com/v2'

export interface GigsbergAffiliateEvent {
  id: number
  name: string
  type_id: number
  type_name: string
  subType_id: number
  subType: string
  date: string
  time: string
  updated_at: string
  created_at: string
  url: string
  venue_id: number
  performer1_id: number
  performer2_id: number | null
  performer1: string
  performer2: string | null
  country: string
  city: string
  venue: string
  tour: string | null
  min_price: number | null
  categories: unknown
}

export interface GigsbergAffiliateEventSearch {
  items: GigsbergAffiliateEvent[]
  total: number
  nextPage: string | null
  prevPage: string | null
  lastPage: string | null
}

export interface GigsbergAffiliateOrderSearch {
  items: unknown[]
  total: number
  nextPage: string | null
  prevPage: string | null
  lastPage: string | null
}

export interface GigsbergAffiliateListingSearch {
  items: unknown[]
  total: number
  nextPage: string | null
  prevPage: string | null
  lastPage: string | null
}

function apiKey(): string {
  const key = process.env.GIGSBERG_AFFILIATE_API_KEY
  if (!key) throw new Error('Missing GIGSBERG_AFFILIATE_API_KEY environment variable')
  return key
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  // Read-only calls are retried: a single slow or briefly failing Gigsberg response (an 8s abort at
  // 02:45 UTC) used to fail the whole catalogue sync for the day. Calls with a body are never retried.
  const attempts = init.body ? 1 : 3
  let lastError: unknown
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), init.body ? 8000 : 15000)
    try {
      const response = await fetch(`${GIGSBERG_AFFILIATE_BASE}${path}`, {
        ...init,
        signal: init.signal ?? controller.signal,
        headers: {
          Accept: 'application/json',
          'x-api-key': apiKey(),
          ...(init.body ? { 'Content-Type': 'application/json' } : {}),
          ...init.headers,
        },
        cache: 'no-store',
      })
      if (!response.ok) {
        const err = new Error(`Gigsberg affiliate API failed: HTTP ${response.status}`)
        // Retry only transient server-side failures and rate limits.
        if (attempt < attempts && (response.status >= 500 || response.status === 429)) {
          lastError = err
          await new Promise(r => setTimeout(r, 1500 * attempt))
          continue
        }
        throw err
      }
      return await (response.json() as Promise<T>)
    } catch (err) {
      lastError = err
      const transient = err instanceof Error && (err.name === 'AbortError' || /aborted|fetch failed|ECONNRESET|ETIMEDOUT/i.test(err.message))
      if (attempt < attempts && transient) {
        await new Promise(r => setTimeout(r, 1500 * attempt))
        continue
      }
      throw err
    } finally {
      clearTimeout(timeout)
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Gigsberg affiliate API failed')
}

function query(params: Record<string, string | number | undefined>): string {
  const values = Object.entries(params).filter(([, value]) => value !== undefined)
  return values.length
    ? `?${new URLSearchParams(values.map(([key, value]) => [key, String(value)]))}`
    : ''
}

/** Search Gigsberg events. The returned event.url is already affiliate-aware. */
export function searchGigsbergAffiliateEvents(params: {
  name?: string
  city?: string
  date?: string
  date_from?: string
  date_to?: string
  venue?: string
  performer1?: string
  page?: number
  per_page?: number
} = {}): Promise<GigsbergAffiliateEventSearch> {
  return request<GigsbergAffiliateEventSearch>(`/event/search${query(params)}`, { method: 'POST' })
}

export function getGigsbergAffiliateEvent(eventId: number): Promise<GigsbergAffiliateEvent> {
  return request<GigsbergAffiliateEvent>(`/event/${eventId}`)
}

/** Retrieve the current listings for an event. A positive total means inventory is available. */
export function searchGigsbergAffiliateListings(params: {
  event_id: number
  currency_code?: string
}): Promise<GigsbergAffiliateListingSearch> {
  return request<GigsbergAffiliateListingSearch>('/listing/search', {
    method: 'POST',
    body: JSON.stringify(params),
  })
}

/** Retrieve orders attributed to TheShowFinder's affiliate account. */
export function getGigsbergAffiliateOrders(params: {
  id?: number
  currency_id?: number
  sort_by?: 'id' | 'order_id'
  sort_order?: 'asc' | 'desc'
} = {}): Promise<GigsbergAffiliateOrderSearch> {
  return request<GigsbergAffiliateOrderSearch>(`/affiliate-order/search${query(params)}`)
}
