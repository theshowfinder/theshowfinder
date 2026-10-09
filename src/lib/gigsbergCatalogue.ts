import { createAdminClient } from '@/lib/supabase/admin'
import { searchGigsbergAffiliateEvents, type GigsbergAffiliateEvent } from '@/lib/gigsbergAffiliate'
import { CITIES } from '@/lib/cities'

const PAGE_SIZE = 100
const UK_COUNTRIES = new Set([
  'uk',
  'gb',
  'great britain',
  'united kingdom',
  'england',
  'scotland',
  'wales',
  'northern ireland',
])

function todayIso() {
  return new Date().toISOString().slice(0, 10)
}

function horizonIso() {
  const date = new Date()
  date.setMonth(date.getMonth() + 24)
  return date.toISOString().slice(0, 10)
}

export interface GigsbergCatalogueSyncResult {
  fetched: number
  inserted: number
  updated: number
  errors: number
  pages: number
  durationMs: number
}

function toCatalogueRow(event: GigsbergAffiliateEvent) {
  return {
    id: event.id,
    name: event.name,
    event_date: event.date.slice(0, 10),
    event_time: event.time || null,
    venue: event.venue || null,
    city: event.city || null,
    country: event.country || null,
    performer1: event.performer1 || null,
    performer2: event.performer2 || null,
    tour: event.tour || null,
    url: event.url,
    min_price: event.min_price ?? null,
    raw: event,
    last_seen_at: new Date().toISOString(),
  }
}

function isUKEvent(event: GigsbergAffiliateEvent) {
  return UK_COUNTRIES.has((event.country ?? '').trim().toLowerCase())
}

async function fetchCityEvents(city: string, from: string, to: string): Promise<{ events: GigsbergAffiliateEvent[]; pages: number }> {
  const events: GigsbergAffiliateEvent[] = []
  let page = 1

  for (;;) {
    const response = await searchGigsbergAffiliateEvents({ city, date_from: from, date_to: to, page, per_page: PAGE_SIZE })
    const items = response.items ?? []
    events.push(...items)
    if (items.length === 0 || items.length < PAGE_SIZE || !response.nextPage) {
      return { events, pages: page }
    }

    let nextPage = page + 1
    try {
      const nextUrl = new URL(response.nextPage)
      const cursor = nextUrl.searchParams.get('page')
      if (cursor) nextPage = Number(cursor)
    } catch {
      const cursor = Number(response.nextPage)
      if (Number.isFinite(cursor)) nextPage = cursor
    }
    if (!Number.isFinite(nextPage) || nextPage <= page) return { events, pages: page }
    page = nextPage
  }
}

async function fetchAllEvents(): Promise<{ events: GigsbergAffiliateEvent[]; pages: number }> {
  const from = todayIso()
  const to = horizonIso()
  const unique = new Map<number, GigsbergAffiliateEvent>()
  let pages = 0

  // Gigsberg's event search has no country filter. Searching the site's UK
  // city list and filtering the returned country keeps this catalogue UK-only.
  // date_from excludes past events and date_to keeps the catalogue aligned
  // with the site's rolling 24-month coverage policy.
  for (let index = 0; index < CITIES.length; index += 4) {
    const batch = CITIES.slice(index, index + 4)
    const results = await Promise.all(batch.map(city => fetchCityEvents(city.name, from, to)))
    for (const result of results) {
      pages += result.pages
      for (const event of result.events) {
        if (isUKEvent(event)) unique.set(event.id, event)
      }
    }
  }

  return { events: [...unique.values()], pages }
}

export async function syncGigsbergCatalogue(): Promise<GigsbergCatalogueSyncResult> {
  const started = Date.now()
  const { events, pages } = await fetchAllEvents()
  const db = createAdminClient()
  let inserted = 0
  let updated = 0
  let errors = 0

  // This table is a cache, not an editorial record. Rebuild it from the
  // current UK/future result set so rows from the old worldwide import cannot
  // remain visible in the matching queue.
  const { error: clearError } = await db
    .from('gigsberg_catalogue_events')
    .delete()
    .gte('id', 0)
  if (clearError) throw new Error(clearError.message)

  for (let index = 0; index < events.length; index += 100) {
    const batch = events.slice(index, index + 100).map(toCatalogueRow)
    const { data, error } = await db
      .from('gigsberg_catalogue_events')
      .upsert(batch, { onConflict: 'id', ignoreDuplicates: false })
      .select('id, first_seen_at') as unknown as { data: Array<{ id: number; first_seen_at: string }> | null; error: { message: string } | null }

    if (error) {
      console.error(`[gigsberg] catalogue batch failed: ${error.message}`)
      errors += batch.length
      continue
    }

    // Supabase does not expose inserted-vs-updated counts for an upsert. The
    // sync result therefore reports successfully written rows as updated and
    // keeps the precise catalogue state in the table itself.
    updated += data?.length ?? batch.length
  }

  return {
    fetched: events.length,
    inserted,
    updated,
    errors,
    pages,
    durationMs: Date.now() - started,
  }
}
