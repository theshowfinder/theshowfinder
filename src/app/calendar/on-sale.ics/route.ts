// Subscribable "tickets on sale" calendar: /calendar/on-sale.ics
// Every general sale and presale in the next 45 days, with a reminder 15 minutes before.
import { createPublicClient } from '@/lib/supabase/public'
import { LIVE_EVENT_STATUSES } from '@/lib/eventPools'
import { onSaleFeedEvents, type FeedRow } from '@/lib/calendarFeeds'
import { icsResponse } from '@/lib/calendarResponse'

export const revalidate = 3600

const COLS = 'slug, title, start_date, venue_name, venue_city, public_onsale_start, presale_start, presale_name'

export async function GET() {
  const supabase = createPublicClient()
  const now = new Date()
  const horizon = new Date(now.getTime() + 45 * 86_400_000).toISOString()
  const nowISO = now.toISOString()

  const [general, presale] = await Promise.all([
    supabase.from('listed_events_with_venue').select(COLS).gt('public_onsale_start', nowISO).lte('public_onsale_start', horizon)
      .gte('start_date', nowISO).in('status', LIVE_EVENT_STATUSES).limit(1000) as unknown as Promise<{ data: FeedRow[] | null }>,
    supabase.from('listed_events_with_venue').select(COLS).gt('presale_start', nowISO).lte('presale_start', horizon)
      .gte('start_date', nowISO).in('status', LIVE_EVENT_STATUSES).limit(1000) as unknown as Promise<{ data: FeedRow[] | null }>,
  ])
  const byId = new Map<string, FeedRow>()
  for (const r of [...(general.data ?? []), ...(presale.data ?? [])]) byId.set(r.slug, r)
  const events = onSaleFeedEvents([...byId.values()], now.getTime())
  return icsResponse(
    'UK tickets on sale: TheShowFinder',
    'When tickets go on sale and presales open across the UK, with a reminder 15 minutes before. From theshowfinder.com',
    events,
    'uk-on-sale.ics',
  )
}
