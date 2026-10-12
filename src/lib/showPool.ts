// Database fetchers for the West End and Attractions hubs. The grouping and
// classification rules live in shows.ts / eventMix.ts (pure, tested); this file
// only narrows the query and pages through PostgREST's 1000-row cap.
//
// West End: look up London's venues first (a small table), keep the ones the
// venue list recognises, then fetch events by venue_id. That is far more
// reliable than a long text-match filter, and exact.

import { cache } from 'react'
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

  const { count, error: countError } = await windowed(
    supabase.from('events_with_venue').select('id', { count: 'exact', head: true }),
  ) as { count: number | null; error: DbError }
  if (countError) throw new Error(`count failed: ${countError.message}`)
  const total = count ?? 0
  if (total === 0) return []

  return fetchAllPagesParallel<Row>(
    total,
    (from, to) => windowed(supabase.from('events_with_venue').select(COLUMNS))
      .order('start_date', { ascending: true })
      .order('id', { ascending: true })
      .range(from, to) as PromiseLike<Page<Row>>,
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

/** Every West End show with upcoming performances (one entry per show). */
export async function fetchWestEndShows(supabase: SupabaseClient, horizonDays = 365): Promise<Show[]> {
  try {
    const venues = await fetchWestEndVenues(supabase)
    if (venues.length === 0) {
      console.error('[west-end] no London venues matched the West End venue list')
      return []
    }
    const venueIds = venues.map(v => v.id)
    const slugById = new Map(venues.map(v => [v.id, v.slug]))
    const rows = await fetchEventRows(supabase, horizonDays, q => q.in('venue_id', venueIds))
    return westEndShows(rows.map(r => ({ ...r, venue_slug: r.venue_id ? slugById.get(r.venue_id) ?? null : null })))
  } catch (err) {
    console.error('[west-end] fetch failed', err)
    return []
  }
}

// Splits the attraction terms into small groups so each query's filter stays
// short; results are merged by event id.
function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

/** Every attraction / timed-entry experience with upcoming availability. */
export async function fetchAttractionShows(supabase: SupabaseClient, horizonDays = 60): Promise<Show[]> {
  try {
    const terms = ATTRACTION_SEARCH_TERMS.filter(t => !/[,()%*]/.test(t))
    const groups = chunk(terms, 8)
    const results = await Promise.all(groups.map(group =>
      fetchEventRows(supabase, horizonDays, q => q.or(
        group.flatMap(t => [`title.ilike.%${t}%`, `venue_name.ilike.%${t}%`]).join(','),
      )),
    ))
    const byId = new Map<string, Row>()
    for (const rows of results) for (const r of rows) byId.set(r.id, r)
    return attractionShows([...byId.values()])
  } catch (err) {
    console.error('[attractions] fetch failed', err)
    return []
  }
}

// Per-request cached versions for pages: a page's generateMetadata and its body
// share one fetch instead of each paging through the database.
export const getWestEndShows = cache(async (): Promise<Show[]> =>
  fetchWestEndShows(createPublicClient()))
export const getAttractionShows = cache(async (): Promise<Show[]> =>
  fetchAttractionShows(createPublicClient()))
