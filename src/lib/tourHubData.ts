// Loads recently added shows for the /new-tours hub. Same select and flattening
// as the news detector, but with the cookie-free public client so the page can
// be ISR-cached.
import { createPublicClient } from '@/lib/supabase/public'
import { LIVE_EVENT_STATUSES } from '@/lib/eventPools'
import type { NewShowRow } from '@/lib/newShows'
import { HUB_WINDOW_DAYS, buildTourAnnouncements, type TourAnnouncement } from '@/lib/tourHub'

const SELECT =
  'id,title,category,start_date,created_at,venue:venues(name,city,capacity),event_artists(is_headliner,artist:artists(id,name,slug,created_at))'

interface Row {
  id: string
  title: string
  category: string | null
  start_date: string
  created_at: string
  venue: { name: string | null; city: string | null; capacity: number | null } | null
  event_artists: {
    is_headliner: boolean | null
    artist: { id: string; name: string; slug: string; created_at: string } | null
  }[] | null
}

export async function loadTourAnnouncements(now = new Date()): Promise<TourAnnouncement[]> {
  const since = new Date(now.getTime() - HUB_WINDOW_DAYS * 86_400_000).toISOString()
  const { data, error } = await createPublicClient()
    .from('events')
    .select(SELECT)
    .gte('created_at', since)
    .gte('start_date', now.toISOString())
    .in('status', LIVE_EVENT_STATUSES)
    .order('created_at', { ascending: false })
    .limit(2000)
  // Throw so ISR keeps the last good page rather than caching an empty one.
  if (error) throw new Error(`new-tours: ${error.message}`)

  const rows: NewShowRow[] = ((data ?? []) as unknown as Row[]).map(e => {
    const eas = e.event_artists ?? []
    const head = eas.find(x => x.is_headliner && x.artist) ?? eas.find(x => x.artist)
    return {
      event_id: e.id,
      title: e.title,
      category: e.category,
      start_date: e.start_date,
      created_at: e.created_at,
      venue_name: e.venue?.name ?? null,
      venue_city: e.venue?.city ?? null,
      venue_capacity: e.venue?.capacity ?? null,
      public_onsale_start: null,
      artist_id: head?.artist?.id ?? null,
      artist_name: head?.artist?.name ?? null,
      artist_slug: head?.artist?.slug ?? null,
      artist_created_at: head?.artist?.created_at ?? null,
    }
  })
  return buildTourAnnouncements(rows, now)
}
