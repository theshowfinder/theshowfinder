import { createAdminClient } from '@/lib/supabase/admin'
import { searchGigsbergAffiliateEvents, type GigsbergAffiliateEvent } from '@/lib/gigsbergAffiliate'

const PAGE_SIZE = 100

export interface GigsbergCatalogueSyncResult {
  fetched: number
  inserted: number
  updated: number
  errors: number
  pages: number
  durationMs: number
}

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10)
}

function addDays(date: Date, days: number) {
  const result = new Date(date)
  result.setUTCDate(result.getUTCDate() + days)
  return result
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

async function fetchAllUpcomingEvents(): Promise<{ events: GigsbergAffiliateEvent[]; pages: number }> {
  const today = new Date()
  const all: GigsbergAffiliateEvent[] = []
  let page = 1

  for (;;) {
    const response = await searchGigsbergAffiliateEvents({
      date_from: isoDate(today),
      date_to: isoDate(addDays(today, 548)),
      page,
      per_page: PAGE_SIZE,
    })
    const items = response.items ?? []
    all.push(...items)
    if (items.length === 0 || items.length < PAGE_SIZE || (response.lastPage && String(page) >= response.lastPage)) {
      return { events: all, pages: page }
    }
    page += 1
  }
}

export async function syncGigsbergCatalogue(): Promise<GigsbergCatalogueSyncResult> {
  const started = Date.now()
  const { events, pages } = await fetchAllUpcomingEvents()
  const db = createAdminClient()
  let inserted = 0
  let updated = 0
  let errors = 0

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
