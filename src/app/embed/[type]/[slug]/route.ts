import { createPublicClient } from '@/lib/supabase/public'
import { LIVE_EVENT_STATUSES, fetchTopEvents } from '@/lib/eventPools'
import { toArtistEventRows, type ArtistEventLink } from '@/lib/artistEvents'
import { CITIES } from '@/lib/cities'
import { renderEmbedHtml, parseEmbedTheme, type EmbedRow } from '@/lib/embedWidget'

export const revalidate = 10800

const BASE = 'https://www.theshowfinder.com'
const utm = (path: string) => `${BASE}${path}?utm_source=embed&utm_medium=widget`

function html(body: string, status = 200) {
  return new Response(body, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=3600',
      'X-Robots-Tag': 'noindex',
    },
  })
}

// Embeddable "upcoming shows" widget for artist, venue and city pages:
//   <iframe src="https://www.theshowfinder.com/embed/artist/<slug>" …>
export async function GET(request: Request, { params }: { params: Promise<{ type: string; slug: string }> }) {
  const { type, slug: rawSlug } = await params
  const slug = decodeURIComponent(rawSlug)
  const theme = parseEmbedTheme(new URL(request.url).searchParams.get('theme'))
  const supabase = createPublicClient()
  const nowISO = new Date().toISOString()

  if (type === 'artist') {
    const { data: artist } = await supabase.from('artists').select('id, name, slug').eq('slug', slug).maybeSingle() as unknown as { data: { id: string; name: string; slug: string } | null }
    if (!artist) return html(renderEmbedHtml({ heading: 'Upcoming shows', rows: [], moreUrl: BASE, moreLabel: 'TheShowFinder', theme }), 404)
    const { data } = await supabase
      .from('event_artists')
      .select('events!inner(id, slug, title, start_date, status, venue:venues(name, city))')
      .eq('artist_id', artist.id)
      .gte('events.start_date', nowISO)
      .in('events.status', LIVE_EVENT_STATUSES)
      .limit(40)
    const rows: EmbedRow[] = toArtistEventRows(data as unknown as ArtistEventLink[]).slice(0, 8).map(e => ({
      title: e.venueName ? `${e.venueName}${e.venueCity ? `, ${e.venueCity}` : ''}` : e.title,
      startDate: e.startDate,
      where: null,
      url: utm(`/events/${e.slug}`),
    }))
    return html(renderEmbedHtml({ heading: `${artist.name}: upcoming UK shows`, rows, moreUrl: utm(`/artists/${artist.slug}`), moreLabel: 'Find tickets', theme }))
  }

  if (type === 'venue') {
    const { data: venue } = await supabase.from('venues').select('id, name, city, slug').eq('slug', slug).maybeSingle() as unknown as { data: { id: string; name: string; city: string; slug: string } | null }
    if (!venue) return html(renderEmbedHtml({ heading: 'Upcoming shows', rows: [], moreUrl: BASE, moreLabel: 'TheShowFinder', theme }), 404)
    const { data } = await supabase
      .from('events')
      .select('slug, title, start_date')
      .eq('venue_id', venue.id)
      .gte('start_date', nowISO)
      .in('status', LIVE_EVENT_STATUSES)
      .order('start_date', { ascending: true })
      .limit(8) as unknown as { data: { slug: string; title: string; start_date: string }[] | null }
    const rows: EmbedRow[] = (data ?? []).map(e => ({ title: e.title, startDate: e.start_date, where: null, url: utm(`/events/${e.slug}`) }))
    return html(renderEmbedHtml({ heading: `What's on at ${venue.name}`, rows, moreUrl: utm(`/venues/${venue.slug}`), moreLabel: 'All shows', theme }))
  }

  if (type === 'city') {
    const city = CITIES.find(c => c.name.toLowerCase() === slug.toLowerCase())
    if (!city) return html(renderEmbedHtml({ heading: 'Upcoming shows', rows: [], moreUrl: BASE, moreLabel: 'TheShowFinder', theme }), 404)
    const events = await fetchTopEvents(supabase, { city: city.name, limit: 8 })
    const rows: EmbedRow[] = events.map(e => ({
      title: e.title,
      startDate: e.start_date,
      where: e.venue_name ?? null,
      url: utm(`/events/${e.slug}`),
    }))
    return html(renderEmbedHtml({ heading: `Big shows coming up in ${city.name}`, rows, moreUrl: utm(`/cities/${encodeURIComponent(city.name)}`), moreLabel: `Everything on in ${city.name}`, theme }))
  }

  return html(renderEmbedHtml({ heading: 'Upcoming shows', rows: [], moreUrl: BASE, moreLabel: 'TheShowFinder', theme }), 404)
}
