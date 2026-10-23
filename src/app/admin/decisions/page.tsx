export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { requireAdmin } from '@/lib/admin-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { ukToday } from '@/lib/ukTime'
import { mergeGroupAction, notSameAction } from './actions'

// Decisions: everything the automatic jobs could not decide, in one place.
//   Possible duplicates  -> on this page (event_merge_reviews), Merge or Not the same show
//   See Tickets / Gigsberg shows with no site event -> the existing worklist (/admin/unmatched), Link / Create / Hide
const PAGE = 20
type Loose = any // eslint-disable-line @typescript-eslint/no-explicit-any
type Review = { id: string; kind: string; group_key: string; event_ids: string[]; suggested_keep_id: string | null; reasons: string[]; summary: { events?: Array<{ id: string; slug?: string; title: string; start: string; venue: string; source: string }> }; created_at: string }

const when = (iso: string) => {
  const d = new Date(iso)
  const t = d.toLocaleTimeString('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit' })
  return `${d.toLocaleDateString('en-GB', { timeZone: 'Europe/London', weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}${t === '00:00' ? ' · time TBC' : ` · ${t}`}`
}
const sourceLabel = (s: string) => s === 'ticketmaster' ? 'Ticketmaster' : s === 'gigsberg' ? 'Gigsberg' : s === 'see_tickets' ? 'See Tickets' : s.endsWith('_council') ? `${s.replace(/_council$/, '').replace(/_/g, ' ')} local listing` : s

export default async function DecisionsPage({ searchParams }: { searchParams: Promise<{ page?: string; msg?: string; ok?: string }> }) {
  await requireAdmin()
  const sp = await searchParams
  const page = Math.max(1, Number(sp.page) || 1)
  const db = createAdminClient() as Loose
  const today = ukToday()
  const unmatched = (table: string, status: string) => db.from(table).select('id', { count: 'exact', head: true }).is('gone_at', null).gte('event_date', today).is('matched_event_id', null).eq('match_status', status).then((r: Loose) => r.count ?? 0)
  const [dupCount, stReview, gbReview, gbNoMatchTickets, list] = await Promise.all([
    db.from('event_merge_reviews').select('id', { count: 'exact', head: true }).eq('status', 'open').then((r: Loose) => r.count ?? 0),
    unmatched('see_tickets_catalogue_events', 'review'),
    unmatched('gigsberg_catalogue_events', 'review'),
    db.from('gigsberg_catalogue_events').select('id', { count: 'exact', head: true }).is('gone_at', null).gte('event_date', today).is('matched_event_id', null).eq('match_status', 'no_match').eq('inventory_status', 'available').then((r: Loose) => r.count ?? 0),
    db.from('event_merge_reviews').select('id, kind, group_key, event_ids, suggested_keep_id, reasons, summary, created_at').eq('status', 'open').order('created_at', { ascending: true }).order('id').range((page - 1) * PAGE, page * PAGE - 1),
  ])
  const reviews = (list.data ?? []) as Review[]
  // Only show groups whose events are still on the site (a show may have passed or been merged since).
  const ids = [...new Set(reviews.flatMap(r => r.event_ids))]
  const { data: live } = ids.length ? await db.from('events').select('id, slug, start_date, status, merged_into').in('id', ids) : { data: [] }
  const liveById = new Map(((live ?? []) as Array<{ id: string; slug: string; start_date: string; status: string; merged_into: string | null }>).map(e => [e.id, e]))
  const pages = Math.max(1, Math.ceil(dupCount / PAGE))
  const card = 'bg-white border border-slate-200 rounded-2xl p-4'

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
        <h1 className="text-xl font-extrabold text-slate-900">Decisions</h1>
        <Link href="/admin" className="text-sm text-slate-500 hover:text-slate-700">← Admin</Link>
      </header>
      <main className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        <p className="text-sm text-slate-600">Everything the overnight jobs could not decide on their own. Nothing changes until you press a button.</p>
        {sp.msg && <div className={`rounded-xl border px-4 py-3 text-sm font-semibold ${sp.ok === '1' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-800'}`}>{sp.msg}</div>}

        <section className="grid sm:grid-cols-3 gap-3">
          <a href="#duplicates" className={`${card} hover:border-slate-400`}><p className="text-3xl font-extrabold text-slate-900">{dupCount.toLocaleString('en-GB')}</p><p className="text-sm font-semibold text-slate-700">Possible duplicates</p><p className="text-xs text-slate-500">Same show listed twice? Merge or keep apart.</p></a>
          <Link href="/admin/unmatched?platform=see_tickets&view=unlinked&status=review" className={`${card} hover:border-slate-400`}><p className="text-3xl font-extrabold text-slate-900">{stReview.toLocaleString('en-GB')}</p><p className="text-sm font-semibold text-slate-700">See Tickets shows to check</p><p className="text-xs text-slate-500">A likely match was found but not certain. Link or hide.</p></Link>
          <Link href="/admin/unmatched?platform=gigsberg&view=unlinked" className={`${card} hover:border-slate-400`}><p className="text-3xl font-extrabold text-slate-900">{(gbReview + gbNoMatchTickets).toLocaleString('en-GB')}</p><p className="text-sm font-semibold text-slate-700">Gigsberg shows to check</p><p className="text-xs text-slate-500">Have tickets but no site event. Link, create or hide.</p></Link>
        </section>

        <section id="duplicates" className="space-y-3">
          <h2 className="text-lg font-extrabold text-slate-900">Possible duplicates</h2>
          <p className="text-sm text-slate-600">The ★ listing is the one the system would keep (the fullest seller listing). <b>Keep this one</b> merges the others into it: their seller buttons move across and their pages redirect. <b>Not the same show</b> keeps them apart for good.</p>
          {reviews.length === 0 && <div className={`${card} text-center text-slate-500`}>Nothing to decide.</div>}
          {reviews.map(r => {
            const events = (r.summary.events ?? []).filter(e => { const l = liveById.get(e.id); return l && !l.merged_into })
            const isExtra = r.group_key.startsWith('extra:')
            return (
              <div key={r.id} className={card}>
                <p className="text-xs font-semibold text-amber-700 mb-2">{isExtra ? 'An extra (hotel bundle, parking, VIP…) with no clear main show' : 'Why it needs you'}: {r.reasons.join('; ')}</p>
                {events.length < (isExtra ? 1 : 2) && <p className="text-sm text-slate-500">Already resolved (a listing has passed or been merged). <form action={notSameAction} className="inline"><input type="hidden" name="review_id" value={r.id} /><input type="hidden" name="page" value={String(page)} /><button className="underline font-semibold">Clear it</button></form></p>}
                <div className="divide-y divide-slate-100">
                  {events.map(e => (
                    <div key={e.id} className="py-2 flex flex-wrap items-center justify-between gap-3">
                      <div className="text-sm">
                        <p className="font-semibold text-slate-900">{r.suggested_keep_id === e.id ? '★ ' : ''}{e.title}</p>
                        <p className="text-slate-500">{when(liveById.get(e.id)?.start_date ?? e.start)} · {e.venue} · {sourceLabel(e.source)}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <Link href={`/events/${liveById.get(e.id)?.slug ?? e.slug ?? ''}`} target="_blank" className="text-sm text-blue-600 font-semibold">Open →</Link>
                        {!isExtra && <form action={mergeGroupAction}><input type="hidden" name="review_id" value={r.id} /><input type="hidden" name="keep_id" value={e.id} /><input type="hidden" name="page" value={String(page)} /><button className="rounded-lg bg-green-700 text-white font-bold text-sm px-3 py-1.5">Keep this one</button></form>}
                      </div>
                    </div>
                  ))}
                </div>
                {events.length >= (isExtra ? 1 : 2) && <form action={notSameAction} className="mt-2"><input type="hidden" name="review_id" value={r.id} /><input type="hidden" name="page" value={String(page)} /><button className="rounded-lg border border-slate-300 text-slate-700 font-bold text-sm px-3 py-1.5">{isExtra ? 'Leave it listed' : 'Not the same show'}</button></form>}
              </div>
            )
          })}
          {pages > 1 && (
            <div className="flex items-center justify-between text-sm">
              {page > 1 ? <Link href={`/admin/decisions?page=${page - 1}`} className="font-semibold text-blue-600">← Previous</Link> : <span />}
              <span className="text-slate-500">Page {page} of {pages}</span>
              {page < pages ? <Link href={`/admin/decisions?page=${page + 1}`} className="font-semibold text-blue-600">Next →</Link> : <span />}
            </div>
          )}
        </section>
      </main>
    </div>
  )
}
