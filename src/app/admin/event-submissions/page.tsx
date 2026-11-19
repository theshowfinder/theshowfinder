import Link from 'next/link'
import { requireAdmin } from '@/lib/admin-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { approveSubmissionAction, rejectSubmissionAction, giftFeatureAction } from './actions'

export const dynamic = 'force-dynamic'

type Row = {
  id: string; title: string; category: string; start_date: string; venue_name: string; city: string; town: string | null; postcode: string | null; ticket_url: string | null; free_capacity: number | null; paid_price_pence: number | null; paid_capacity: number | null
  ticket_plan: { types: { name: string; price_pence: number; capacity: number; sales_end: string | null }[]; codes: { code: string; percent_off: number | null; amount_off_pence: number | null; max_uses: number | null }[] } | null
  description: string | null; image_url: string | null; review_reason: string | null; boost: string | null; boost_paid_at: string | null; created_at: string; series_id: string | null
  organisers: { name: string; email: string; website: string | null; plan: string } | null
}

type LiveRow = {
  id: string; title: string; start_date: string; city: string; boost_paid_at: string | null
  organisers: { name: string } | null; events: { id: string; slug: string; is_featured: boolean; boost_until: string | null } | null
}

function when(iso: string) {
  return new Date(iso).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' })
}

export default async function EventSubmissionsPage() {
  await requireAdmin()
  const db = createAdminClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const loose = db as any
  const { data, error } = await loose.from('event_submissions')
    .select('id, title, category, start_date, venue_name, city, town, postcode, ticket_url, free_capacity, paid_price_pence, paid_capacity, ticket_plan, description, image_url, review_reason, boost, boost_paid_at, created_at, series_id, organisers(name, email, website, plan)')
    .eq('status', 'pending').order('created_at', { ascending: true }).limit(100)
  // A repeat event shows once (its first date) with the number of dates; approving it approves them all.
  const all = (data ?? []) as Row[]
  const seriesDates = new Map<string, number>()
  for (const r of all) if (r.series_id) seriesDates.set(r.series_id, (seriesDates.get(r.series_id) ?? 0) + 1)
  const firstOfSeries = new Set<string>()
  const rows = all.filter(r => !r.series_id || (!firstOfSeries.has(r.series_id) && !!firstOfSeries.add(r.series_id)))
  const { count: liveCount } = await loose.from('event_submissions').select('id', { count: 'exact', head: true }).eq('status', 'approved')
  const { count: paidBoosts } = await loose.from('event_submissions').select('id', { count: 'exact', head: true }).not('boost_paid_at', 'is', null)
  const { data: liveData } = await loose.from('event_submissions')
    .select('id, title, start_date, city, boost_paid_at, organisers(name), events(id, slug, is_featured, boost_until)')
    .eq('status', 'approved').gte('start_date', new Date().toISOString()).order('reviewed_at', { ascending: false, nullsFirst: false }).limit(20)
  const live = (liveData ?? []) as LiveRow[]
  const { count: promoters } = await loose.from('organisers').select('id', { count: 'exact', head: true }).eq('plan', 'promoter').eq('plan_status', 'active')

  return (
    <div className="min-h-screen bg-slate-50">
      <main className="max-w-4xl mx-auto px-4 py-6 space-y-4">
        <Link href="/admin" className="text-sm font-semibold text-slate-500">← Today</Link>
        <h1 className="text-xl font-extrabold text-slate-900">Event listings from organisers</h1>
        <p className="text-sm text-slate-600">Listings with a known ticket site go live by themselves. These are the ones that need a quick look first.</p>
        <div className="grid grid-cols-3 gap-3">
          {[[liveCount ?? 0, 'listings live'], [paidBoosts ?? 0, 'paid boosts'], [promoters ?? 0, 'promoter plans']].map(([n, l]) => (
            <div key={String(l)} className="rounded-2xl bg-white border border-slate-200 p-4"><p className="text-2xl font-extrabold">{n}</p><p className="text-sm text-slate-600">{l}</p></div>
          ))}
        </div>
        {error && <p className="rounded-xl border px-4 py-3 text-sm font-semibold bg-red-50 border-red-200 text-red-800">Could not load ({error.message}). Has migration 126 been run?</p>}
        {rows.length === 0 && !error && <p className="rounded-2xl bg-white border border-slate-200 p-5 text-sm text-slate-600">Nothing waiting.</p>}
        <ul className="space-y-3">
          {rows.map(r => (
            <li key={r.id} className="rounded-2xl bg-white border border-slate-200 p-4 space-y-2">
              {r.review_reason && <p className="text-xs font-extrabold uppercase tracking-widest text-amber-700">{r.review_reason}</p>}
              <p className="font-extrabold text-slate-900">{r.title}{r.series_id && <span className="ml-2 text-xs rounded-full bg-blue-100 text-blue-800 px-2 py-0.5">{seriesDates.get(r.series_id)} DATES, ONE APPROVAL</span>}{r.boost_paid_at && <span className="ml-2 text-xs rounded-full bg-green-100 text-green-800 px-2 py-0.5">BOOST PAID</span>}</p>
              <p className="text-sm text-slate-600">{when(r.start_date)} · {r.venue_name}, {r.town ?? r.city}{r.postcode ? ` ${r.postcode}` : ''}{r.town && r.town !== r.city ? ` (shows on ${r.city})` : ''} · {r.category}</p>
              {r.ticket_url && <p className="text-sm"><a href={r.ticket_url} target="_blank" rel="noopener noreferrer nofollow" className="underline break-all">{r.ticket_url}</a></p>}
              {r.free_capacity && <p className="text-sm font-semibold">{r.free_capacity} free tickets through TheShowFinder</p>}
              {r.paid_price_pence && (
                <div className="text-sm">
                  <p className="font-semibold">Paid tickets through TheShowFinder:</p>
                  <ul className="list-disc pl-5">
                    {(r.ticket_plan?.types ?? [{ name: 'Ticket', price_pence: r.paid_price_pence, capacity: r.paid_capacity ?? 0, sales_end: null }]).map(t => (
                      <li key={t.name}>{t.name}: £{(t.price_pence / 100).toFixed(2)} × {t.capacity}{t.sales_end ? ` (until ${t.sales_end.slice(0, 10)})` : ''}</li>
                    ))}
                    {(r.ticket_plan?.codes ?? []).map(c => (
                      <li key={c.code}>Code {c.code}: {c.percent_off ? `${c.percent_off}% off` : `£${((c.amount_off_pence ?? 0) / 100).toFixed(2)} off`}{c.max_uses ? `, ${c.max_uses} tickets` : ''}</li>
                    ))}
                  </ul>
                </div>
              )}
              {r.description && <p className="text-sm text-slate-600 whitespace-pre-line">{r.description}</p>}
              {r.image_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={r.image_url} alt="" className="h-32 rounded-lg object-cover" />
              )}
              {r.boost_paid_at && <p className="text-xs font-semibold text-amber-700">Boost paid: if you reject, refund the £9.95 in Stripe (Payments → find their email → Refund).</p>}
              <p className="text-xs text-slate-500">From {r.organisers?.name} · {r.organisers?.email}{r.organisers?.website ? ` · ${r.organisers.website}` : ''}</p>
              <div className="flex flex-wrap gap-2 pt-1">
                <form action={approveSubmissionAction}><input type="hidden" name="id" value={r.id} /><button className="min-h-[40px] px-4 rounded-xl text-sm font-bold text-white bg-green-700">Approve and publish</button></form>
                <form action={rejectSubmissionAction} className="flex gap-2"><input type="hidden" name="id" value={r.id} /><input name="reason" placeholder="Reason (optional, sent to them)" className="min-h-[40px] px-3 rounded-xl border border-slate-300 text-sm" /><button className="min-h-[40px] px-4 rounded-xl text-sm font-bold text-white" style={{ backgroundColor: '#E8003D' }}>Reject</button></form>
              </div>
            </li>
          ))}
        </ul>
        <section className="space-y-2">
          <h2 className="text-lg font-bold text-slate-900">Live organiser listings</h2>
          <p className="text-sm text-slate-600">Feature one free to help a promoter we want to keep: top of its city page until the night, plus a social post draft in Admin → Social.</p>
          <ul className="space-y-2">
            {live.map(l => (
              <li key={l.id} className="bg-white rounded-xl border border-slate-200 p-3 flex flex-wrap items-center gap-3">
                <div className="flex-1 min-w-[200px]">
                  {l.events ? <a href={`/events/${l.events.slug}`} className="font-semibold text-slate-900 underline">{l.title}</a> : <span className="font-semibold">{l.title}</span>}
                  <p className="text-xs text-slate-500">{when(l.start_date)} · {l.city}{l.organisers ? ` · ${l.organisers.name}` : ''}{l.boost_paid_at ? ' · paid boost' : ''}</p>
                </div>
                {l.events && (
                  <form action={giftFeatureAction}>
                    <input type="hidden" name="event_id" value={l.events.id} />
                    <input type="hidden" name="on" value={l.events.is_featured ? '0' : '1'} />
                    <button className={`min-h-[40px] px-4 rounded-xl text-sm font-bold ${l.events.is_featured ? 'bg-slate-200 text-slate-800' : 'bg-amber-500 text-white'}`}>{l.events.is_featured ? 'Featured ✓ (turn off)' : 'Feature free'}</button>
                  </form>
                )}
              </li>
            ))}
            {live.length === 0 && <li className="text-sm text-slate-500">No upcoming organiser listings yet.</li>}
          </ul>
        </section>
      </main>
    </div>
  )
}
