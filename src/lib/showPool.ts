// Database fetchers for the West End and Attractions hubs. The grouping and
// classification rules live in shows.ts / eventMix.ts (pure, tested); this file
// only pre-filters in SQL (venue/title substrings) and pages through PostgREST's
// 1000-row cap.

import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchAllPagesParallel } from './pagedFetch.ts'
import { LIVE_EVENT_STATUSES } from './eventPools.ts'
import { ATTRACTION_SEARCH_TERMS } from './eventMix.ts'
import {
  attractionShows, westEndShows, westEndVenueSearchTerms, type Show, type ShowEvent,
} from './shows.ts'

const DAY_MS = 24 * 60 * 60 * 1000

const COLUMNS =
  'id, slug, title, start_date, status, category, image_url, price_from, price_to, currency, venue_name, venue_slug, venue_city'

type Row = ShowEvent
type DbResult = { data: Row[] | null; error: { message: string } | null }

// ilike values go inside a PostgREST or() list, so commas/parentheses/asterisks
// are stripped from the terms by the callers and a literal % is not allowed.
function orIlike(column: string, terms: string[]): string {
  return terms.map(t => `${column}.ilike.*${t}*`).join(',')
}

async function fetchRows(
  supabase: SupabaseClient,
  orFilter: string,
  horizonDays: number,
  cityIlike?: string,
): Promise<Row[]> {
  const nowISO = new Date().toISOString()
  const horizonISO = new Date(Date.now() + horizonDays * DAY_MS).toISOString()

  const base = () => {
    let q = supabase
      .from('events_with_venue')
      .select(COLUMNS)
      .gte('start_date', nowISO)
      .lte('start_date', horizonISO)
      .in('status', LIVE_EVENT_STATUSES)
      .or(orFilter)
    if (cityIlike) q = q.ilike('venue_city', cityIlike)
    return q
  }

  let countQuery = supabase
    .from('events_with_venue')
    .select('id', { count: 'exact', head: true })
    .gte('start_date', nowISO)
    .lte('start_date', horizonISO)
    .in('status', LIVE_EVENT_STATUSES)
    .or(orFilter)
  if (cityIlike) countQuery = countQuery.ilike('venue_city', cityIlike)
  const { count } = await countQuery
  const total = count ?? 0
  if (total === 0) return []

  return fetchAllPagesParallel<Row>(
    total,
    (from, to) => base()
      .order('start_date', { ascending: true })
      .order('id', { ascending: true })
      .range(from, to) as unknown as PromiseLike<DbResult>,
  )
}

/** Every West End show with upcoming performances (one entry per show). */
export async function fetchWestEndShows(supabase: SupabaseClient, horizonDays = 150): Promise<Show[]> {
  try {
    const rows = await fetchRows(supabase, orIlike('venue_name', westEndVenueSearchTerms()), horizonDays, 'London')
    return westEndShows(rows)
  } catch (err) {
    console.error('[west-end] fetch failed', err)
    return []
  }
}

/** Every attraction / timed-entry experience with upcoming availability. */
export async function fetchAttractionShows(supabase: SupabaseClient, horizonDays = 60): Promise<Show[]> {
  try {
    const filter = [
      orIlike('title', ATTRACTION_SEARCH_TERMS),
      orIlike('venue_name', ATTRACTION_SEARCH_TERMS),
    ].join(',')
    const rows = await fetchRows(supabase, filter, horizonDays)
    return attractionShows(rows)
  } catch (err) {
    console.error('[attractions] fetch failed', err)
    return []
  }
}

// Per-request cached versions for pages: a page's generateMetadata and its body
// share one fetch instead of each paging through the database.
export const getWestEndShows = cache(async (): Promise<Show[]> =>
  fetchWestEndShows(await createClient()))
export const getAttractionShows = cache(async (): Promise<Show[]> =>
  fetchAttractionShows(await createClient()))
