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
} from './on-sale.ts'
import { londonDayWindow } from './intelligence.ts'
import { isTonightEvent, sortTonightEvents } from './tonight.ts'

const DAY_MS = 24 * 60 * 60 * 1000

// Shared across every pool below — a cancelled or postponed show is never
// a genuine upcoming opportunity, so it's excluded from every "what's
// happening" grid (This Week, Top Events, Tonight) rather than only on
// Manchester's page: nobody wants a cancelled show held up as something
// to go to, on any city page or the homepage. "Deleted" has no soft-
// delete column in this schema, so a hard-deleted row is simply absent
// from every query already — nothing to filter for that case.
export const LIVE_EVENT_STATUSES = ['upcoming', 'on_sale', 'sold_out']

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

// Everything happening in the next 7 days, soonest first — this is a
// "what's on, in order" list, not a prominence ranking (see fetchTopEvents
// below for that), so the primary sort is the event's own start_date, not
// venue capacity, sync time, or on-sale date. Same-date ties fall back to
// featured status then venue capacity, purely to keep same-day ordering
// stable rather than to override the date-first rule. Cancelled/postponed
// rows are excluded (LIVE_EVENT_STATUSES) — a cancelled show was never a
// genuine "happening this week" opportunity. Pass `city` to scope to one
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
    .in('status', LIVE_EVENT_STATUSES)
    .order('start_date',     { ascending: true })
    .order('is_featured',    { ascending: false })
    .order('venue_capacity', { ascending: false, nullsFirst: false })
    .limit(fetchLimit)

  if (city) query = query.ilike('venue_city', city)

  const { data } = await query as unknown as { data: EventWithVenue[] | null }
  return dedupeEventsByTitle(data ?? [], limit)
}

// Tonight's row shape deliberately comes from the base `events` table
// joined with `venues`, not the `events_with_venue` view every other pool
// here uses — the view doesn't expose own_ticket_url (confirmed missing
// in Phase 6's admin dashboard work), and Tonight's whole point is to
// show a direct-ticket link only when TheShowFinder's own listing exists,
// so it needs that column.
export interface TonightEvent {
  id:             string
  title:          string
  slug:           string
  start_date:     string
  end_date:       string | null
  status:         string
  tickets_url:    string | null
  own_ticket_url: string | null
  venue_name:     string
  venue_slug:     string | null
  venue_city:     string
}

interface TonightEventRow {
  id: string; title: string; slug: string; start_date: string; end_date: string | null
  status: string; tickets_url: string | null; own_ticket_url: string | null
  venue: { name: string; slug: string | null; city: string } | null
}

// Everything starting today in Manchester (or any city), Europe/London
// calendar day, soonest first, with cancelled/postponed and already-
// finished shows excluded — see tonight.ts for the exact rules and why
// this needs its own query rather than reusing fetchEventsThisWeek (that
// one spans 7 days and sorts same-day ties by prominence, not strictly
// by time).
export async function fetchTonightEvents(
  supabase: SupabaseClient,
  { city, fetchLimit = 100 }: { city?: string; fetchLimit?: number },
): Promise<TonightEvent[]> {
  const window = londonDayWindow(new Date())
  const now    = Date.now()

  // city scoping goes through venue_id (base `events` has no flattened
  // venue_city column — that only exists on the events_with_venue view)
  // rather than an embedded-table filter, matching this file's and the
  // city page's own existing "look up venue ids, then filter events by
  // them" pattern.
  let venueIds: string[] | null = null
  if (city) {
    const { data: venues } = await supabase
      .from('venues')
      .select('id')
      .ilike('city', city) as unknown as { data: { id: string }[] | null }
    venueIds = (venues ?? []).map(v => v.id)
    if (venueIds.length === 0) return []
  }

  let query = supabase
    .from('events')
    .select('id, title, slug, start_date, end_date, status, tickets_url, own_ticket_url, venue:venues(name, slug, city)')
    .gte('start_date', window.startISO)
    .lt('start_date', window.endISO)
    .in('status', LIVE_EVENT_STATUSES)
    .order('start_date', { ascending: true })
    .limit(fetchLimit)

  if (venueIds) query = query.in('venue_id', venueIds)

  const { data } = await query as unknown as { data: TonightEventRow[] | null }
  const rows: TonightEvent[] = (data ?? [])
    .filter(e => e.venue !== null)
    .map(e => ({
      id: e.id, title: e.title, slug: e.slug, start_date: e.start_date, end_date: e.end_date,
      status: e.status, tickets_url: e.tickets_url, own_ticket_url: e.own_ticket_url,
      venue_name: e.venue!.name, venue_slug: e.venue!.slug, venue_city: e.venue!.city,
    }))
  const filtered = rows.filter(e => isTonightEvent(e, now, window))
  return sortTonightEvents(filtered)
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
// the two sections never repeat a card. Still ranked by prominence
// (featured, then capacity) rather than date — that's the point of "Top"
// as distinct from "This Week" — but cancelled/postponed rows are
// excluded the same way, since a cancelled show is never genuinely
// "coming up" regardless of how prominent it was.
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
    .in('status', LIVE_EVENT_STATUSES)
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
