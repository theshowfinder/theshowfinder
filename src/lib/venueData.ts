// Database reads for the city page's venue discovery section. The ranking and
// labelling logic itself lives in venueDiscovery.ts (pure, tested).

import type { SupabaseClient } from '@supabase/supabase-js'
import { LIVE_EVENT_STATUSES } from './eventPools.ts'
import { areaForVenueCity, nearbyOrFilter, type NearbyArea } from './nearbyAreas.ts'
import { rankVenues, type DiscoveryVenue, type RankedVenue, type VenueEventRow } from './venueDiscovery.ts'

// Upcoming shows for a set of venues in one query, soonest first, used to work
// out each venue's next show and what it mostly puts on. PostgREST returns at
// most 1000 rows, which for a very large city means the venues whose first show
// is further out may have no "next show" line; that degrades gracefully (the
// exact show counts come from separate count queries).
export async function fetchVenueEventRows(supabase: SupabaseClient, venueIds: string[]): Promise<VenueEventRow[]> {
  if (venueIds.length === 0) return []
  const { data } = await supabase
    .from('listed_events_with_venue')
    .select('venue_id, title, start_date, category')
    .in('venue_id', venueIds)
    .in('status', LIVE_EVENT_STATUSES)
    .gte('start_date', new Date().toISOString())
    .order('start_date', { ascending: true })
    .limit(1000) as unknown as { data: VenueEventRow[] | null }
  return data ?? []
}

export type NearbyRankedVenue = RankedVenue & { town: string | null }

// Venues in the towns around a hub city, ranked the same way, each labelled with
// its town. Counts come from the fetched rows: these towns are small, so the
// 1000-row cap is not a concern.
export async function fetchNearbyRankedVenues(supabase: SupabaseClient, areas: NearbyArea[]): Promise<NearbyRankedVenue[]> {
  const filter = nearbyOrFilter(areas, 'city')
  if (!filter) return []
  const { data } = await supabase
    .from('venues')
    .select('id, name, slug, capacity, address, city')
    .or(filter)
    .limit(40) as unknown as { data: (DiscoveryVenue & { city: string })[] | null }
  const venues = data ?? []
  if (venues.length === 0) return []

  const rows = await fetchVenueEventRows(supabase, venues.map(v => v.id))
  const counts: Record<string, number> = {}
  for (const r of rows) counts[r.venue_id] = (counts[r.venue_id] ?? 0) + 1

  return rankVenues(venues, counts, rows).map(v => ({ ...v, town: areaForVenueCity(areas, v.city)?.name ?? v.city ?? null }))
}
