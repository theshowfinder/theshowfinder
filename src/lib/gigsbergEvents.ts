// Shows with live Gigsberg inventory, for the /gigsberg page and its homepage link.
//
// The homepage "Featured Gigsberg events" strip only shows manually highlighted shows
// (48 hours each). This is the wider list: every upcoming show whose Gigsberg inventory
// was last checked as available, highlighted ones first. Read from the base `events`
// table because the listed view does not expose the Gigsberg columns.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { EventWithVenue } from './types/database'
import { LIVE_EVENT_STATUSES, dropDuplicateEvents } from './listedEvents'
import { mixEvents } from './eventMix'

type VenueJoin = { id: string; name: string; slug: string | null; city: string; postcode: string; capacity: number | null }
type Row = Record<string, unknown> & { id: string; venue: VenueJoin | null }

export function rowToEventWithVenue(row: Row): EventWithVenue {
  const v = row.venue!
  return {
    ...row,
    venue_id: v.id,
    venue_name: v.name,
    venue_slug: v.slug,
    venue_city: v.city,
    venue_postcode: v.postcode,
    venue_capacity: v.capacity,
  } as unknown as EventWithVenue
}

export async function fetchGigsbergAvailableEvents(
  supabase: SupabaseClient,
  { limit = 90 }: { limit?: number } = {},
): Promise<EventWithVenue[]> {
  const { data } = await supabase
    .from('events')
    .select('*, venue:venues(id, name, slug, city, postcode, capacity)')
    .eq('gigsberg_inventory_status', 'available')
    .gte('start_date', new Date().toISOString())
    .in('status', LIVE_EVENT_STATUSES)
    .order('gigsberg_highlighted', { ascending: false })
    .order('start_date', { ascending: true })
    .limit(500) as unknown as { data: Row[] | null }

  const events = (data ?? []).filter(r => r.venue).map(rowToEventWithVenue)
  // Once the automatic check covers the whole UK this is a long list; keep it varied (a cap
  // per venue, one card per show title) rather than a run of one team's home fixtures.
  const mixed = mixEvents(await dropDuplicateEvents(supabase, events), { limit, maxPerVenue: 3, maxAttractions: 2, mode: 'ranked' })
  return mixed.sort((a, b) => a.start_date.localeCompare(b.start_date))
}

/** Below this many shows the page is noindexed (a short list is not a page worth ranking). */
export const GIGSBERG_PAGE_MIN_INDEXABLE = 6
