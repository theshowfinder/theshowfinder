// RSS feed of the best shows in a city this week: /feeds/cities/Manchester.xml
import { createPublicClient } from '@/lib/supabase/public'
import { CITIES } from '@/lib/cities'
import { fetchEventsThisWeek } from '@/lib/eventPools'
import { shortUkDate, isNewsworthyArtistName } from '@/lib/newShows'
import { isAttraction } from '@/lib/eventMix'
import { buildRssFeed, rssResponse } from '@/lib/rss'

export const revalidate = 21600

const BASE = 'https://www.theshowfinder.com'

export async function GET(_req: Request, { params }: { params: Promise<{ city: string }> }) {
  const { city: raw } = await params
  const name = decodeURIComponent(raw).replace(/\.xml$/i, '')
  const city = CITIES.find(c => c.name.toLowerCase() === name.toLowerCase())
  if (!city) return new Response('Not found', { status: 404 })

  // Ask for extra, then drop attraction tickets and premium/hospitality listings:
  // a feed that syndicates to other people's sites must only carry real shows.
  const pool = await fetchEventsThisWeek(createPublicClient(), { city: city.name, limit: 20 })
  const events = pool
    .filter(e => !isAttraction(e) && isNewsworthyArtistName(e.title))
    .slice(0, 10)
  // One stable publication time per day so a show is posted once, the first day it appears.
  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)

  const xml = buildRssFeed({
    title: `${city.name} this week: TheShowFinder`,
    link: `${BASE}/cities/${encodeURIComponent(city.name)}/this-week`,
    description: `The best concerts, theatre, comedy and sport in ${city.name} this week, with links to official ticket sellers.`,
    selfUrl: `${BASE}/feeds/cities/${encodeURIComponent(city.name)}.xml`,
    items: events.map(e => ({
      title: `${e.title} at ${e.venue_name ?? city.name}, ${shortUkDate(e.start_date)}`,
      link: `${BASE}/events/${e.slug}`,
      guid: `event:${e.id}`,
      description: `${e.title} at ${e.venue_name ?? city.name} in ${city.name}, ${shortUkDate(e.start_date)}. Find tickets on TheShowFinder.`,
      pubDate: today,
    })),
  })
  return rssResponse(xml)
}
