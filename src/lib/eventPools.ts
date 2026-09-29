// Shared event-pool queries for "events happening soon" style sections —
// used by both the national homepage and per-city pages, parameterized by an
// optional city so the two never drift out of sync the way they used to
// (the city page's old "On Sale This Week" query and the homepage's version
// used different windows before this file existed). Add a country/region
// filter here later (international expansion) rather than in every page.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { EventWithVenue, Artist } from './types/database'
import { groupEventsByArtist, type OnSaleGroup } from './on-sale'

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
export async function fetchPresalesOpenNow(
  supabase: SupabaseClient,
  artists: Artist[],
  { city, limit, fetchLimit = 60 }: PresalesOpenNowOpts,
): Promise<OnSaleGroup[]> {
  const nowISO = new Date().toISOString()

  let query = supabase
    .from('events_with_venue')
    .select('*')
    .lte('presale_start', nowISO)
    .or(`presale_end.is.null,presale_end.gte.${nowISO}`)
    .order('presale_end', { ascending: true, nullsFirst: false })
    .limit(fetchLimit)

  if (city) query = query.ilike('venue_city', city)

  const { data } = await query as unknown as { data: EventWithVenue[] | null }
  return groupEventsByArtist(data ?? [], artists).slice(0, limit)
}
