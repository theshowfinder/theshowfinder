// The ONE canonical definition of "an event we list and count".
//
// A "listed" event is a row of the `listed_events_with_venue` view
// (migration 055/056), which is `events_with_venue` minus the duplicate
// records: premium / VIP / lounge / hospitality package rows and repeat
// source rows that describe the same artist + venue + day as a standard
// ticket are merged into ONE canonical event. The other ticket links are not
// lost: the canonical event page shows them as extra ticket options
// (see src/lib/eventOffers.ts).
//
// On top of the view, a count is always restricted to LIVE statuses (never
// cancelled / postponed) and to events that have not started yet. Every
// number shown on the site (homepage stats, city cards, city hero line, city
// category chips, per-venue counts, SEO descriptions, /insights) is built with
// listedEventsCount() so they can never disagree with each other or with the
// listings they describe.

import type { SupabaseClient } from '@supabase/supabase-js'

export const LISTED_EVENTS_VIEW = 'listed_events_with_venue'

// Cancelled / postponed shows are never counted or listed as upcoming.
export const LIVE_EVENT_STATUSES = ['upcoming', 'on_sale', 'sold_out']

export interface ListedCountFilters {
  /** City name, matched case/whitespace-insensitively like every city query. */
  city?: string
  venueId?: string
  category?: string
  /** Defaults to now. Events starting before this are past and not counted. */
  fromISO?: string
  /** Exclusive upper bound (used for month buckets). */
  toISO?: string
}

export interface ListedCountResult {
  count: number | null
  error?: unknown
}

/** Collapses incidental whitespace, as the city queries have always done. */
function cityFilterValue(name: string): string {
  return name.trim().replace(/\s+/g, ' ')
}

/**
 * Head-only count of listed upcoming events. Returns the raw
 * `{ count, error }` so callers keep "query failed" distinct from a genuine
 * zero (see cityEventCount.ts).
 */
export function listedEventsCount(
  supabase: SupabaseClient,
  filters: ListedCountFilters = {},
): PromiseLike<ListedCountResult> {
  const fromISO = filters.fromISO ?? new Date().toISOString()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q: any = supabase
    .from(LISTED_EVENTS_VIEW)
    .select('*', { count: 'exact', head: true })
    .in('status', LIVE_EVENT_STATUSES)
    .gte('start_date', fromISO)
  if (filters.city)     q = q.ilike('venue_city', cityFilterValue(filters.city))
  if (filters.venueId)  q = q.eq('venue_id', filters.venueId)
  if (filters.category) q = q.eq('category', filters.category)
  if (filters.toISO)    q = q.lt('start_date', filters.toISO)
  return q as PromiseLike<ListedCountResult>
}

// ── Dropping duplicates from lists that read the base `events` table ─────────
// A few lists read `events` directly (they need columns or ordering the
// listed view does not carry). They filter out the duplicate / package records
// with these helpers so they agree with every other listing.

/** Pure: keep rows whose id is not a known duplicate. */
export function withoutDuplicateIds<T extends { id: string }>(rows: T[], duplicateIds: ReadonlySet<string>): T[] {
  return duplicateIds.size === 0 ? rows : rows.filter(r => !duplicateIds.has(r.id))
}

/**
 * Ids (from `ids`) that event_canonical_map marks as folded into another
 * canonical event. On any lookup error returns an empty set, so a real event is
 * never hidden because the map could not be read.
 */
export async function fetchDuplicateIds(supabase: SupabaseClient, ids: string[]): Promise<Set<string>> {
  const dupes = new Set<string>()
  const unique = [...new Set(ids)]
  const CHUNK = 100
  try {
    for (let i = 0; i < unique.length; i += CHUNK) {
      const { data, error } = await supabase
        .from('event_canonical_map')
        .select('id')
        .in('id', unique.slice(i, i + CHUNK))
        .eq('is_canonical', false) as unknown as { data: { id: string }[] | null; error: unknown }
      if (error) return new Set()
      for (const r of data ?? []) dupes.add(r.id)
    }
  } catch {
    return new Set()
  }
  return dupes
}

/** Rows minus duplicate / package records (see fetchDuplicateIds). */
export async function dropDuplicateEvents<T extends { id: string }>(supabase: SupabaseClient, rows: T[]): Promise<T[]> {
  if (rows.length === 0) return rows
  return withoutDuplicateIds(rows, await fetchDuplicateIds(supabase, rows.map(r => r.id)))
}
