import { NextResponse } from 'next/server'
import { createPublicClient } from '@/lib/supabase/public'
import { buildIndexNowPayload } from '@/lib/indexNow'
import { LIVE_EVENT_STATUSES } from '@/lib/eventPools'
import { dropDuplicateEvents } from '@/lib/listedEvents'

export const maxDuration = 60
export const dynamic = 'force-dynamic'

const BASE = 'https://www.theshowfinder.com'

// Daily (after the Ticketmaster sync): tell IndexNow engines (Bing, Yandex, …)
// about events added in the last ~30 hours plus the hub pages that change daily.
export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const since = new Date(Date.now() - 30 * 3600_000).toISOString()
  const supabase = createPublicClient()
  const { data, error } = await supabase
    .from('events')
    .select('id, slug')
    .gte('created_at', since)
    .in('status', LIVE_EVENT_STATUSES)
    .order('created_at', { ascending: false })
    .limit(5000) as unknown as { data: { id: string; slug: string }[] | null; error: { message: string } | null }
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const hubs = [`${BASE}/`, `${BASE}/events`, `${BASE}/west-end`, `${BASE}/on-sale-this-week`, `${BASE}/news`]
  // Package / duplicate records canonical to the main event: don't submit them.
  const rows = await dropDuplicateEvents(supabase, (data ?? []) as { id: string; slug: string }[])
  const urls = [...hubs, ...rows.map(e => `${BASE}/events/${e.slug}`)]
  const payload = buildIndexNowPayload(urls)

  const res = await fetch('https://api.indexnow.org/IndexNow', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(payload),
  })
  return NextResponse.json({ submitted: payload.urlList.length, status: res.status })
}
