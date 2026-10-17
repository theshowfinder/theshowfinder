// An artist's upcoming UK shows as a subscribable calendar: /calendar/artists/<slug>.ics
import { createPublicClient } from '@/lib/supabase/public'
import { LIVE_EVENT_STATUSES } from '@/lib/eventPools'
import { showFeedEvents, type FeedRow } from '@/lib/calendarFeeds'
import { icsResponse } from '@/lib/calendarResponse'

export const revalidate = 3600

interface Link {
  events: {
    slug: string; title: string; start_date: string; status: string
    public_onsale_start: string | null; presale_start: string | null; presale_name: string | null
    venue: { name: string; city: string } | null
  } | null
}

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug: raw } = await params
  const slug = decodeURIComponent(raw).replace(/\.ics$/i, '')
  const supabase = createPublicClient()
  const { data: artist } = await supabase.from('artists').select('id, name').eq('slug', slug).maybeSingle() as unknown as { data: { id: string; name: string } | null }
  if (!artist) return new Response('Not found', { status: 404 })

  const { data } = await supabase
    .from('event_artists')
    .select('events!inner(slug, title, start_date, status, public_onsale_start, presale_start, presale_name, venue:venues(name, city))')
    .eq('artist_id', artist.id)
    .gte('events.start_date', new Date().toISOString())
    .in('events.status', LIVE_EVENT_STATUSES)
    .limit(200) as unknown as { data: Link[] | null }

  const rows: FeedRow[] = (data ?? []).flatMap(l => l.events ? [{
    slug: l.events.slug, title: l.events.title, start_date: l.events.start_date,
    venue_name: l.events.venue?.name ?? null, venue_city: l.events.venue?.city ?? null,
    public_onsale_start: l.events.public_onsale_start, presale_start: l.events.presale_start, presale_name: l.events.presale_name,
  }] : [])

  return icsResponse(
    `${artist.name}: UK shows`,
    `${artist.name}'s upcoming UK shows, with ticket links. From theshowfinder.com`,
    showFeedEvents(rows),
    `${slug}.ics`,
  )
}
