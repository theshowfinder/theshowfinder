export const dynamic = 'force-dynamic'
export const maxDuration = 60

import Link from 'next/link'
import { requireAdmin } from '@/lib/admin-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { LIVE_EVENT_STATUSES } from '@/lib/listedEvents'
import { rankCandidates, type Candidate } from '@/lib/unmatchedCandidates'
import type { CatalogueRow, ShowfinderEvent } from '@/lib/gigsbergMatchScoring'
import { createEventAction, hideAction, linkAction, unhideAction } from './actions'

const PAGE = 25
type Loose = any // eslint-disable-line @typescript-eslint/no-explicit-any
type Platform = 'gigsberg' | 'see_tickets'

const PLATFORM: Record<Platform, { label: string; table: string; cols: string; colour: string; urlCol: 'gigsberg_affiliate_url' | 'see_tickets_affiliate_url' }> = {
  gigsberg: { label: 'Gigsberg', table: 'gigsberg_catalogue_events', cols: 'id, name, event_date, venue, city, url, performer1, performer2, match_status, match_reason, inventory_status', colour: '#1a1f6e', urlCol: 'gigsberg_affiliate_url' },
  see_tickets: { label: 'See Tickets', table: 'see_tickets_catalogue_events', cols: 'id, name, event_date, venue, city, url, primary_artist, second_artist, match_status, match_reason', colour: '#E4022D', urlCol: 'see_tickets_affiliate_url' },
}

const day = (d: string) => new Date(d).toLocaleDateString('en-GB', { timeZone: 'Europe/London', weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
const dayShift = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString()

type EvRow = { id: string; title: string; slug: string; start_date: string; status: string; venue_name: string | null; venue_city: string | null; gigsberg_affiliate_url: string | null; see_tickets_affiliate_url: string | null }
const toShowfinder = (e: EvRow): ShowfinderEvent & EvRow => ({ ...e, venue: { name: e.venue_name ?? '', city: e.venue_city ?? '' }, artists: [] })

async function eventsOnDay(db: Loose, date: string): Promise<Array<ShowfinderEvent & EvRow>> {
  const { data } = await db.from('events_with_venue')
    .select('id, title, slug, start_date, status, venue_name, venue_city, gigsberg_affiliate_url, see_tickets_affiliate_url')
    .gte('start_date', new Date(Date.parse(dayShift(date, 0)) - 3_600_000).toISOString()).lt('start_date', dayShift(date, 1))
    .in('status', LIVE_EVENT_STATUSES).limit(1000)
  return ((data ?? []) as EvRow[]).map(toShowfinder)
}

function toCatalogueRow(platform: Platform, r: Record<string, any>): CatalogueRow { // eslint-disable-line @typescript-eslint/no-explicit-any
  return {
    id: r.id, name: r.name, event_date: r.event_date, venue: r.venue, city: r.city,
    performer1: platform === 'gigsberg' ? r.performer1 : r.primary_artist,
    performer2: platform === 'gigsberg' ? r.performer2 : r.second_artist,
    url: r.url, matched_event_id: null,
  }
}

export default async function UnmatchedPage({ searchParams }: { searchParams: Promise<{ platform?: string; view?: string; filter?: string; q?: string; page?: string; msg?: string; ok?: string; status?: string }> }) {
  await requireAdmin()
  const sp = await searchParams
  const platform: Platform = sp.platform === 'see_tickets' ? 'see_tickets' : 'gigsberg'
  const view = sp.view === 'soldout' ? 'soldout' : sp.view === 'hidden' ? 'hidden' : 'unlinked'
  const page = Math.max(1, Number(sp.page) || 1)
  const q = (sp.q ?? '').trim().replace(/[%_,()\\]/g, ' ')
  const meta = PLATFORM[platform]
  const db = createAdminClient() as Loose
  const today = new Date().toISOString().slice(0, 10)
  const nowIso = new Date().toISOString()
  const from = (page - 1) * PAGE

  const unlinkedCount = (table: string) => db.from(table).select('id', { count: 'exact', head: true }).is('gone_at', null).gte('event_date', today).is('matched_event_id', null).or('match_status.is.null,match_status.neq.rejected').then((r: Loose) => r.count ?? 0)
  const [unlinkedGb, unlinkedSt, soldOutCount] = await Promise.all([
    unlinkedCount('gigsberg_catalogue_events'),
    unlinkedCount('see_tickets_catalogue_events'),
    db.from('events').select('id', { count: 'exact', head: true }).gte('start_date', nowIso).eq('status', 'sold_out').is(meta.urlCol, null).then((r: Loose) => r.count ?? 0),
  ])

  type Item = { key: string; catalogue: Record<string, any> | null; event: EvRow | null; candidates: Candidate[]; catalogueCandidates: Array<Record<string, any>> } // eslint-disable-line @typescript-eslint/no-explicit-any
  const items: Item[] = []
  let total = 0

  if (view === 'soldout') {
    const { data, count } = await db.from('events_with_venue')
      .select('id, title, slug, start_date, status, venue_name, venue_city, gigsberg_affiliate_url, see_tickets_affiliate_url', { count: 'exact' })
      .gte('start_date', nowIso).eq('status', 'sold_out').is(meta.urlCol, null)
      .order('start_date', { ascending: true }).range(from, from + PAGE - 1)
    total = count ?? 0
    await Promise.all(((data ?? []) as EvRow[]).map(async ev => {
      const date = new Date(ev.start_date).toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
      const { data: cats } = await db.from(meta.table).select(meta.cols).eq('event_date', date).is('gone_at', null).is('matched_event_id', null).limit(300)
      const asEvent = toShowfinder(ev)
      const ranked = ((cats ?? []) as Array<Record<string, any>>) // eslint-disable-line @typescript-eslint/no-explicit-any
        .map(c => ({ c, r: rankCandidates(toCatalogueRow(platform, c), [asEvent], 1)[0] }))
        .filter(x => x.r).sort((a, b) => b.r.value - a.r.value).slice(0, 4).map(x => x.c)
      items.push({ key: ev.id, catalogue: null, event: ev, candidates: [], catalogueCandidates: ranked })
    }))
    items.sort((a, b) => (a.event!.start_date).localeCompare(b.event!.start_date))
  } else {
    let query = db.from(meta.table).select(meta.cols, { count: 'exact' }).is('gone_at', null).gte('event_date', today).is('matched_event_id', null)
    const status = sp.status === 'hidden' ? 'hidden' : ['waiting', 'no_match', 'review'].includes(sp.status ?? '') ? sp.status : ''
    if (view === 'hidden' || status === 'hidden') query = query.eq('match_status', 'rejected')
    else if (status === 'waiting') query = query.or('match_status.is.null,match_status.eq.pending')
    else if (status) query = query.eq('match_status', status as string)
    else query = query.or('match_status.is.null,match_status.neq.rejected')
    if (q) query = query.ilike('name', `%${q}%`)
    const { data, count } = await query.order('event_date', { ascending: true }).range(from, from + PAGE - 1)
    total = count ?? 0
    const rows = (data ?? []) as Array<Record<string, any>> // eslint-disable-line @typescript-eslint/no-explicit-any
    const dates = [...new Set(rows.map(r => r.event_date as string))]
    const byDate = new Map<string, Array<ShowfinderEvent & EvRow>>()
    await Promise.all(dates.map(async d => { byDate.set(d, await eventsOnDay(db, d)) }))
    for (const r of rows) {
      const candidates = rankCandidates(toCatalogueRow(platform, r), byDate.get(r.event_date) ?? [], 4)
      items.push({ key: String(r.id), catalogue: r, event: null, candidates, catalogueCandidates: [] })
    }
  }
  const isHidden = view === 'hidden' || sp.status === 'hidden'
  const shown = sp.filter === 'candidates' ? items.filter(i => i.candidates.length) : sp.filter === 'none' ? items.filter(i => !i.candidates.length) : items
  const pages = Math.max(1, Math.ceil(total / PAGE))
  const href = (over: Record<string, string | number>) => {
    const p = new URLSearchParams({ platform, view, ...(sp.filter ? { filter: sp.filter } : {}), ...(sp.status ? { status: sp.status } : {}), ...(q ? { q } : {}), ...Object.fromEntries(Object.entries(over).map(([k, v]) => [k, String(v)])) })
    return `/admin/unmatched?${p.toString()}`
  }
  const tab = (on: boolean) => `text-sm font-semibold px-3 py-1.5 rounded-full border ${on ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-700 border-slate-300'}`

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
        <h1 className="text-xl font-extrabold text-slate-900">Unmatched: shows on {meta.label} that no site event is linked to</h1>
        <Link href="/admin/feeds" className="text-sm text-slate-500 hover:text-slate-700">← Feeds &amp; matching</Link>
      </header>
      <main className="max-w-6xl mx-auto px-4 py-6">
        {sp.msg && <div className={`mb-3 rounded-xl border px-4 py-3 text-sm font-semibold ${sp.ok === '1' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-800'}`}>{sp.msg}</div>}
        <div className="flex flex-wrap gap-2 mb-3">
          <Link href={`/admin/unmatched?platform=gigsberg&view=${view}`} className={tab(platform === 'gigsberg')}>Gigsberg ({unlinkedGb.toLocaleString('en-GB')})</Link>
          <Link href={`/admin/unmatched?platform=see_tickets&view=${view}`} className={tab(platform === 'see_tickets')}>See Tickets ({unlinkedSt.toLocaleString('en-GB')})</Link>
        </div>
        <div className="flex flex-wrap gap-2 mb-4">
          <Link href={href({ view: 'soldout', filter: '', status: '', page: 1 })} className={tab(view === 'soldout')}>Sold-out site events with no {meta.label} button ({soldOutCount.toLocaleString('en-GB')})</Link>
          <Link href={href({ view: 'unlinked', filter: '', status: '', page: 1 })} className={tab(view === 'unlinked')}>Unlinked {meta.label} shows</Link>
          <Link href={href({ view: 'hidden', filter: '', status: '', page: 1 })} className={tab(view === 'hidden')}>Hidden</Link>
        </div>
        {view === 'unlinked' && (
          <div className="flex flex-wrap gap-2 mb-4">
            {([['', 'All unlinked'], ['review', 'Need a human look'], ['no_match', 'Checked: no match'], ['waiting', 'Waiting for the matcher']] as const).map(([k, label]) => (
              <Link key={k} href={href({ status: k, page: 1 })} className={tab((sp.status ?? '') === k)}>{label}</Link>
            ))}
          </div>
        )}
        <p className="text-sm text-slate-600 mb-3">
          {view === 'soldout'
            ? `Events that are sold out at Ticketmaster and have no ${meta.label} button. Linking a ${meta.label} show here puts the button on that event, and sold-out events lead with it.`
            : view === 'hidden' ? 'Shows you marked as not on our site. Restore one to see it in the worklist again.'
            : `Each row is a ${meta.label} show with no site event linked. Suggestions are site events on the same day; press Link on the right one, or Hide it if it is genuinely not on our site.`}
          {' '}Nothing here changes until you press a button.
        </p>
        {view !== 'soldout' && (
          <form className="flex flex-wrap gap-2 mb-4" action="/admin/unmatched">
            <input type="hidden" name="platform" value={platform} /><input type="hidden" name="view" value={view} />
            <input name="q" defaultValue={q} placeholder="Search by name" className="border border-slate-300 rounded-lg px-3 py-2 text-sm w-64" />
            <select name="filter" defaultValue={sp.filter ?? ''} className="border border-slate-300 rounded-lg px-2 py-2 text-sm">
              <option value="">All rows</option><option value="candidates">Only rows with suggestions</option><option value="none">Only rows with no suggestion</option>
            </select>
            <button className="text-sm font-bold bg-slate-800 text-white rounded-lg px-4 py-2">Filter</button>
          </form>
        )}
        <p className="text-sm text-slate-600 mb-3"><b>{total.toLocaleString('en-GB')}</b> in this list · page {page} of {pages}{sp.filter ? ` · filter “${sp.filter}” applies to this page only` : ''}</p>

        <div className="space-y-3">
          {shown.length === 0 && <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center text-slate-500">Nothing here{view === 'unlinked' ? ' — every show is linked, hidden or gone.' : '.'}</div>}
          {shown.map(item => item.event ? (
            <div key={item.key} className="bg-white border border-slate-200 rounded-2xl p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-bold text-slate-900">{item.event.title} <span className="text-xs font-bold bg-red-100 text-red-700 rounded px-1.5 py-0.5 ml-1">SOLD OUT</span></p>
                  <p className="text-sm text-slate-500">{day(item.event.start_date)} · {item.event.venue_name}, {item.event.venue_city}</p>
                </div>
                <Link href={`/events/${item.event.slug}`} target="_blank" className="text-sm text-blue-600 font-semibold">Open site page →</Link>
              </div>
              <div className="mt-3 border-t border-slate-100 pt-3 space-y-2">
                {item.catalogueCandidates.length === 0 && <p className="text-sm text-slate-500">No {meta.label} show found on that day at a similar venue. It may genuinely not be listed there.</p>}
                {item.catalogueCandidates.map(c => (
                  <div key={String(c.id)} className="flex flex-wrap items-center justify-between gap-3">
                    <div className="text-sm"><span className="font-semibold text-slate-800">{c.name}</span><span className="text-slate-500"> · {c.venue}, {c.city}</span></div>
                    <div className="flex items-center gap-3">
                      <a href={c.url} target="_blank" rel="noreferrer" className="text-sm text-blue-600 font-semibold">Open on {meta.label} →</a>
                      <form action={linkAction}><input type="hidden" name="platform" value={platform} /><input type="hidden" name="catalogue_id" value={String(c.id)} /><input type="hidden" name="event_id" value={item.event!.id} /><button className="rounded-lg bg-green-700 text-white font-bold text-sm px-4 py-1.5">Link</button></form>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div key={item.key} className="bg-white border border-slate-200 rounded-2xl p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-bold text-slate-900">{item.catalogue!.name}</p>
                  <p className="text-sm text-slate-500">{day(item.catalogue!.event_date + 'T12:00:00Z')} · {item.catalogue!.venue || 'venue unknown'}, {item.catalogue!.city || 'city unknown'}{item.catalogue!.match_reason ? ` · ${item.catalogue!.match_reason}` : ''}</p>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <a href={item.catalogue!.url} target="_blank" rel="noreferrer" className="text-blue-600 font-semibold">Open on {meta.label} →</a>
                  <Link href={platform === 'gigsberg' ? `/admin/gigsberg/link?catalogue_id=${item.catalogue!.id}&return_to=${encodeURIComponent('/admin/gigsberg/matches')}` : `/admin/see-tickets/link?catalogue_id=${item.catalogue!.id}`} className="text-slate-600 font-semibold underline">Search all events</Link>
                  {!isHidden && (
                    <form action={createEventAction}><input type="hidden" name="platform" value={platform} /><input type="hidden" name="catalogue_id" value={String(item.catalogue!.id)} /><input type="hidden" name="return_to" value={href({})} /><button className="rounded-lg bg-blue-700 text-white font-bold text-sm px-3 py-1" title="Builds a new event page from this feed listing">Create event page</button></form>
                  )}
                  {isHidden
                    ? <form action={unhideAction}><input type="hidden" name="platform" value={platform} /><input type="hidden" name="catalogue_id" value={String(item.catalogue!.id)} /><button className="text-slate-600 font-semibold border border-slate-300 rounded-lg px-3 py-1">Restore</button></form>
                    : <form action={hideAction}><input type="hidden" name="platform" value={platform} /><input type="hidden" name="catalogue_id" value={String(item.catalogue!.id)} /><button className="text-slate-600 font-semibold border border-slate-300 rounded-lg px-3 py-1">Hide: not on our site</button></form>}
                </div>
              </div>
              <div className="mt-3 border-t border-slate-100 pt-3 space-y-2">
                {item.candidates.length === 0 && <p className="text-sm text-slate-500">No site event on that day looks like this one. It is probably not on the site yet: press Create event page to add it, or use Search all events if you think it is there under another name.</p>}
                {item.candidates.map(c => {
                  const ev = c.event as ShowfinderEvent & EvRow
                  const has = ev[meta.urlCol]
                  return (
                    <div key={ev.id} className="flex flex-wrap items-center justify-between gap-3">
                      <div className="text-sm">
                        <span className="font-semibold text-slate-800">{ev.title}</span>
                        <span className="text-slate-500"> · {ev.venue_name}, {ev.venue_city}</span>
                        <span className="text-xs text-slate-400"> · {c.why.join(', ')}</span>
                        {has && <span className="text-xs font-bold bg-amber-100 text-amber-800 rounded px-1.5 py-0.5 ml-2">already has a {meta.label} button (Link replaces it)</span>}
                      </div>
                      <div className="flex items-center gap-3">
                        <Link href={`/events/${ev.slug}`} target="_blank" className="text-sm text-blue-600 font-semibold">Open site page →</Link>
                        <form action={linkAction}><input type="hidden" name="platform" value={platform} /><input type="hidden" name="catalogue_id" value={String(item.catalogue!.id)} /><input type="hidden" name="event_id" value={ev.id} /><button className="rounded-lg bg-green-700 text-white font-bold text-sm px-4 py-1.5">Link</button></form>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="flex gap-2 mt-5">
          {page > 1 && <Link href={href({ page: page - 1 })} className={tab(false)}>← Previous</Link>}
          {page < pages && <Link href={href({ page: page + 1 })} className={tab(false)}>Next →</Link>}
        </div>
      </main>
    </div>
  )
}
