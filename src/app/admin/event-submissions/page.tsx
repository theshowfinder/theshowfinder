import Link from 'next/link'
import { requireAdmin } from '@/lib/admin-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { approveSubmissionAction, rejectSubmissionAction } from './actions'

export const dynamic = 'force-dynamic'

type Row = {
  id: string; title: string; category: string; start_date: string; venue_name: string; city: string; ticket_url: string
  description: string | null; image_url: string | null; review_reason: string | null; boost: string | null; boost_paid_at: string | null; created_at: string
  organisers: { name: string; email: string; website: string | null; plan: string } | null
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
    .select('id, title, category, start_date, venue_name, city, ticket_url, description, image_url, review_reason, boost, boost_paid_at, created_at, organisers(name, email, website, plan)')
    .eq('status', 'pending').order('created_at', { ascending: true }).limit(100)
  const rows = (data ?? []) as Row[]
  const { count: liveCount } = await loose.from('event_submissions').select('id', { count: 'exact', head: true }).eq('status', 'approved')
  const { count: paidBoosts } = await loose.from('event_submissions').select('id', { count: 'exact', head: true }).not('boost_paid_at', 'is', null)
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
              <p className="font-extrabold text-slate-900">{r.title}{r.boost_paid_at && <span className="ml-2 text-xs rounded-full bg-green-100 text-green-800 px-2 py-0.5">BOOST PAID</span>}</p>
              <p className="text-sm text-slate-600">{when(r.start_date)} · {r.venue_name}, {r.city} · {r.category}</p>
              <p className="text-sm"><a href={r.ticket_url} target="_blank" rel="noopener noreferrer nofollow" className="underline break-all">{r.ticket_url}</a></p>
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
      </main>
    </div>
  )
}
