import { NextResponse } from 'next/server'
import { createPublicClient } from '@/lib/supabase/public'
import { buildIndexNowPayload } from '@/lib/indexNow'
import { LIVE_EVENT_STATUSES } from '@/lib/eventPools'
import { dropDuplicateEvents } from '@/lib/listedEvents'
import { withJobRun } from '@/lib/jobRuns'

export const maxDuration = 60
export const dynamic = 'force-dynamic'

const BASE = 'https://www.theshowfinder.com'

// Hourly: tell IndexNow engines (Bing, Yandex, …) about pages published since the last run, in small batches
// as they appear (Bing, Nov 2026: "avoid batch mode", and news stories / new venues / artists were never sent).
// Covers new events, news stories, venues and artists from the last ~75 minutes; the daily hub pages go once a day.
async function handleGet(request: Request) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const since = new Date(Date.now() - 75 * 60_000).toISOString()
  const supabase = createPublicClient()
  const { data, error } = await supabase
    .from('events')
    .select('id, slug')
    .gte('created_at', since)
    .in('status', LIVE_EVENT_STATUSES)
    .order('created_at', { ascending: false })
    .limit(5000) as unknown as { data: { id: string; slug: string }[] | null; error: { message: string } | null }
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const loose = supabase as unknown as { from: (t: string) => any } // eslint-disable-line @typescript-eslint/no-explicit-any
  const [news, venues, artists] = await Promise.all([
    loose.from('news_stories').select('slug').eq('status', 'published').gte('published_at', since).limit(500),
    loose.from('venues').select('slug').gte('created_at', since).not('slug', 'is', null).limit(1000),
    loose.from('artists').select('slug').gte('created_at', since).not('slug', 'is', null).limit(1000),
  ]) as Array<{ data: { slug: string }[] | null }>

  // Hub pages once a day (the 06:xx run, after the overnight sync).
  const londonHour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', hourCycle: 'h23' }).format(new Date()))
  const hubs = londonHour === 6 ? [`${BASE}/`, `${BASE}/events`, `${BASE}/west-end`, `${BASE}/on-sale-this-week`, `${BASE}/news`] : []
  // Package / duplicate records canonical to the main event: don't submit them.
  const rows = await dropDuplicateEvents(supabase, (data ?? []) as { id: string; slug: string }[])
  const urls = [
    ...hubs,
    ...(news.data ?? []).map(n => `${BASE}/news/${n.slug}`),
    ...rows.map(e => `${BASE}/events/${e.slug}`),
    ...(venues.data ?? []).map(v => `${BASE}/venues/${v.slug}`),
    ...(artists.data ?? []).map(a => `${BASE}/artists/${a.slug}`),
  ]
  if (!urls.length) return NextResponse.json({ submitted: 0 })
  const payload = buildIndexNowPayload(urls)

  const res = await fetch('https://api.indexnow.org/IndexNow', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(payload),
  })
  return NextResponse.json({ submitted: payload.urlList.length, status: res.status })
}

export const GET = withJobRun('indexnow', handleGet)
