// Database fetchers for the West End and Attractions hubs. The grouping and
// classification rules live in shows.ts / eventMix.ts (pure, tested); this file
// only narrows the query and pages through PostgREST's 1000-row cap.
//
// West End: look up London's venues first (a small table), keep the ones the
// venue list recognises, then fetch events by venue_id. That is far more
// reliable than a long text-match filter, and exact.

import { cache } from 'react'
import { unstable_cache } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createPublicClient } from '@/lib/supabase/public'
import { fetchAllPages, fetchAllPagesParallel } from './pagedFetch.ts'
import { LIVE_EVENT_STATUSES } from './eventPools.ts'
import { ATTRACTION_SEARCH_TERMS } from './eventMix.ts'
import {
  attractionShows, isWestEndVenue, westEndShows, type Show, type ShowEvent,
} from './shows.ts'

const DAY_MS = 24 * 60 * 60 * 1000

// NB: events_with_venue has no venue_slug column (src/lib/types/database.ts
// claims it does, but the view doesn't — selecting it is a 400 from PostgREST,
// which is what left /west-end empty). Venue slugs come from the venues table.
const COLUMNS =
  'id, slug, title, start_date, status, category, image_url, price_from, price_to, currency, venue_id, venue_name, venue_city'

// The public (anon) database role has a 3 second statement timeout, so under
// load a perfectly good query can occasionally be cancelled. One quick retry
// clears almost all of those; a second failure is a real error and propagates.
async function withRetry<T>(fn: () => Promise<T>, attempts = 2, delayMs = 350): Promise<T> {
  let lastErr: unknown
  for (let i = 0; i < attempts; i++) {
    try { return await fn() } catch (err) {
      lastErr = err
      if (i < attempts - 1) await new Promise(r => setTimeout(r, delayMs * (i + 1)))
    }
  }
  throw lastErr
}

// Pages are fetched a few at a time, not all at once: six heavy queries in
// parallel against a small database is what pushed them over the timeout.
const PAGE_CONCURRENCY = 3

type DbError = { message: string } | null
type Row = ShowEvent & { venue_id?: string | null }
type Page<T> = { data: T[] | null; error: DbError }

// Builds the shared part of an events query (window + live statuses) and lets
// the caller add its own filter.
type Narrow = (q: any) => any // eslint-disable-line @typescript-eslint/no-explicit-any

async function fetchEventRows(
  supabase: SupabaseClient,
  horizonDays: number,
  narrow: Narrow,
): Promise<Row[]> {
  const nowISO = new Date().toISOString()
  const horizonISO = new Date(Date.now() + horizonDays * DAY_MS).toISOString()

  const windowed = (q: any) => // eslint-disable-line @typescript-eslint/no-explicit-any
    narrow(
      q.gte('start_date', nowISO)
       .lte('start_date', horizonISO)
       .in('status', LIVE_EVENT_STATUSES),
    )

  const count = await withRetry(async () => {
    const r = await windowed(
      supabase.from('listed_events_with_venue').select('id', { count: 'exact', head: true }),
    ) as { count: number | null; error: DbError }
    if (r.error) throw new Error(`count failed: ${r.error.message || 'request failed'}`)
    return r.count
  })
  const total = count ?? 0
  if (total === 0) return []

  return fetchAllPagesParallel<Row>(
    total,
    (from, to) => withRetry(async () => {
      const r = await windowed(supabase.from('listed_events_with_venue').select(COLUMNS))
        .order('start_date', { ascending: true })
        .order('id', { ascending: true })
        .range(from, to) as Page<Row>
      if (r.error) throw new Error(r.error.message || 'page fetch failed')
      return r
    }),
    undefined,
    PAGE_CONCURRENCY,
  )
}

type VenueRow = { id: string; name: string; city: string | null; slug: string | null }

async function fetchWestEndVenues(supabase: SupabaseClient): Promise<VenueRow[]> {
  const venues = await fetchAllPages<VenueRow>((from, to) =>
    supabase
      .from('venues')
      .select('id, name, city, slug')
      .ilike('city', 'London')
      .order('id', { ascending: true })
      .range(from, to) as unknown as PromiseLike<Page<VenueRow>>,
  )
  return venues.filter(v => isWestEndVenue(v.name, v.city))
}

async function loadWestEndShows(supabase: SupabaseClient, horizonDays: number): Promise<Show[]> {
  const venues = await withRetry(() => fetchWestEndVenues(supabase))
  if (venues.length === 0) throw new Error('no London venues matched the West End venue list')
  const venueIds = venues.map(v => v.id)
  const slugById = new Map(venues.map(v => [v.id, v.slug]))
  const rows = await fetchEventRows(supabase, horizonDays, q => q.in('venue_id', venueIds))
  return westEndShows(rows.map(r => ({ ...r, venue_slug: r.venue_id ? slugById.get(r.venue_id) ?? null : null })))
}

/** Every West End show with upcoming performances (one entry per show). */
export async function fetchWestEndShows(supabase: SupabaseClient, horizonDays = 365): Promise<Show[]> {
  try {
    return await loadWestEndShows(supabase, horizonDays)
  } catch (err) {
    console.error('[west-end] fetch failed', err)
    return []
  }
}

async function loadAttractionShows(supabase: SupabaseClient, horizonDays: number): Promise<Show[]> {
  const terms = ATTRACTION_SEARCH_TERMS.filter(t => !/[,()%*]/.test(t))

  // One small lookup of venues whose NAME matches, then a single events query
  // that matches on title or those venue ids. (The old version ran seven wide
  // OR queries in parallel, each also matching venue names through the view.)
  const { data: venueRows } = await withRetry(async () => {
    const r = await supabase
      .from('venues')
      .select('id')
      .or(terms.map(t => `name.ilike.%${t}%`).join(',')) as unknown as Page<{ id: string }>
    if (r.error) throw new Error(r.error.message || 'venue lookup failed')
    return r
  })
  const venueIds = (venueRows ?? []).map(v => v.id)

  const conditions = terms.map(t => `title.ilike.%${t}%`)
  if (venueIds.length) conditions.push(`venue_id.in.(${venueIds.join(',')})`)
  const rows = await fetchEventRows(supabase, horizonDays, q => q.or(conditions.join(',')))
  return attractionShows(rows)
}

/** Every attraction / timed-entry experience with upcoming availability. */
export async function fetchAttractionShows(supabase: SupabaseClient, horizonDays = 60): Promise<Show[]> {
  try {
    return await loadAttractionShows(supabase, horizonDays)
  } catch (err) {
    console.error('[attractions] fetch failed', err)
    return []
  }
}

// Page-level getters. Two layers of protection against the database being slow:
//  1. unstable_cache shares ONE fetch across every route and request for 15
//     minutes (the homepage, /west-end, /west-end/[show], the London page and
//     /attractions all need these lists; before, each rendered its own heavy
//     query). A failed fetch throws, so an error is never cached as "empty".
//  2. If a fetch still fails, the last good list held in memory is served
//     instead of an empty page.
const SHOW_CACHE_SECONDS = 10_800
const lastGood: { westEnd: Show[] | null; attractions: Show[] | null } = { westEnd: null, attractions: null }

const cachedWestEnd = unstable_cache(
  async () => loadWestEndShows(createPublicClient(), 365),
  ['show-pool-west-end-v2'],
  { revalidate: SHOW_CACHE_SECONDS, tags: ['show-pool'] },
)
const cachedAttractions = unstable_cache(
  async () => loadAttractionShows(createPublicClient(), 60),
  ['show-pool-attractions-v2'],
  { revalidate: SHOW_CACHE_SECONDS, tags: ['show-pool'] },
)

export const getWestEndShows = cache(async (): Promise<Show[]> => {
  try {
    const shows = await cachedWestEnd()
    lastGood.westEnd = shows
    return shows
  } catch (err) {
    console.error('[west-end] fetch failed', err)
    return lastGood.westEnd ?? []
  }
})

export const getAttractionShows = cache(async (): Promise<Show[]> => {
  try {
    const shows = await cachedAttractions()
    lastGood.attractions = shows
    return shows
  } catch (err) {
    console.error('[attractions] fetch failed', err)
    return lastGood.attractions ?? []
  }
})
