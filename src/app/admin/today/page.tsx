export const dynamic = 'force-dynamic'
export const maxDuration = 60

import Link from 'next/link'
import { requireAdmin } from '@/lib/admin-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { fetchAllPages, fetchAllPagesParallel } from '@/lib/pagedFetch'
import { LIVE_EVENT_STATUSES } from '@/lib/listedEvents'
import { ukToday } from '@/lib/ukTime'

// Today: the morning check. Did every step of the overnight run work, how many shows carry 3 / 2 / 1 seller links,
// and how many decisions are waiting. The steps run in this order (vercel.json): fetch -> match -> merge -> create ->
// merge -> refresh -> news and emails -> health report.
type Loose = any // eslint-disable-line @typescript-eslint/no-explicit-any
type Page<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>

const STEPS: Array<{ step: string; jobs: Array<[string, string]> }> = [
  { step: 'Fetch', jobs: [['sync-ticketmaster-sweep', 'Ticketmaster'], ['sync-gigsberg-sweep', 'Gigsberg'], ['sync-see-tickets', 'See Tickets'], ['sync-council-events', 'Local listings'], ['sync-onsale', 'On-sale dates']] },
  { step: 'Match', jobs: [['match-gigsberg', 'Gigsberg'], ['match-see-tickets', 'See Tickets']] },
  { step: 'Merge duplicates', jobs: [['merge-duplicates', 'Merge']] },
  { step: 'Create new shows', jobs: [['import-feed-events', 'From Gigsberg / See Tickets']] },
  { step: 'Refresh', jobs: [['refresh-listings', 'Listings and sitemap'], ['indexnow', 'Search engines']] },
  { step: 'News and emails', jobs: [['detect-new-shows', 'New shows and news'], ['event-reminders', 'Reminders'], ['follow-alerts', 'Follow alerts']] },
]

const clock = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit' })
const n = (v: number) => v.toLocaleString('en-GB')

/** The last 26 hours (one overnight run plus a margin), worked out outside render. */
function timeWindow() {
  const now = Date.now()
  return { since: new Date(now - 26 * 3_600_000).toISOString(), nowIso: new Date(now).toISOString(), today: ukToday() }
}

export default async function TodayPage() {
  await requireAdmin()
  const db = createAdminClient() as Loose
  const { since, nowIso, today } = timeWindow()

  const [runsRes, liveCount, hidden, reviewCount, stReview, gbCheck, newByDay] = await Promise.all([
    db.from('job_runs').select('job, started_at, finished_at, status, error, summary').gte('started_at', since).order('started_at', { ascending: false }).limit(500),
    db.from('events').select('id', { count: 'exact', head: true }).gte('start_date', nowIso).in('status', LIVE_EVENT_STATUSES).then((r: Loose) => r.count ?? 0),
    fetchAllPages<{ id: string }>((from, to) => db.from('event_canonical_map').select('id').eq('is_canonical', false).order('id').range(from, to) as Page<{ id: string }>),
    db.from('event_merge_reviews').select('id', { count: 'exact', head: true }).eq('status', 'open').then((r: Loose) => r.count ?? 0),
    db.from('see_tickets_catalogue_events').select('id', { count: 'exact', head: true }).is('gone_at', null).gte('event_date', today).is('matched_event_id', null).eq('match_status', 'review').then((r: Loose) => r.count ?? 0),
    db.from('gigsberg_catalogue_events').select('id', { count: 'exact', head: true }).is('gone_at', null).gte('event_date', today).is('matched_event_id', null).or('match_status.eq.review,and(match_status.eq.no_match,inventory_status.eq.available)').then((r: Loose) => r.count ?? 0),
    db.from('events').select('source').gte('created_at', since).in('status', LIVE_EVENT_STATUSES).is('merged_into', null).limit(5000),
  ])
  type Ev = { id: string; tickets_url: string | null; see_tickets_affiliate_url: string | null; gigsberg_affiliate_url: string | null; source: string | null }
  const events = await fetchAllPagesParallel<Ev>(liveCount, (from, to) => db.from('events').select('id, tickets_url, see_tickets_affiliate_url, gigsberg_affiliate_url, source').gte('start_date', nowIso).in('status', LIVE_EVENT_STATUSES).order('id').range(from, to) as Page<Ev>)
  const hiddenIds = new Set(hidden.map(h => h.id))
  const listed = events.filter(e => !hiddenIds.has(e.id))
  const isLocal = (e: Ev) => !!e.source && /_council$/.test(e.source)
  const links = (e: Ev) => Number(!!e.tickets_url) + Number(!!e.see_tickets_affiliate_url) + Number(!!e.gigsberg_affiliate_url)
  const sellerShows = listed.filter(e => links(e) > 0)
  const coverage = [3, 2, 1].map(k => ({ k, count: sellerShows.filter(e => links(e) === k).length }))
  const localOnly = listed.filter(e => isLocal(e) && links(e) === 0).length

  type Run = { job: string; started_at: string; finished_at: string | null; status: string; error: string | null }
  const runs = (runsRes.data ?? []) as Run[]
  const latest = (job: string) => runs.find(r => r.job === job) ?? null
  const failures = runs.filter(r => r.status === 'error')
  const newBySource = new Map<string, number>()
  for (const r of (newByDay.data ?? []) as Array<{ source: string | null }>) {
    const k = !r.source ? 'Ticketmaster' : r.source === 'gigsberg' ? 'Gigsberg' : r.source === 'see_tickets' ? 'See Tickets' : /_council$/.test(r.source) ? 'Local listings' : r.source
    newBySource.set(k, (newBySource.get(k) ?? 0) + 1)
  }
  const waiting = reviewCount + stReview + gbCheck
  const card = 'bg-white border border-slate-200 rounded-2xl p-5'

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
        <h1 className="text-xl font-extrabold text-slate-900">Today</h1>
        <div className="flex gap-4 text-sm font-semibold"><Link href="/admin/decisions" className="text-slate-700">Decisions</Link><Link href="/admin/health" className="text-slate-700">Sources</Link><Link href="/admin" className="text-slate-500">Admin</Link></div>
      </header>
      <main className="max-w-5xl mx-auto px-4 py-6 space-y-5">
        <section className={card}>
          <h2 className="font-extrabold text-slate-900 mb-1">{failures.length === 0 ? 'Every step ran in the last 26 hours' : `${failures.length} run${failures.length === 1 ? '' : 's'} failed in the last 26 hours`}</h2>
          <p className="text-sm text-slate-500 mb-3">Times are UK time. Each step waits for the one before it.</p>
          <div className="divide-y divide-slate-100">
            {STEPS.map(s => (
              <div key={s.step} className="py-2 grid sm:grid-cols-[180px_1fr] gap-2">
                <p className="text-sm font-bold text-slate-800">{s.step}</p>
                <div className="flex flex-wrap gap-2">
                  {s.jobs.map(([job, label]) => {
                    const r = latest(job)
                    const tone = !r ? 'bg-slate-100 text-slate-500' : r.status === 'ok' ? 'bg-emerald-50 text-emerald-800' : r.status === 'running' ? 'bg-amber-50 text-amber-800' : 'bg-red-50 text-red-800'
                    return <span key={job} title={r?.error ?? ''} className={`text-xs font-semibold rounded-full px-3 py-1 ${tone}`}>{label}: {!r ? 'not run' : r.status === 'ok' ? `ok ${clock(r.started_at)}` : r.status === 'running' ? 'running' : `failed ${clock(r.started_at)}`}</span>
                  })}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="grid sm:grid-cols-4 gap-3">
          {coverage.map(c => (
            <div key={c.k} className={card}><p className="text-3xl font-extrabold text-slate-900">{n(c.count)}</p><p className="text-sm font-semibold text-slate-700">{c.k === 1 ? 'shows with 1 seller link' : `shows with ${c.k} seller links`}</p></div>
          ))}
          <div className={card}><p className="text-3xl font-extrabold text-slate-900">{n(localOnly)}</p><p className="text-sm font-semibold text-slate-700">local listings, no seller</p></div>
        </section>

        <section className="grid sm:grid-cols-2 gap-3">
          <Link href="/admin/decisions" className={`${card} hover:border-slate-400`}>
            <p className="text-3xl font-extrabold text-slate-900">{n(waiting)}</p>
            <p className="text-sm font-semibold text-slate-700">decisions waiting for you</p>
            <p className="text-xs text-slate-500">{n(reviewCount)} possible duplicates · {n(stReview)} See Tickets · {n(gbCheck)} Gigsberg</p>
          </Link>
          <div className={card}>
            <p className="text-3xl font-extrabold text-slate-900">{n(listed.length)}</p>
            <p className="text-sm font-semibold text-slate-700">shows listed</p>
            <p className="text-xs text-slate-500">New in the last 26 hours: {[...newBySource].map(([k, v]) => `${n(v)} ${k}`).join(' · ') || 'none'}</p>
          </div>
        </section>
      </main>
    </div>
  )
}
