// Fetches a city's venues with their count of upcoming shows and ranks them (src/lib/mainVenues.ts).
import { rankMainVenues, type MainVenue, type VenueRow } from '@/lib/mainVenues'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function fetchMainVenues(client: any, city: string): Promise<MainVenue[]> {
  try {
    const { data, error } = await client.from('venues')
      .select('name, lat, lng, capacity, events(count)')
      .ilike('city', city)
      .not('lat', 'is', null)
      .gte('events.start_date', new Date().toISOString())
      .limit(500)
    if (error || !data) return []
    const rows: VenueRow[] = (data as { name: string; lat: number | null; lng: number | null; capacity: number | null; events: { count: number }[] | null }[])
      .map(v => ({ name: v.name, lat: v.lat, lng: v.lng, capacity: v.capacity, upcoming: v.events?.[0]?.count ?? 0 }))
      .filter(v => (v.upcoming ?? 0) > 0 || (v.capacity ?? 0) > 0)
    return rankMainVenues(rows, city)
  } catch {
    return []
  }
}
