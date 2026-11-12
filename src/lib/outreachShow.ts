// The real upcoming show used in an advertiser outreach email ("how you'd appear"): the soonest ticketed show with a
// picture at the business's nearest venue, 2–60 days out. Attractions, packages, council listings and merged
// duplicates are skipped, the same as the weekly digest. Fails soft: no show → the email goes without the show card.
import { displayTitle, londonTimeOrNull } from '@/lib/displayTitle'
import { isPackageOrClassTitle } from '@/lib/eventTitles'
import type { OutreachShow, Prospect } from '@/lib/outreach'
import { LISTED_EVENTS_VIEW, LIVE_EVENT_STATUSES } from '@/lib/listedEvents'

type Loose = any // eslint-disable-line @typescript-eslint/no-explicit-any
const ATTRACTION = /\b(standard entry|entry ticket|admission|exhibition|museum|tour of|guided|experience)\b/i

export async function loadOutreachShow(db: Loose, p: Pick<Prospect, 'near_venue' | 'city'>): Promise<OutreachShow | undefined> {
  if (!p.near_venue || p.near_venue.toLowerCase() === p.city.toLowerCase()) return undefined
  try {
    const from = new Date(Date.now() + 2 * 86_400_000).toISOString(), to = new Date(Date.now() + 60 * 86_400_000).toISOString()
    const { data } = await db.from(LISTED_EVENTS_VIEW)
      .select('id, title, slug, start_date, image_url, category, status, venue_name')
      .eq('venue_name', p.near_venue).gte('start_date', from).lte('start_date', to)
      .not('image_url', 'is', null).in('status', LIVE_EVENT_STATUSES).neq('category', 'local')
      .order('start_date').limit(15)
    const rows = ((data ?? []) as Loose[]).filter(e => /^https:\/\//.test(e.image_url) && !ATTRACTION.test(e.title) && !isPackageOrClassTitle(e.title))
    if (!rows.length) return undefined
    const { data: merged } = await db.from('events').select('id').in('id', rows.map(e => e.id)).not('merged_into', 'is', null)
    const gone = new Set(((merged ?? []) as Loose[]).map(m => m.id))
    const e = rows.find(r => !gone.has(r.id))
    if (!e) return undefined
    const day = new Date(e.start_date).toLocaleDateString('en-GB', { timeZone: 'Europe/London', weekday: 'short', day: 'numeric', month: 'short' })
    const time = londonTimeOrNull(e.start_date)
    return {
      title: displayTitle(e.title),
      when: time ? `${day}, ${time}` : day,
      venue: e.venue_name,
      imageUrl: e.image_url,
      url: `https://www.theshowfinder.com/events/${e.slug}`,
    }
  } catch {
    return undefined
  }
}
