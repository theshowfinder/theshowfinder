// Data for a city's morning edition (see cityBrief.ts for how it is arranged). All reads come from the
// de-duplicated listed view, so cancelled shows and package variants never reach the tiles.
import type { SupabaseClient } from '@supabase/supabase-js'
import type { EventWithVenue } from './types/database'
import { londonDayWindow, londonDaysAheadWindow } from './intelligence.ts'
import { fetchPresalesOpenNowEvents } from './eventPools.ts'
import { stalestSync } from './cityBrief.ts'

export interface CityEditionData {
  today: EventWithVenue[]
  soon: EventWithVenue[]
  onSaleToday: EventWithVenue[]
  presaleOpen: EventWithVenue[]
  fresh: EventWithVenue[]
  upcoming: EventWithVenue[]
  lastSyncedAt: string | null
}

type Rows = { data: EventWithVenue[] | null }

const EMPTY: CityEditionData = { today: [], soon: [], onSaleToday: [], presaleOpen: [], fresh: [], upcoming: [], lastSyncedAt: null }

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
  const weekEnd = londonDaysAheadWindow(now, 8).endISO
  const nowISO = now.toISOString()
  const base = () => supabase.from('listed_events_with_venue').select('*').ilike('venue_city', city)

  const [today, soon, onSaleToday, presaleOpen, fresh, upcoming, latest] = await Promise.all([
    base().gte('start_date', day.startISO).lt('start_date', day.endISO).order('start_date', { ascending: true }).limit(30) as unknown as Promise<Rows>,
    base().gte('start_date', day.endISO).lt('start_date', weekEnd).order('venue_capacity', { ascending: false, nullsFirst: false }).limit(30) as unknown as Promise<Rows>,
    base().gte('onsale_date', day.startISO).lt('onsale_date', day.endISO).gte('start_date', nowISO).order('venue_capacity', { ascending: false, nullsFirst: false }).limit(30) as unknown as Promise<Rows>,
    fetchPresalesOpenNowEvents(supabase, { city, fetchLimit: 30 }),
    base().eq('newly_announced', true).gte('start_date', nowISO).order('venue_capacity', { ascending: false, nullsFirst: false }).limit(20) as unknown as Promise<Rows>,
    base().gte('start_date', nowISO).order('start_date', { ascending: true }).limit(12) as unknown as Promise<Rows>,
    // The stamp is only as fresh as the STALEST of the city's next 100 shows, so one recently touched event cannot make a stale city look fresh.
    supabase.from('listed_events_with_venue').select('last_synced_at').ilike('venue_city', city).gte('start_date', nowISO)
      .order('start_date', { ascending: true }).limit(100) as unknown as Promise<{ data: Array<{ last_synced_at: string | null }> | null }>,
  ])

  return {
    today: today.data ?? [],
    soon: soon.data ?? [],
    onSaleToday: onSaleToday.data ?? [],
    presaleOpen,
    fresh: fresh.data ?? [],
    upcoming: upcoming.data ?? [],
    lastSyncedAt: stalestSync(latest.data ?? []),
  }
}
