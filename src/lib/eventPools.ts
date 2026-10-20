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
  capGroupsBySeries, dropPastSales, dropPackageListings, mergeTourDates, onSaleSlugOf,
} from './on-sale.ts'
import { londonDayWindow, londonDaysAheadWindow, londonWeekendDayWindows, type DateWindow } from './intelligence.ts'
import { isTonightEvent, sortTonightEvents } from './tonight.ts'
import { mixEvents, trimTonight } from './eventMix.ts'
import { rankOnSaleGroups } from './onSaleMosaic.ts'
import { nearbyOrFilter, areaForVenueCity, type NearbyArea } from './nearbyAreas.ts'
import { LIVE_EVENT_STATUSES, listedEventsCount, dropDuplicateEvents } from './listedEvents.ts'

const DAY_MS = 24 * 60 * 60 * 1000

// Shared across every pool below — a cancelled or postponed show is never
// a genuine upcoming opportunity, so it's excluded from every "what's
// happening" grid (This Week, Top Events, Tonight) rather than only on
// Manchester's page: nobody wants a cancelled show held up as something
// to go to, on any city page or the homepage. "Deleted" has no soft-
// delete column in this schema, so a hard-deleted row is simply absent
// from every query already — nothing to filter for that case.
// Defined once in listedEvents.ts (the canonical count/listing definition).
export { LIVE_EVENT_STATUSES }

// Daily Intelligence investigation, 2 Oct 2026: every pool query above
// already excludes cancelled/postponed via LIVE_EVENT_STATUSES, but
// several public pages queried 'events'/'events_with_venue' directly
// (browse/search, a venue's own upcoming list, the homepage's "Just
// Announced" section, the city-spotlight widget) with no status filter
// at all — cancelled/postponed events could appear in those listings.
// Those call sites now filter with LIVE_EVENT_STATUSES too, same as here.
//
// Separately, a status can still be reached directly — a bookmarked or
// shared /events/[slug] link to a since-cancelled/postponed show. That
// page must keep resolving (never 404 — event history isn't deleted),
// but every actual ticket-purchase CTA on it (and on EventCard) must be
// disabled for exactly these three statuses. 'sold_out' and 'cancelled'
// were already handled this way at most call sites; 'postponed' was not
// handled ANYWHERE until this fix — a postponed event's detail page
// rendered a fully live "Get Tickets" buy flow, identical to a normal
// on-sale show.
export function ticketPurchaseDisabledStatus(status: string): boolean {
  return status === 'sold_out' || status === 'cancelled' || status === 'postponed'
}

// Drops repeat rows of the same real-world show (multiple Ticketmaster SKUs
// — "Standard Entry" / "Venue Premium" / etc. — share a title) and caps the
// result. Pool is expected to already be sorted the way callers want it.
// "Same show" = same title AT THE SAME VENUE ON THE SAME DATE. Title alone collapsed a
// 16-date tour (every night titled just "Lighthouse Family") into one date.
export function dedupeEventsByTitle(pool: EventWithVenue[], limit: number): EventWithVenue[] {
  const seen = new Set<string>()
  const picked: EventWithVenue[] = []
  for (const ev of pool) {
    const key = `${ev.title}|${ev.venue_id ?? ''}|${ev.start_date ?? ''}`
    if (seen.has(key)) continue
    seen.add(key)
    picked.push(ev)
    if (picked.length >= limit) break
  }
  return picked
}

interface EventsThisWeekOpts {
  city?: string
  limit: number
  /** Pool size fetched PER DAY (most prominent first) before mixing. */
  fetchLimit?: number
}

// A mixed selection of what's happening in the next 7 days, shown soonest
// first (see fetchEventsThisWeek below for how the mix is chosen — it is no
// longer "the first N rows by date", which let one day or one attraction
// flood the list). Cancelled/postponed
// rows are excluded (LIVE_EVENT_STATUSES) — a cancelled show was never a
// genuine "happening this week" opportunity. Pass `city` to scope to one
// city's page; omit it for the national homepage section.
// Pure window boundary for "This Week" — exported (and pulled out of
// fetchEventsThisWeek below) specifically so it's directly unit-testable
// without a live SupabaseClient, matching tonight.ts's own pure/DB split.
// Starts tomorrow's London midnight, not "now": today's events belong
// only in Tonight (fetchTonightEvents below) — showing them here too
// would duplicate every one of tonight's cards into This Week as well.
// Spans 7 London calendar days from there (tomorrow through 7 days after
// that). Built from the same londonDaysAheadWindow Tonight and the admin
// dashboard already use, so "today"/"tomorrow" can never drift between
// the two sections — and because it's a pure function of `now`, the
// boundary rolls forward automatically on every call after midnight
// London time, with no separate "rollover" code path to maintain.
export function eventsThisWeekWindow(now: Date = new Date()): DateWindow {
  return {
    startISO: londonDaysAheadWindow(now, 1).endISO, // tomorrow's London midnight
    endISO:   londonDaysAheadWindow(now, 8).endISO, // 8 days ahead's London midnight
  }
}

// The 7 London calendar days of This Week as [start, end) windows, tomorrow
// first. Built from the same boundaries as eventsThisWeekWindow so the pool
// covers exactly that window.
export function eventsThisWeekDayWindows(now: Date = new Date()): DateWindow[] {
  const windows: DateWindow[] = []
  for (let day = 1; day <= 7; day++) {
    windows.push({
      startISO: londonDaysAheadWindow(now, day).endISO,
      endISO:   londonDaysAheadWindow(now, day + 1).endISO,
    })
  }
  return windows
}

// A plain "soonest first" fetch lets the earliest day flood the list (every
// timed-entry attraction starts at 10:00), so the pool is fetched per day —
// the most prominent events of each day — and mixEvents then spreads the
// final list across days and categories, one card per show, with a cap per
// venue and on attractions. Output is still soonest first.
export async function fetchEventsThisWeek(
  supabase: SupabaseClient,
  { city, limit, fetchLimit = 100 }: EventsThisWeekOpts,
): Promise<EventWithVenue[]> {
  const windows = eventsThisWeekDayWindows()

  const days = await Promise.all(windows.map(async ({ startISO, endISO }) => {
    let query = supabase
      .from('listed_events_with_venue')
      .select('*')
      .gte('start_date', startISO)
      .lt('start_date', endISO)
      .in('status', LIVE_EVENT_STATUSES)
      .order('is_featured',    { ascending: false })
      .order('venue_capacity', { ascending: false, nullsFirst: false })
      .order('start_date',     { ascending: true })
      .limit(fetchLimit)

    if (city) query = query.ilike('venue_city', city)

    const { data } = await query as unknown as { data: EventWithVenue[] | null }
    return data ?? []
  }))

  return mixEvents(days.flat(), {
    limit,
    maxPerVenue: limit <= 12 ? 2 : 3,
    maxAttractions: limit <= 12 ? 1 : 2,
    mode: 'week',
  })
}

// Same per-day fetch + mix as fetchEventsThisWeek, over the coming weekend
// (Fri 17:00 - Sun night) for the "{city} this weekend" pages.
export async function fetchEventsThisWeekend(
  supabase: SupabaseClient,
  { city, limit, fetchLimit = 100 }: EventsThisWeekOpts,
): Promise<EventWithVenue[]> {
  const days = await Promise.all(londonWeekendDayWindows(new Date()).map(async ({ startISO, endISO }) => {
    let query = supabase
      .from('listed_events_with_venue')
      .select('*')
      .gte('start_date', startISO)
      .lt('start_date', endISO)
      .in('status', LIVE_EVENT_STATUSES)
      .order('is_featured',    { ascending: false })
      .order('venue_capacity', { ascending: false, nullsFirst: false })
      .order('start_date',     { ascending: true })
      .limit(fetchLimit)
    if (city) query = query.ilike('venue_city', city)
    const { data } = await query as unknown as { data: EventWithVenue[] | null }
    return data ?? []
  }))
  return mixEvents(days.flat(), {
    limit,
    maxPerVenue: limit <= 12 ? 2 : 3,
    maxAttractions: limit <= 12 ? 1 : 2,
    mode: 'week',
  })
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
  { city, fetchLimit = 400, limit = 60 }: { city?: string; fetchLimit?: number; limit?: number },
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
  // Premium / lounge package records are not separate "tonight" entries.
  const filtered = (await dropDuplicateEvents(supabase, rows)).filter(e => isTonightEvent(e, now, window))
  // Chronological, but timed-entry attractions are collapsed to one entry each
  // (and capped) so 10:00 entry slots don't bury the evening's shows.
  return trimTonight(sortTonightEvents(filtered), { limit })
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
  { city, limit, fetchLimit = 150, horizonDays = 60 }: TopEventsOpts,
): Promise<EventWithVenue[]> {
  const now = new Date()
  // Starts exactly where fetchEventsThisWeek's own window ends, rather
  // than a separately-computed "+7 days" — these two pools must never
  // gap or overlap, or the same show could either go missing from both
  // sections or double up in both.
  const weekEnd = eventsThisWeekWindow(now).endISO
  const horizon = new Date(now.getTime() + horizonDays * DAY_MS).toISOString()

  let query = supabase
    .from('listed_events_with_venue')
    .select('*')
    .gte('start_date', weekEnd)
    .lte('start_date', horizon)
    .in('status', LIVE_EVENT_STATUSES)
    .order('is_featured',    { ascending: false })
    .order('venue_capacity', { ascending: false, nullsFirst: false })
    .order('start_date',     { ascending: true })
    .limit(fetchLimit)

  if (city) query = query.ilike('venue_city', city)

  const { data } = await query as unknown as { data: EventWithVenue[] | null }
  // Ranked by prominence, but one arena can't supply every card.
  return mixEvents(data ?? [], { limit, maxPerVenue: 2, maxAttractions: 1, mode: 'ranked' })
}

interface CityEventsAheadOpts {
  city: string
  /** London calendar days ahead the window covers. */
  days: number
  limit: number
  /** Events already shown elsewhere on the page (never repeated). */
  excludeIds?: string[]
  /** The show being viewed: other dates of it are not "more in the city". */
  excludeTitle?: string
  fetchLimit?: number
}

// "More in {city}" on an event page: the biggest shows in the same city over
// the next `days` days, one card per show, at most two per venue, no
// attraction tickets. Returned soonest first.
export async function fetchCityEventsAhead(
  supabase: SupabaseClient,
  { city, days, limit, excludeIds = [], excludeTitle, fetchLimit = 120 }: CityEventsAheadOpts,
): Promise<EventWithVenue[]> {
  const now = new Date()
  const endISO = londonDaysAheadWindow(now, days).endISO
  const { data } = await supabase
    .from('listed_events_with_venue')
    .select('*')
    .gte('start_date', now.toISOString())
    .lt('start_date', endISO)
    .in('status', LIVE_EVENT_STATUSES)
    .ilike('venue_city', city)
    .order('is_featured',    { ascending: false })
    .order('venue_capacity', { ascending: false, nullsFirst: false })
    .order('start_date',     { ascending: true })
    .limit(fetchLimit) as unknown as { data: EventWithVenue[] | null }

  const skip = new Set(excludeIds)
  const skipTitle = excludeTitle?.trim().toLowerCase()
  const pool = (data ?? []).filter(e =>
    !skip.has(e.id) && (!skipTitle || e.title.trim().toLowerCase() !== skipTitle),
  )
  const picked = mixEvents(pool, { limit, maxPerVenue: 2, maxAttractions: 0, mode: 'ranked' })
  return picked.sort((a, b) => a.start_date.localeCompare(b.start_date))
}

interface RecentlyAddedOpts {
  city: string
  limit: number
  days?: number
}

// "Just added in {city}": shows that first appeared in our listings in the last
// `days` days (events.created_at), at upcoming dates, one card per show with the
// usual per-venue cap and no attraction tickets. A real freshness signal for the
// page, not a recycled "featured" list. Soonest date first.
export async function fetchRecentlyAddedEvents(
  supabase: SupabaseClient,
  { city, limit, days = 7 }: RecentlyAddedOpts,
): Promise<EventWithVenue[]> {
  const now = new Date()
  const since = new Date(now.getTime() - days * DAY_MS).toISOString()

  // events_with_venue has no created_at, so find the new ids on the events table.
  const { data: recent } = await supabase
    .from('events')
    .select('id, venue:venues!inner(city)')
    .ilike('venues.city', city)
    .gte('created_at', since)
    .gte('start_date', now.toISOString())
    .in('status', LIVE_EVENT_STATUSES)
    .order('created_at', { ascending: false })
    .limit(150) as unknown as { data: { id: string }[] | null }

  const ids = (recent ?? []).map(r => r.id)
  if (!ids.length) return []

  const { data } = await supabase
    .from('listed_events_with_venue')
    .select('*')
    .in('id', ids)
    .order('is_featured',    { ascending: false })
    .order('venue_capacity', { ascending: false, nullsFirst: false })
    .order('start_date',     { ascending: true }) as unknown as { data: EventWithVenue[] | null }

  const picked = mixEvents(data ?? [], { limit, maxPerVenue: 2, maxAttractions: 0, mode: 'ranked' })
  return picked.sort((a, b) => a.start_date.localeCompare(b.start_date))
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
    .from('listed_events_with_venue')
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
  { city, limit, fetchLimit = 250 }: PresalesOpenNowOpts,
): Promise<OnSaleGroup[]> {
  // VIP / bar / hospitality packages are products against a show, not shows: never a presale card.
  const data = dropPackageListings(await fetchPresalesOpenNowEvents(supabase, { city, fetchLimit }))
  // Biggest shows first (venue size), then the earliest presale, so the few cards shown are the high-profile
  // presales rather than whichever small-room show happens to close soonest.
  const ranked = rankOnSaleGroups(groupEventsByArtist(data, artists))
  // A handful of cards: also stop one team/tour filling them (a long list, e.g. the link checker's, is left whole).
  return (limit <= 24 ? capGroupsBySeries(ranked) : ranked).slice(0, limit)
}

// ── Whole-tour dates for a card ─────────────────────────────────────────
//
// A card's group only holds the dates whose sale opens in the window, but its
// click-through page lists the artist's WHOLE upcoming tour. This is the one place
// that gathers those other dates (the page uses it for its list, the cards use it
// for their "N UK dates" line), so the tile can never disagree with the page.
const chunk = <T,>(arr: T[], n: number): T[][] => {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n))
  return out
}

const TOUR_COUNT_COLUMNS = 'id,title,start_date,venue_id,venue_name,venue_city'

/** The artist's other upcoming dates per group slug (not yet merged with the group's own). */
export async function fetchOtherTourDates(
  supabase: SupabaseClient,
  groups: OnSaleGroup[],
  columns: string = TOUR_COUNT_COLUMNS,
): Promise<Map<string, EventWithVenue[]>> {
  const nowISO = new Date().toISOString()
  const out = new Map<string, EventWithVenue[]>()
  const push = (slug: string, e: EventWithVenue) => {
    const list = out.get(slug) ?? []
    list.push(e)
    out.set(slug, list)
  }

  // Groups with an artist record: dates linked to that artist.
  const withArtist = groups.filter(g => g.dbArtist?.id)
  const slugsByArtist = new Map<string, string[]>()
  for (const g of withArtist) slugsByArtist.set(g.dbArtist!.id, [...(slugsByArtist.get(g.dbArtist!.id) ?? []), g.slug])
  const eventSlugs = new Map<string, Set<string>>() // event id -> slugs it belongs to
  await Promise.all(chunk([...slugsByArtist.keys()], 15).map(async ids => {
    const { data } = await supabase
      .from('event_artists')
      .select('artist_id, event_id, events!inner(start_date, status)')
      .in('artist_id', ids)
      .gte('events.start_date', nowISO)
      .in('events.status', LIVE_EVENT_STATUSES)
      .limit(1000) as unknown as { data: { artist_id: string; event_id: string }[] | null }
    for (const l of data ?? []) {
      for (const slug of slugsByArtist.get(l.artist_id) ?? []) {
        const set = eventSlugs.get(l.event_id) ?? new Set<string>()
        set.add(slug)
        eventSlugs.set(l.event_id, set)
      }
    }
  }))
  await Promise.all(chunk([...eventSlugs.keys()], 100).map(async ids => {
    const { data } = await supabase.from('listed_events_with_venue').select(columns).in('id', ids) as unknown as { data: EventWithVenue[] | null }
    for (const e of data ?? []) for (const slug of eventSlugs.get(e.id) ?? []) push(slug, e)
  }))

  // Groups with no artist record: same-name events by title (how the group formed).
  const plain = groups.filter(g => !g.dbArtist?.id)
  await Promise.all(chunk(plain, 15).map(async part => {
    const orFilter = part.map(g => `title.ilike.${g.artistName.replace(/[%_\\,()]/g, ' ').trim()}%`).join(',')
    const { data } = await supabase
      .from('listed_events_with_venue').select(columns)
      .gte('start_date', nowISO)
      .in('status', LIVE_EVENT_STATUSES)
      .or(orFilter)
      .limit(1000) as unknown as { data: EventWithVenue[] | null }
    const wanted = new Set(part.map(g => g.slug))
    for (const e of data ?? []) {
      const slug = onSaleSlugOf(e.title)
      if (wanted.has(slug)) push(slug, e)
    }
  }))
  return out
}

/** Same groups, each with `dateCount` = the number of dates its page lists. Call for the groups actually shown. */
export async function attachTourDateCounts(supabase: SupabaseClient, groups: OnSaleGroup[]): Promise<OnSaleGroup[]> {
  if (groups.length === 0) return groups
  try {
    const others = await fetchOtherTourDates(supabase, groups)
    return groups.map(g => ({ ...g, dateCount: mergeTourDates(g.events, others.get(g.slug) ?? []).events.length }))
  } catch {
    return groups // card falls back to the dates in its own pool
  }
}

interface OnSaleThisWeekOpts {
  city?: string
  limit: number
  /** Fetch pool size before dedupe/limit — leave generous room for repeats. */
  fetchLimit?: number
}

// Events whose genuine general (public) on-sale date falls within the
// current Monday-Sunday UK week (onSaleThisWeekWindow — see on-sale.ts)
// — "Tickets just released" content for the homepage, the
// /on-sale-this-week listing, and each city page's On Sale This Week
// section. Deliberately queries onsale_date ONLY, never presale_start:
// mixing the two here would make "On Sale This Week" partly duplicate
// "Presales Open Now" (they're meant to stay two separate sections — an
// artist whose presale opens this week but whose public on-sale hasn't
// belongs only in Presales Open Now until that public date actually
// arrives). onsale_date is also the more complete column of the two
// genuine-date fields: the sync always writes it alongside
// public_onsale_start with the same value, but a one-off backfill
// (scripts/backfill-onsale-dates.ts) has also populated onsale_date
// alone for some older rows — querying it directly picks those up too,
// rather than only the subset that also has public_onsale_start set.
// Never infers a date from the event's own start_date (see
// hasReliableOnSaleDate in on-sale.ts) — an event with no onsale_date at
// all simply can't satisfy a .gte/.lte range filter against a null
// column, so it's excluded for free, not guessed at.
//
// Also excludes cancelled/postponed rows (LIVE_EVENT_STATUSES) and
// anything whose start_date has already passed — a show that's already
// happened, or been pulled, was never a genuine "on sale" opportunity
// regardless of what its onsale_date says.
export async function fetchOnSaleThisWeekEvents(
  supabase: SupabaseClient,
  { city, fetchLimit = 500 }: { city?: string; fetchLimit?: number },
): Promise<EventWithVenue[]> {
  const { floorISO, ceilISO } = onSaleThisWeekWindow()
  const nowISO = new Date().toISOString()

  let query = supabase
    .from('listed_events_with_venue')
    .select('*')
    .gte('onsale_date', floorISO)
    .lte('onsale_date', ceilISO)
    .gte('start_date', nowISO)
    .in('status', LIVE_EVENT_STATUSES)
    .order('onsale_date', { ascending: true })
    .limit(fetchLimit)

  if (city) query = query.ilike('venue_city', city)

  const { data } = await query as unknown as { data: EventWithVenue[] | null }
  return dropPackageListings(data ?? [])
}

// Grouped, deduped version of the above — one card per artist/promoter
// rather than one per Ticketmaster SKU row ("Standard Entry" / "Venue
// Premium" / etc. sharing a title) — with a deterministic per-series cap
// (capGroupsBySeries, on-sale.ts) applied before the final limit, so a
// team or artist with many fixtures/dates going on sale in the same
// window can't fill every slot in the capped list. The cap is applied to
// the FULL sorted candidate pool, before slicing to `limit`, so it's the
// pool's own diversity that's capped, not just whatever happened to
// survive an earlier arbitrary cut.
export async function fetchOnSaleThisWeek(
  supabase: SupabaseClient,
  artists: Artist[],
  { city, limit, fetchLimit = 500 }: OnSaleThisWeekOpts,
): Promise<OnSaleGroup[]> {
  const now           = new Date()
  const data          = dropPastSales(await fetchOnSaleThisWeekEvents(supabase, { city, fetchLimit }), now)
  const deduped       = dedupeEventsByTitle(data, fetchLimit)
  const groups        = groupEventsByArtist(deduped, artists, now)
  const diversified   = capGroupsBySeries(groups)
  return diversified.slice(0, limit)
}

interface NearbyEventsOpts {
  areas: NearbyArea[]
  limit: number
  /** How far ahead to look. Nearby towns are a "worth the trip" list, so wider than this week. */
  horizonDays?: number
  fetchLimit?: number
}

// Shows in the towns around a hub city (see nearbyAreas.ts), soonest first, out to
// 90 days (a 45-day window hid a theatre's later dates behind the next few football fixtures).
// Same live-status rules and per-venue / attraction caps as the other pools, so
// one venue can't fill the strip. No page of its own exists for these towns:
// they appear on the hub's city page.
export async function fetchNearbyEvents(
  supabase: SupabaseClient,
  { areas, limit, horizonDays = 90, fetchLimit = 40 }: NearbyEventsOpts,
): Promise<EventWithVenue[]> {
  if (!nearbyOrFilter(areas)) return []
  const now = new Date()
  const horizon = new Date(now.getTime() + horizonDays * DAY_MS).toISOString()

  // One query per town, so a big arena city (or a stadium with a run of fixtures)
  // can never push a small town's shows out of the pool.
  const perTown = await Promise.all(areas.map(async area => {
    const filter = nearbyOrFilter([area])
    if (!filter) return [] as EventWithVenue[]
    const { data } = await supabase
      .from('listed_events_with_venue')
      .select('*')
      .gte('start_date', now.toISOString())
      .lte('start_date', horizon)
      .in('status', LIVE_EVENT_STATUSES)
      .or(filter)
      .order('is_featured',    { ascending: false })
      .order('venue_capacity', { ascending: false, nullsFirst: false })
      .order('start_date',     { ascending: true })
      .limit(fetchLimit) as unknown as { data: EventWithVenue[] | null }
    // Per-town pick: at most 2 per venue, 1 attraction, and no more than 4 in all.
    return mixEvents(data ?? [], { limit: 4, maxPerVenue: 2, maxAttractions: 1, mode: 'ranked' })
  }))

  // Round-robin across the towns (one show from each town per pass), so the strip
  // mixes places, venues and categories instead of three fixtures from one ground.
  const queues = perTown.filter(q => q.length > 0)
  const picked: EventWithVenue[] = []
  const seenCategoryByTown = new Map<string, number>()
  for (let round = 0; picked.length < limit && queues.some(q => q.length > 0); round++) {
    for (const q of queues) {
      if (picked.length >= limit) break
      if (q.length === 0) continue
      // Prefer a show whose category this town hasn't contributed yet.
      const town = areaForVenueCity(areas, q[0].venue_city)?.name ?? ''
      const idx = q.findIndex(e => !seenCategoryByTown.has(`${town}|${e.category}`))
      const [e] = q.splice(idx === -1 ? 0 : idx, 1)
      seenCategoryByTown.set(`${town}|${e.category}`, 1)
      picked.push(e)
    }
  }
  return picked.sort((a, b) => a.start_date.localeCompare(b.start_date))
}

export const BROWSE_CATEGORIES = ['concert', 'theatre', 'comedy', 'sports', 'family'] as const

// How many upcoming shows a city has in each main category, for the
// "browse by type" strip (only types that have shows are offered). One cheap
// head-count per category. A failed count is treated as "unknown", not zero,
// so a transient error never hides the strip's real options as an empty city.
export async function fetchCityCategoryCounts(
  supabase: SupabaseClient,
  city: string,
): Promise<Record<string, number | null>> {
  const nowISO = new Date().toISOString()
  const results = await Promise.all(BROWSE_CATEGORIES.map(async category => {
    const res = await listedEventsCount(supabase, { city, category, fromISO: nowISO })
    return [category, res.error ? null : (res.count ?? 0)] as const
  }))
  return Object.fromEntries(results)
}
