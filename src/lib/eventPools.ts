// Shared event-pool queries for "events happening soon" style sections —
// used by both the national homepage and per-city pages, parameterized by an
// optional city so the two never drift out of sync the way they used to
// (the city page's old "On Sale This Week" query and the homepage's version
// used different windows before this file existed). Add a country/region
// filter here later (international expansion) rather than in every page.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { EventWithVenue, Artist } from './types/database'
import {
  groupEventsByArtist, type OnSaleGroup,
  onSaleThisWeekWindow, presaleOpenNowWindow,
} from './on-sale'

const DAY_MS = 24 * 60 * 60 * 1000

// Drops repeat rows of the same real-world show (multiple Ticketmaster SKUs
// — "Standard Entry" / "Venue Premium" / etc. — share a title) and caps the
// result. Pool is expected to already be sorted the way callers want it.
export function dedupeEventsByTitle(pool: EventWithVenue[], limit: number): EventWithVenue[] {
  const seen = new Set<string>()
  const picked: EventWithVenue[] = []
  for (const ev of pool) {
    if (seen.has(ev.title)) continue
    seen.add(ev.title)
    picked.push(ev)
    if (picked.length >= limit) break
  }
  return picked
}

interface EventsThisWeekOpts {
  city?: string
  limit: number
  /** Fetch pool size before dedupe/limit — leave generous room for repeats. */
  fetchLimit?: number
}

// Everything happening in the next 7 days, biggest venues first (then
// featured, then soonest) — "biggest" because with thousands of events live
// at once, an unranked list is dominated by whatever synced most recently
// rather than what's actually worth surfacing. Pass `city` to scope to one
// city's page; omit it for the national homepage section.
export async function fetchEventsThisWeek(
  supabase: SupabaseClient,
  { city, limit, fetchLimit = 60 }: EventsThisWeekOpts,
): Promise<EventWithVenue[]> {
  const now       = new Date()
  const nowISO    = now.toISOString()
  const weekAhead = new Date(now.getTime() + 7 * DAY_MS).toISOString()

  let query = supabase
    .from('events_with_venue')
    .select('*')
    .gte('start_date', nowISO)
    .lte('start_date', weekAhead)
    .order('is_featured',    { ascending: false })
    .order('venue_capacity', { ascending: false, nullsFirst: false })
    .order('start_date',     { ascending: true })
    .limit(fetchLimit)

  if (city) query = query.ilike('venue_city', city)

  const { data } = await query as unknown as { data: EventWithVenue[] | null }
  return dedupeEventsByTitle(data ?? [], limit)
}

interface TopEventsOpts {
  city?: string
  limit: number
  fetchLimit?: number
  /** Days ahead the window ends — defaults to ~2 months. */
  horizonDays?: number
}

// The biggest shows beyond the strict 7-day window, out to `horizonDays`.
// Deliberately excludes anything already in fetchEventsThisWeek's window so
// the two sections never repeat a card.
export async function fetchTopEvents(
  supabase: SupabaseClient,
  { city, limit, fetchLimit = 60, horizonDays = 60 }: TopEventsOpts,
): Promise<EventWithVenue[]> {
  const now       = new Date()
  const weekAhead = new Date(now.getTime() + 7 * DAY_MS).toISOString()
  const horizon   = new Date(now.getTime() + horizonDays * DAY_MS).toISOString()

  let query = supabase
    .from('events_with_venue')
    .select('*')
    .gt('start_date', weekAhead)
    .lte('start_date', horizon)
    .order('is_featured',    { ascending: false })
    .order('venue_capacity', { ascending: false, nullsFirst: false })
    .order('start_date',     { ascending: true })
    .limit(fetchLimit)

  if (city) query = query.ilike('venue_city', city)

  const { data } = await query as unknown as { data: EventWithVenue[] | null }
  return dedupeEventsByTitle(data ?? [], limit)
}

interface PresalesOpenNowOpts {
  city?: string
  limit: number
  fetchLimit?: number
}

// Events where presale_start has passed and presale_end hasn't (or has
// none) — genuinely "buy via presale today" content, grouped by artist same
// as On Sale This Week. Distinct from the public on-sale date, which is
// what On Sale This Week tracks.
//
// presale_end is NOT trusted on its own: synced dates occasionally get
// corrupted (a Jamie T row once had presale_end stored as 2028 instead of
// 2026, which kept a presale that closed in August showing as "open" right
// up until 2028). Real presale windows run days, not months, so we also
// require presale_start to be recent — that catches a bad/missing
// presale_end regardless of what value it holds, without needing to trust
// it at all.
export async function fetchPresalesOpenNowEvents(
  supabase: SupabaseClient,
  { city, fetchLimit = 60 }: { city?: string; fetchLimit?: number },
): Promise<EventWithVenue[]> {
  const { floorISO, ceilISO } = presaleOpenNowWindow()

  let query = supabase
    .from('events_with_venue')
    .select('*')
    .gte('presale_start', floorISO)
    .lte('presale_start', ceilISO)
    .or(`presale_end.is.null,presale_end.gte.${ceilISO}`)
    .order('presale_end', { ascending: true, nullsFirst: false })
    .limit(fetchLimit)

  if (city) query = query.ilike('venue_city', city)

  const { data } = await query as unknown as { data: EventWithVenue[] | null }
  return data ?? []
}

export async function fetchPresalesOpenNow(
  supabase: SupabaseClient,
  artists: Artist[],
  { city, limit, fetchLimit = 60 }: PresalesOpenNowOpts,
): Promise<OnSaleGroup[]> {
  const data = await fetchPresalesOpenNowEvents(supabase, { city, fetchLimit })
  return groupEventsByArtist(data, artists).slice(0, limit)
}

interface OnSaleThisWeekOpts {
  city?: string
  limit: number
  /** Fetch pool size before dedupe/limit — leave generous room for repeats. */
  fetchLimit?: number
}

// Events going on sale (public on-sale) OR into presale within
// onSaleThisWeekWindow() — "Tickets just released" content for the
// homepage, the /on-sale-this-week listing, and each city page's On Sale
// This Week section. Queries public_onsale_start / presale_start directly
// rather than the on_sale_this_week / presale_this_week flag columns: the
// nightly DB function meant to keep those in sync isn't actually running,
// so they're stuck at false.
export async function fetchOnSaleThisWeekEvents(
  supabase: SupabaseClient,
  { city, fetchLimit = 500 }: { city?: string; fetchLimit?: number },
): Promise<EventWithVenue[]> {
  const { floorISO, ceilISO } = onSaleThisWeekWindow()

  let query = supabase
    .from('events_with_venue')
    .select('*')
    .or(`and(public_onsale_start.gte.${floorISO},public_onsale_start.lte.${ceilISO}),and(presale_start.gte.${floorISO},presale_start.lte.${ceilISO})`)
    .order('onsale_date', { ascending: true })
    .limit(fetchLimit)

  if (city) query = query.ilike('venue_city', city)

  const { data } = await query as unknown as { data: EventWithVenue[] | null }
  return data ?? []
}

// Grouped, deduped version of the above — one card per artist/promoter
// rather than one per Ticketmaster SKU row ("Standard Entry" / "Venue
// Premium" / etc. sharing a title).
export async function fetchOnSaleThisWeek(
  supabase: SupabaseClient,
  artists: Artist[],
  { city, limit, fetchLimit = 500 }: OnSaleThisWeekOpts,
): Promise<OnSaleGroup[]> {
  const data    = await fetchOnSaleThisWeekEvents(supabase, { city, fetchLimit })
  const deduped = dedupeEventsByTitle(data, fetchLimit)
  return groupEventsByArtist(deduped, artists).slice(0, limit)
}
