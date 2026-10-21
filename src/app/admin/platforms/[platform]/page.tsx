export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireAdmin } from '@/lib/admin-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { LIVE_EVENT_STATUSES } from '@/lib/listedEvents'

const PAGE = 50
type Loose = any // eslint-disable-line @typescript-eslint/no-explicit-any

const PLATFORMS: Record<string, { label: string; views: Record<string, string>; reviewHref?: string }> = {
  ticketmaster: { label: 'Ticketmaster', views: { all: 'All events', no_link: 'Missing a buy button', stale: 'Not refreshed in 48h', with_gigsberg: 'Also on Gigsberg', with_see_tickets: 'Also on See Tickets' } },
  gigsberg: { label: 'Gigsberg', reviewHref: '/admin/gigsberg/matches', views: { all: 'All Gigsberg shows', linked: 'Linked to a site event', review: 'Need review', unlinked: 'Not on our site yet', on_site: 'Site events with a Gigsberg button', created: 'Events created from Gigsberg', gone: 'No longer on Gigsberg' } },
  see_tickets: { label: 'See Tickets', reviewHref: '/admin/see-tickets', views: { all: 'All See Tickets shows', linked: 'Linked to a site event', review: 'Need review', unlinked: 'Not on our site yet', on_site: 'Site events with a See Tickets button', created: 'Events created from See Tickets', gone: 'No longer in the feed' } },
  council: { label: 'Council events (Derby)', views: { all: 'All council events' } },
}
const CATALOGUE: Record<string, { table: string; cols: string; nameCol: string }> = {
  gigsberg: { table: 'gigsberg_catalogue_events', cols: 'id, name, event_date, venue, city, url, matched_event_id, match_status, match_reason, last_seen_at, gone_at', nameCol: 'name' },
  see_tickets: { table: 'see_tickets_catalogue_events', cols: 'id, name, event_date, venue, city, url, matched_event_id, match_status, match_reason, last_seen_at, gone_at', nameCol: 'name' },
}

function fmt(d: string | null) {
  if (!d) return ''
  return new Date(d).toLocaleDateString('en-GB', { timeZone: 'Europe/London', weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
}
function ago(iso: string | null) {
  if (!iso) return 'never'
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60_000)
  return m < 60 ? `${m}m ago` : m < 48 * 60 ? `${Math.round(m / 60)}h ago` : `${Math.round(m / 1440)}d ago`
}

export default async function PlatformPage({ params, searchParams }: { params: Promise<{ platform: string }>; searchParams: Promise<{ view?: string; page?: string; q?: string }> }) {
  await requireAdmin()
  const { platform } = await params
  const sp = await searchParams
  const meta = PLATFORMS[platform]
  if (!meta) notFound()
  const view = sp.view && meta.views[sp.view] ? sp.view : 'all'
  const page = Math.max(1, Number(sp.page) || 1)
  const q = (sp.q ?? '').trim().replace(/[%_,()\\]/g, ' ')
  const db = createAdminClient() as Loose
  const nowIso = new Date().toISOString()
  const today = nowIso.slice(0, 10)
  const from = (page - 1) * PAGE
  const isCatalogue = platform in CATALOGUE && ['all', 'linked', 'review', 'unlinked', 'gone'].includes(view)

  let total = 0
  let catalogueRows: Array<Record<string, any>> = [] // eslint-disable-line @typescript-eslint/no-explicit-any
  let eventRows: Array<Record<string, any>> = [] // eslint-disable-line @typescript-eslint/no-explicit-any
  let eventSlugs = new Map<string, { slug: string; title: string }>()

  if (isCatalogue) {
    const c = CATALOGUE[platform]
    let query = db.from(c.table).select(c.cols, { count: 'exact' }).gte('event_date', today)
    if (view === 'gone') query = query.not('gone_at', 'is', null)
    else query = query.is('gone_at', null)
    if (view === 'linked') query = query.not('matched_event_id', 'is', null)
    if (view === 'review') query = query.is('matched_event_id', null).eq('match_status', 'review')
    if (view === 'unlinked') query = query.is('matched_event_id', null).neq('match_status', 'review')
    if (q) query = query.ilike('name', `%${q}%`)
    const { data, count } = await query.order('event_date', { ascending: true }).range(from, from + PAGE - 1)
    catalogueRows = data ?? []
    total = count ?? 0
    const ids = [...new Set(catalogueRows.map(r => r.matched_event_id).filter(Boolean))]
    if (ids.length) {
      const { data: evs } = await db.from('events').select('id, slug, title').in('id', ids)
      eventSlugs = new Map((evs ?? []).map((e: { id: string; slug: string; title: string }) => [e.id, { slug: e.slug, title: e.title }]))
    }
  } else {
    let query = db.from('events').select('id, title, slug, start_date, status, tickets_url, last_synced_at, ticketmaster_id, gigsberg_affiliate_url, see_tickets_affiliate_url, source, venue:venues(name, city)', { count: 'exact' }).gte('start_date', nowIso).in('status', LIVE_EVENT_STATUSES)
    if (platform === 'ticketmaster') query = query.not('ticketmaster_id', 'is', null)
    if (platform === 'council') query = query.like('source', '%_council')
    if (view === 'no_link') query = query.is('tickets_url', null)
    if (view === 'stale') query = query.lt('last_synced_at', new Date(new Date(nowIso).getTime() - 48 * 3_600_000).toISOString())
    if (view === 'with_gigsberg' || (platform === 'gigsberg' && view === 'on_site')) query = query.not('gigsberg_affiliate_url', 'is', null)
    if (view === 'with_see_tickets' || (platform === 'see_tickets' && view === 'on_site')) query = query.not('see_tickets_affiliate_url', 'is', null)
    if (view === 'created') query = query.eq('source', platform)
    if (q) query = query.ilike('title', `%${q}%`)
    const { data, count } = await query.order('start_date', { ascending: true }).range(from, from + PAGE - 1)
    eventRows = data ?? []
    total = count ?? 0
  }

  const pages = Math.max(1, Math.ceil(total / PAGE))
  const href = (over: Record<string, string | number>) => {
    const p = new URLSearchParams({ view, ...(q ? { q } : {}), ...Object.fromEntries(Object.entries(over).map(([k, v]) => [k, String(v)])) })
    return `/admin/platforms/${platform}?${p.toString()}`
  }
  const chip = (on: boolean, label: string) => <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded ${on ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-400'}`}>{label}</span>

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
        <h1 className="text-xl font-extrabold text-slate-900">{meta.label}: {meta.views[view]}</h1>
        <Link href="/admin/health" className="text-sm text-slate-500 hover:text-slate-700">← Site health</Link>
      </header>
      <main className="max-w-6xl mx-auto px-4 py-6">
        <div className="flex flex-wrap gap-2 mb-4">
          {Object.entries(meta.views).map(([k, label]) => (
            <Link key={k} href={`/admin/platforms/${platform}?view=${k}`} className={`text-sm font-semibold px-3 py-1.5 rounded-full border ${k === view ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-700 border-slate-300'}`}>{label}</Link>
          ))}
          {meta.reviewHref && <Link href={meta.reviewHref} className="text-sm font-semibold px-3 py-1.5 rounded-full border border-amber-400 text-amber-800 bg-amber-50">Open the review queue →</Link>}
        </div>
        <form className="flex gap-2 mb-4" action={`/admin/platforms/${platform}`}>
          <input type="hidden" name="view" value={view} />
          <input name="q" defaultValue={q} placeholder="Search by name" className="border border-slate-300 rounded-lg px-3 py-2 text-sm w-64" />
          <button className="text-sm font-bold bg-slate-800 text-white rounded-lg px-4 py-2">Search</button>
        </form>
        <p className="text-sm text-slate-600 mb-3"><b>{total.toLocaleString('en-GB')}</b> {q ? 'matching ' : ''}result{total === 1 ? '' : 's'} · page {page} of {pages}</p>

        <div className="bg-white border border-slate-200 rounded-2xl overflow-x-auto">
          {isCatalogue ? (
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wider text-slate-500 border-b border-slate-100"><tr><th className="p-3">Show</th><th className="p-3">Date</th><th className="p-3">Venue</th><th className="p-3">Status</th><th className="p-3">Our event page</th><th className="p-3">On {meta.label}</th></tr></thead>
              <tbody>
                {catalogueRows.map(r => {
                  const ev = r.matched_event_id ? eventSlugs.get(r.matched_event_id) : null
                  return (
                    <tr key={r.id} className="border-b border-slate-50 align-top">
                      <td className="p-3 font-semibold text-slate-900">{r.name}</td>
                      <td className="p-3 whitespace-nowrap text-slate-600">{fmt(r.event_date)}</td>
                      <td className="p-3 text-slate-600">{r.venue}<div className="text-xs text-slate-400">{r.city}</div></td>
                      <td className="p-3"><span className="text-xs font-bold text-slate-700">{r.gone_at ? 'removed' : r.match_status ?? 'pending'}</span>{r.match_reason && <div className="text-xs text-slate-400 max-w-[18rem]">{String(r.match_reason).slice(0, 110)}</div>}</td>
                      <td className="p-3">{ev ? <Link href={`/events/${ev.slug}`} target="_blank" className="text-blue-700 underline">{ev.title.slice(0, 60)}</Link> : <span className="text-slate-400">not linked</span>}</td>
                      <td className="p-3">{r.url ? <a href={r.url} target="_blank" rel="noopener noreferrer" className="text-blue-700 underline">open</a> : ''}<div className="text-xs text-slate-400">seen {ago(r.last_seen_at)}</div></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wider text-slate-500 border-b border-slate-100"><tr><th className="p-3">Event</th><th className="p-3">Date</th><th className="p-3">Venue</th><th className="p-3">Linked platforms</th><th className="p-3">Refreshed</th></tr></thead>
              <tbody>
                {eventRows.map(e => (
                  <tr key={e.id} className="border-b border-slate-50 align-top">
                    <td className="p-3"><Link href={`/events/${e.slug}`} target="_blank" className="font-semibold text-blue-700 underline">{e.title}</Link></td>
                    <td className="p-3 whitespace-nowrap text-slate-600">{fmt(e.start_date)}</td>
                    <td className="p-3 text-slate-600">{e.venue?.name}<div className="text-xs text-slate-400">{e.venue?.city}</div></td>
                    <td className="p-3 space-x-1 whitespace-nowrap">{chip(Boolean(e.ticketmaster_id || e.tickets_url), 'TM')}{chip(Boolean(e.gigsberg_affiliate_url), 'Gigsberg')}{chip(Boolean(e.see_tickets_affiliate_url), 'See Tickets')}</td>
                    <td className="p-3 text-xs text-slate-500">{ago(e.last_synced_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {total === 0 && <p className="p-6 text-sm text-slate-500">Nothing here.</p>}
        </div>

        <div className="flex gap-3 mt-4 text-sm">
          {page > 1 && <Link href={href({ page: page - 1 })} className="font-bold text-blue-700">← Previous</Link>}
          {page < pages && <Link href={href({ page: page + 1 })} className="font-bold text-blue-700">Next →</Link>}
        </div>
      </main>
    </div>
  )
}
