// A city's upcoming shows as a subscribable calendar: /calendar/cities/Manchester.ics
import { createPublicClient } from '@/lib/supabase/public'
import { LIVE_EVENT_STATUSES } from '@/lib/eventPools'
import { CITIES } from '@/lib/cities'
import { showFeedEvents, type FeedRow } from '@/lib/calendarFeeds'
import { icsResponse } from '@/lib/calendarResponse'

export const revalidate = 3600

export async function GET(_req: Request, { params }: { params: Promise<{ city: string }> }) {
  const { city: raw } = await params
  const name = decodeURIComponent(raw).replace(/\.ics$/i, '')
  const city = CITIES.find(c => c.name.toLowerCase() === name.toLowerCase())
  if (!city) return new Response('Not found', { status: 404 })

  const nowISO = new Date().toISOString()
  const horizon = new Date(Date.now() + 120 * 86_400_000).toISOString()
  const { data } = await createPublicClient()
    .from('listed_events_with_venue')
    .select('slug, title, start_date, venue_name, venue_city, public_onsale_start, presale_start, presale_name')
    .ilike('venue_city', city.name)
    .in('status', LIVE_EVENT_STATUSES)
    .gte('start_date', nowISO)
    .lte('start_date', horizon)
    .order('start_date', { ascending: true })
    .limit(800) as unknown as { data: FeedRow[] | null }

  return icsResponse(
    `${city.name} gigs & shows: TheShowFinder`,
    `Upcoming concerts, theatre, comedy and sport in ${city.name} over the next four months, with ticket links. From theshowfinder.com`,
    showFeedEvents(data ?? []),
    `${city.name}-shows.ics`,
  )
}
