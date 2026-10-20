// Data for a city's morning edition (see cityBrief.ts for how it is arranged). All reads come from the
// de-duplicated listed view, so cancelled shows and package variants never reach the tiles.
import type { SupabaseClient } from '@supabase/supabase-js'
import type { EventWithVenue } from './types/database'
import { londonDayWindow } from './intelligence.ts'
import { fetchPresalesOpenNowEvents, fetchOnSaleThisWeekEvents, LIVE_EVENT_STATUSES } from './eventPools.ts'
import { stalestSync } from './cityBrief.ts'
import { dropReReleases } from './on-sale.ts'
import { dropReissued } from './onsaleReissued.ts'

export interface CityEditionData {
  onSaleToday: EventWithVenue[]
  onSaleWeek: EventWithVenue[]
  presaleOpen: EventWithVenue[]
  top: EventWithVenue[]
  lastSyncedAt: string | null
}

type Rows = { data: EventWithVenue[] | null }

const EMPTY: CityEditionData = { onSaleToday: [], onSaleWeek: [], presaleOpen: [], top: [], lastSyncedAt: null }

const TOP_HORIZON_DAYS = 90

/** Never throws: if any read fails the edition simply has fewer tiles, and the rest of the city page is unaffected. */
export async function fetchCityEdition(supabase: SupabaseClient, city: string, now: Date = new Date()): Promise<CityEditionData> {
  try {
    return await loadCityEdition(supabase, city, now)
  } catch (err) {
    console.error('[city-edition] failed:', err instanceof Error ? err.message : err)
    return EMPTY
  }
}

async function loadCityEdition(supabase: SupabaseClient, city: string, now: Date): Promise<CityEditionData> {
  const day = londonDayWindow(now)
  const nowISO = now.toISOString()
  const topHorizon = new Date(now.getTime() + TOP_HORIZON_DAYS * 86_400_000).toISOString()
  const base = () => supabase.from('listed_events_with_venue').select('*').ilike('venue_city', city)

  const [onSaleToday, onSaleWeek, presaleOpen, top, latest] = await Promise.all([
    base().gte('onsale_date', day.startISO).lt('onsale_date', day.endISO).gte('start_date', nowISO).in('status', LIVE_EVENT_STATUSES).order('venue_capacity', { ascending: false, nullsFirst: false }).limit(30) as unknown as Promise<Rows>,
    fetchOnSaleThisWeekEvents(supabase, { city, fetchLimit: 200 }),
    fetchPresalesOpenNowEvents(supabase, { city, fetchLimit: 30 }),
    // The city's biggest upcoming shows (featured first, then venue size), from now out to ~3 months. Not limited to this week.
    base().gte('start_date', nowISO).lte('start_date', topHorizon).in('status', LIVE_EVENT_STATUSES)
      .order('is_featured', { ascending: false }).order('venue_capacity', { ascending: false, nullsFirst: false }).order('start_date', { ascending: true }).limit(60) as unknown as Promise<Rows>,
    // The stamp is only as fresh as the STALEST of the city's next 100 shows, so one recently touched event cannot make a stale city look fresh.
    supabase.from('listed_events_with_venue').select('last_synced_at').ilike('venue_city', city).gte('start_date', nowISO)
      .order('start_date', { ascending: true }).limit(100) as unknown as Promise<{ data: Array<{ last_synced_at: string | null }> | null }>,
  ])

  return {
    onSaleToday: await dropReissued(supabase, dropReReleases(onSaleToday.data ?? [])),
    onSaleWeek,
    presaleOpen,
    top: top.data ?? [],
    lastSyncedAt: stalestSync(latest.data ?? []),
  }
}
