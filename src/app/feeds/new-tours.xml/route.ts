// RSS feed of newly announced UK tours: /feeds/new-tours.xml
import { loadTourAnnouncements } from '@/lib/tourHubData'
import { citiesPhrase } from '@/lib/tourHub'
import { shortUkDate } from '@/lib/newShows'
import { buildRssFeed, rssResponse } from '@/lib/rss'

export const revalidate = 3600

const BASE = 'https://www.theshowfinder.com'

export async function GET() {
  const tours = await loadTourAnnouncements()
  const xml = buildRssFeed({
    title: 'New UK tour announcements: TheShowFinder',
    link: `${BASE}/new-tours`,
    description: 'UK tours announced or extended in the last two weeks, newest first, with ticket comparison on every show.',
    selfUrl: `${BASE}/feeds/new-tours.xml`,
    items: tours.slice(0, 30).map(t => ({
      title: `${t.artistName} ${t.isBrandNew ? 'announces' : 'adds'} ${t.showCount} UK dates`,
      link: `${BASE}/artists/${t.artistSlug}`,
      guid: `new-tours:${t.artistSlug}:${t.announcedAt.slice(0, 10)}`,
      description: `${t.showCount} UK dates in ${citiesPhrase(t.cities)}, ${shortUkDate(t.firstDate)} to ${shortUkDate(t.lastDate)}${t.biggestVenue ? `, including ${t.biggestVenue}` : ''}.`,
      pubDate: new Date(t.announcedAt),
    })),
  })
  return rssResponse(xml)
}
