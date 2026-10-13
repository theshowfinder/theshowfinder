// "Add to calendar" for an event: /events/<slug>/calendar.ics
import { createPublicClient } from '@/lib/supabase/public'
import { buildIcs } from '@/lib/ics'

export const revalidate = 600

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const supabase = createPublicClient()
  const { data } = await supabase
    .from('events')
    .select('id, slug, title, start_date, status, venue:venues(name, address, city, postcode)')
    .eq('slug', slug)
    .maybeSingle()

  const event = data as unknown as {
    slug: string
    title: string
    start_date: string
    status: string
    venue: { name: string; address: string | null; city: string | null; postcode: string | null } | null
  } | null

  if (!event || event.status === 'cancelled' || event.status === 'postponed') {
    return new Response('Not found', { status: 404 })
  }

  const v = event.venue
  const location = v ? [v.name, v.address, v.city, v.postcode].filter(Boolean).join(', ') : null
  const ics = buildIcs({
    uid: event.slug,
    title: event.title,
    startISO: event.start_date,
    location,
    description: 'Compare tickets on TheShowFinder',
    url: `https://www.theshowfinder.com/events/${event.slug}`,
  })

  return new Response(ics, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="${event.slug.slice(0, 80)}.ics"`,
      'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=3600',
      'X-Robots-Tag': 'noindex',
    },
  })
}
