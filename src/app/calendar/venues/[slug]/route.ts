// A venue's upcoming shows as a subscribable calendar: /calendar/venues/<slug>.ics
import { createPublicClient } from '@/lib/supabase/public'
import { LIVE_EVENT_STATUSES } from '@/lib/eventPools'
import { showFeedEvents, type FeedRow } from '@/lib/calendarFeeds'
import { icsResponse } from '@/lib/calendarResponse'

export const revalidate = 3600

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug: raw } = await params
  const slug = decodeURIComponent(raw).replace(/\.ics$/i, '')
  const supabase = createPublicClient()
  const { data: venue } = await supabase.from('venues').select('id, name, city').eq('slug', slug).maybeSingle() as unknown as { data: { id: string; name: string; city: string } | null }
  if (!venue) return new Response('Not found', { status: 404 })

  const { data } = await supabase
    .from('events_with_venue')
    .select('slug, title, start_date, venue_name, venue_city, public_onsale_start, presale_start, presale_name')
    .eq('venue_id', venue.id)
    .in('status', LIVE_EVENT_STATUSES)
    .gte('start_date', new Date().toISOString())
    .order('start_date', { ascending: true })
    .limit(500) as unknown as { data: FeedRow[] | null }

  return icsResponse(
    `${venue.name}: upcoming shows`,
    `Upcoming shows at ${venue.name}, ${venue.city}, with ticket links. From theshowfinder.com`,
    showFeedEvents(data ?? []),
    `${slug}.ics`,
  )
}
