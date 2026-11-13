import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { withJobRun } from '@/lib/jobRuns'
import { CITIES } from '@/lib/cities'
import { fetchAllPages } from '@/lib/pagedFetch'
import { LISTED_EVENTS_VIEW, LIVE_EVENT_STATUSES } from '@/lib/listedEvents'
import { displayTitle } from '@/lib/displayTitle'
import { isPackageOrClassTitle } from '@/lib/eventTitles'
import { actName, onePerAct, isoWeek, buildOnSaleRoundupDraft, buildWeekendDraft, buildPresaleAlertDraft, weekendCities, type ListItem } from '@/lib/socialAuto'

export const maxDuration = 60
export const dynamic = 'force-dynamic'

// Automatic Social Packs, daily 06:40 UTC (src/lib/socialAuto.ts says what and when). Drafts only: Chris checks them in
// /admin/social and schedules them in Meta Business Suite. ?dry=1 lists what would be made; ?day=mon|thu forces a day.
type Loose = any // eslint-disable-line @typescript-eslint/no-explicit-any
type Row = { id: string; title: string; slug: string; start_date: string; venue_name: string | null; venue_city: string | null; venue_capacity: number | null; image_url: string | null; presale_start: string | null; public_onsale_start: string | null; onsale_date: string | null; category: string | null }
const COLS = 'id, title, slug, start_date, venue_name, venue_city, venue_capacity, image_url, presale_start, public_onsale_start, onsale_date, category'
const NOT_A_SHOW = /\b(standard entry|entry ticket|admission|exhibition|museum|tour of|guided|parking|car park)\b/i

const uk = (iso: string, o: Intl.DateTimeFormatOptions) => new Date(iso).toLocaleString('en-GB', { timeZone: 'Europe/London', ...o })
function when(iso: string): string {
  const day = uk(iso, { weekday: 'short' })
  const h = Number(uk(iso, { hour: 'numeric', hour12: false })), m = uk(iso, { minute: '2-digit' }).padStart(2, '0')
  const t = h === 0 && m === '00' ? '' : ` ${h % 12 || 12}${m === '00' ? '' : `:${m}`}${h < 12 ? 'am' : 'pm'}`
  return `${day}${t}`
}
const dayDate = (iso: string) => uk(iso, { weekday: 'short', day: 'numeric', month: 'short' })
const big = (r: Row) => !NOT_A_SHOW.test(r.title) && !isPackageOrClassTitle(r.title) && r.category !== 'local'
const bySize = (a: Row, b: Row) => (b.venue_capacity ?? 0) - (a.venue_capacity ?? 0)

async function handleGet(request: Request) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || request.headers.get('authorization') !== `Bearer ${cronSecret}`) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const params = new URL(request.url).searchParams
  const dry = params.get('dry') === '1'
  const db = createAdminClient() as Loose
  const now = new Date()
  const weekday = params.get('day') ?? uk(now.toISOString(), { weekday: 'short' }).toLowerCase()
  const week = isoWeek(new Date(uk(now.toISOString(), { year: 'numeric', month: '2-digit', day: '2-digit' }).split('/').reverse().join('-') + 'T12:00:00Z'))
  const made: string[] = [], skipped: string[] = []
  const save = async (draft: Loose, label: string) => {
    if (dry) { made.push(label); return }
    const { data, error } = await db.from('social_packs').upsert(draft, { onConflict: 'source_type,source_id,city_name', ignoreDuplicates: true }).select('id')
    if (error) skipped.push(`${label}: ${error.message}`)
    else if (data?.length) made.push(label)
    else skipped.push(`${label}: already made`)
  }
  const rows = (q: Loose) => fetchAllPages<Row>((from, to) => q.order('id').range(from, to))

  // Monday: the week's biggest on-sales.
  if (weekday.startsWith('mon')) {
    const to = new Date(now.getTime() + 7 * 86_400_000).toISOString()
    const list = (await rows(db.from(LISTED_EVENTS_VIEW).select(COLS).in('status', LIVE_EVENT_STATUSES).gte('public_onsale_start', now.toISOString()).lte('public_onsale_start', to)))
      .filter(big).sort(bySize)
    const picks = onePerAct(list, 6).sort((a, b) => a.public_onsale_start!.localeCompare(b.public_onsale_start!))
    if (picks.length >= 3) {
      const items: ListItem[] = picks.map(r => ({ title: actName(displayTitle(r.title)), line: `${when(r.public_onsale_start!)}${r.venue_city ? ` · ${r.venue_city}` : ''}` }))
      await save(buildOnSaleRoundupDraft({ weekKey: week, items }), `On sale this week (${picks.length})`)
    } else skipped.push(`On sale this week: only ${picks.length} big on-sales`)
  }

  // Daily: presales opening in the next 12–60 hours at big venues, one per act, at most two a day.
  {
    const from = new Date(now.getTime() + 12 * 3_600_000).toISOString(), to = new Date(now.getTime() + 60 * 3_600_000).toISOString()
    const list = (await rows(db.from(LISTED_EVENTS_VIEW).select(COLS).in('status', LIVE_EVENT_STATUSES).gte('presale_start', from).lte('presale_start', to).gte('venue_capacity', 2500)))
      .filter(big).sort(bySize)
    const { data: recent } = await db.from('social_packs').select('headline').gte('created_at', new Date(now.getTime() - 10 * 86_400_000).toISOString()).like('headline', '% presale opens %')
    const done = new Set(((recent ?? []) as Array<{ headline: string }>).map(r => r.headline.split(' presale opens ')[0].toLowerCase()))
    let n = 0
    for (const r of onePerAct(list, 10)) {
      if (n >= 2) break
      const act = actName(displayTitle(r.title))
      if (done.has(act.toLowerCase())) continue
      const tour = list.filter(x => actName(displayTitle(x.title)).toLowerCase() === act.toLowerCase())
      const { data: artists } = await db.from('event_artists').select('artist:artists(slug)').eq('event_id', r.id).limit(1)
      const artistSlug = (artists as Loose)?.[0]?.artist?.slug
      const cities = [...new Set(tour.map(x => x.venue_city).filter(Boolean))] as string[]
      await save(buildPresaleAlertDraft({
        eventId: r.id, act, presaleLabel: when(r.presale_start!), generalLabel: r.public_onsale_start ? `${dayDate(r.public_onsale_start)}` : null,
        dates: tour.length, cities, imageUrl: r.image_url, destinationPath: artistSlug ? `/artists/${artistSlug}` : `/events/${r.slug}`,
        city: cities.length === 1 ? cities[0] : null,
      }), `Presale alert: ${act}`)
      n++
    }
  }

  // Thursday: this weekend in two of the ten biggest cities (rotating).
  if (weekday.startsWith('thu')) {
    const fri = new Date(now); fri.setUTCDate(fri.getUTCDate() + ((5 - fri.getUTCDay() + 7) % 7)); fri.setUTCHours(12, 0, 0, 0)
    const end = new Date(fri.getTime() + 3 * 86_400_000); end.setUTCHours(4, 0, 0, 0)
    for (const city of weekendCities(CITIES.map(c => c.name), week)) {
      const list = (await rows(db.from(LISTED_EVENTS_VIEW).select(COLS).in('status', LIVE_EVENT_STATUSES).ilike('venue_city', city).gte('start_date', fri.toISOString()).lt('start_date', end.toISOString())))
        .filter(big).sort(bySize)
      const picks = onePerAct(list, 6).sort((a, b) => a.start_date.localeCompare(b.start_date))
      if (picks.length < 3) { skipped.push(`This weekend in ${city}: only ${picks.length} shows`); continue }
      const items: ListItem[] = picks.map(r => ({ title: actName(displayTitle(r.title)), line: `${when(r.start_date)}${r.venue_name ? ` · ${r.venue_name}` : ''}` }))
      await save(buildWeekendDraft({ weekKey: week, city, items }), `This weekend in ${city} (${picks.length})`)
    }
  }

  return NextResponse.json({ success: true, dry, weekday, week, made, skipped })
}

export const GET = withJobRun('social-auto', handleGet)
