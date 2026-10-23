import { createAdminClient } from '@/lib/supabase/admin'
import { searchGigsbergAffiliateEvents, type GigsbergAffiliateEvent } from '@/lib/gigsbergAffiliate'
import { CITIES } from '@/lib/cities'
import { ukToday } from '@/lib/ukTime'

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

export function todayIso() {
  return ukToday()
}

export function horizonIso() {
  const date = new Date()
  date.setMonth(date.getMonth() + 24)
  return date.toISOString().slice(0, 10)
}

export interface GigsbergCatalogueSyncResult {
  city: string
  cityIndex: number
  nextCity: string | null
  fetched: number
  inserted: number
  updated: number
  errors: number
  pages: number
  durationMs: number
}

export function toCatalogueRow(event: GigsbergAffiliateEvent) {
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

type CatalogueWriteRow = ReturnType<typeof toCatalogueRow>

export type ExistingCatalogueRow = Pick<CatalogueWriteRow,
  'id' | 'name' | 'event_date' | 'event_time' | 'venue' | 'city' | 'country' |
  'performer1' | 'performer2' | 'tour' | 'url' | 'min_price' | 'raw'
>

// jsonb stores object keys in its own order, so the same payload read back never stringifies identically
// to the API's; Postgres also hands numerics back as strings ("46.36") and times as "19:30:00".
// Comparing those raw made every catalogue row look changed on every sync. Compare canonical forms.
function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, v) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)))
      : v)
}

function sameTime(a: string | null, b: string | null) {
  const norm = (t: string | null) => (t ? (t.length === 5 ? `${t}:00` : t) : null)
  return norm(a) === norm(b)
}

function samePrice(a: number | string | null, b: number | string | null) {
  if (a == null || b == null) return a == null && b == null
  return Number(a) === Number(b)
}

export function catalogueRowChanged(next: CatalogueWriteRow, existing: ExistingCatalogueRow) {
  return next.name !== existing.name
    || next.event_date !== existing.event_date
    || !sameTime(next.event_time, existing.event_time)
    || next.venue !== existing.venue
    || next.city !== existing.city
    || next.country !== existing.country
    || next.performer1 !== existing.performer1
    || next.performer2 !== existing.performer2
    || next.tour !== existing.tour
    || next.url !== existing.url
    || !samePrice(next.min_price, existing.min_price)
    || canonical(next.raw) !== canonical(existing.raw)
}

export function isUKEvent(event: GigsbergAffiliateEvent) {
  return UK_COUNTRIES.has((event.country ?? '').trim().toLowerCase())
}

export async function fetchCityEvents(city: string, from: string, to: string): Promise<{ events: GigsbergAffiliateEvent[]; pages: number }> {
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

async function fetchAllEvents(cityOverride?: string, from = todayIso(), to = horizonIso()): Promise<{ events: GigsbergAffiliateEvent[]; pages: number }> {
  const unique = new Map<number, GigsbergAffiliateEvent>()
  let pages = 0

  // Gigsberg's event search has no country filter. Searching the site's UK
  // city list and filtering the returned country keeps this catalogue UK-only.
  // date_from excludes past events and date_to keeps the catalogue aligned
  // with the site's rolling 24-month coverage policy.
  const cities = cityOverride ? CITIES.filter(city => city.name === cityOverride) : CITIES
  for (let index = 0; index < cities.length; index += 4) {
    const batch = cities.slice(index, index + 4)
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

export async function syncGigsbergCatalogue(cityOverride?: string, from = todayIso(), to = horizonIso(), advanceQueue = true): Promise<GigsbergCatalogueSyncResult> {
  const started = Date.now()
  const db = createAdminClient()
  const { data: syncState } = await db
    .from('gigsberg_sync_state')
    .select('current_city_index')
    .eq('id', 1)
    .maybeSingle() as unknown as { data: { current_city_index: number | null } | null }
  const cityIndex = Math.max(0, Math.min(syncState?.current_city_index ?? 0, CITIES.length - 1))
  const city = cityOverride && CITIES.some(item => item.name === cityOverride)
    ? cityOverride
    : CITIES[cityIndex].name
  const effectiveCityIndex = CITIES.findIndex(item => item.name === city)
  await db.from('gigsberg_sync_state').update({ status: 'running', last_started_at: new Date().toISOString() }).eq('id', 1)

  const { events, pages } = await fetchAllEvents(city, from, to)
  let inserted = 0
  let updated = 0
  let errors = 0

  const existingById = new Map<number, ExistingCatalogueRow>()
  for (let index = 0; index < events.length; index += 500) {
    const ids = events.slice(index, index + 500).map(event => event.id)
    if (!ids.length) continue
    const { data, error } = await db
      .from('gigsberg_catalogue_events')
      .select('id, name, event_date, event_time, venue, city, country, performer1, performer2, tour, url, min_price, raw')
      .in('id', ids)
    if (error) {
      throw new Error(`Could not read the existing Gigsberg catalogue: ${error.message}`)
    }
    for (const row of (data ?? []) as ExistingCatalogueRow[]) existingById.set(row.id, row)
  }

  for (let index = 0; index < events.length; index += 100) {
    const batch = events.slice(index, index + 100).map(toCatalogueRow)
    const changedBatch = batch.filter(row => {
      const existing = existingById.get(row.id)
      return !existing || catalogueRowChanged(row, existing)
    })

    // The catalogue is also the durable matching/review queue. Leaving
    // unchanged rows alone avoids needless Postgres writes and guarantees a
    // routine import cannot reset a human decision or rematch a stable row.
    if (!changedBatch.length) continue

    const { data, error } = await db
      .from('gigsberg_catalogue_events')
      .upsert(changedBatch, { onConflict: 'id', ignoreDuplicates: false })
      .select('id, first_seen_at') as unknown as { data: Array<{ id: number; first_seen_at: string }> | null; error: { message: string } | null }

    if (error) {
      console.error(`[gigsberg] catalogue batch failed: ${error.message}`)
      errors += changedBatch.length
      continue
    }

    const writtenIds = new Set((data ?? changedBatch).map(row => row.id))
    inserted += changedBatch.filter(row => !existingById.has(row.id) && writtenIds.has(row.id)).length
    updated += changedBatch.filter(row => existingById.has(row.id) && writtenIds.has(row.id)).length
  }

  const nextCityIndex = (effectiveCityIndex + 1) % CITIES.length
  await db.from('gigsberg_sync_state').update({
    status: 'idle',
    ...(advanceQueue ? { current_city_index: nextCityIndex } : {}),
    last_completed_at: new Date().toISOString(),
    total_listings_synced: events.length,
  }).eq('id', 1)

  return {
    city,
    cityIndex: effectiveCityIndex,
    nextCity: CITIES[nextCityIndex]?.name ?? null,
    fetched: events.length,
    inserted,
    updated,
    errors,
    pages,
    durationMs: Date.now() - started,
  }
}
