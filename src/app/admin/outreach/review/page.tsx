export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { requireAdmin } from '@/lib/admin-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { looksLikeChain } from '@/lib/outreach'
import PendingButton from '@/components/admin/PendingButton'
import { removeSelectedAction, approveSelectedAction } from '../actions'

// Quick review (Chris, 27 Nov 2026): one compact line per business waiting to be emailed, so a list can be run
// through fast and anything that isn't a fit ticked and removed in one go. Removed businesses are kept as a record
// (status "rejected") and never emailed; nothing is deleted.
type Loose = any // eslint-disable-line @typescript-eslint/no-explicit-any
type Row = { id: string; business_name: string; category: string; city: string; email: string; website: string | null; near_venue: string | null; distance_label: string | null; company_type: string; notes: string | null; created_at: string }

export default async function ReviewPage({ searchParams }: { searchParams: Promise<{ status?: string; city?: string; msg?: string; ok?: string }> }) {
  await requireAdmin()
  const sp = await searchParams
  const status = sp.status === 'to_check' ? 'to_check' : 'approved'
  const db = createAdminClient() as Loose
  let q = db.from('outreach_prospects').select('id, business_name, category, city, email, website, near_venue, distance_label, company_type, notes, created_at')
    .eq('status', status).order('city').order('business_name').limit(400)
  if (status === 'approved') q = q.is('sent_via', null)
  if (sp.city) q = q.eq('city', sp.city)
  const [{ data }, { data: cityRows }] = await Promise.all([
    q,
    db.from('outreach_prospects').select('city').eq('status', status).limit(5000),
  ])
  const rows = (data ?? []) as Row[]
  const cityCounts = new Map<string, number>()
  for (const r of (cityRows ?? []) as Array<{ city: string }>) cityCounts.set(r.city, (cityCounts.get(r.city) ?? 0) + 1)
  const cities = [...cityCounts.entries()].sort((a, b) => b[1] - a[1])
  const link = (p: Record<string, string | undefined>) => `/admin/outreach/review?${new URLSearchParams(Object.entries({ status, city: sp.city, ...p }).filter(([, v]) => v) as [string, string][]).toString()}`
  const host = (u: string | null) => { try { return u ? new URL(u).hostname.replace(/^www\./, '') : '' } catch { return '' } }

  return (
    <div className="min-h-screen bg-slate-50">
      <main className="max-w-6xl mx-auto px-3 py-5 space-y-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h1 className="text-xl font-extrabold text-slate-900">Quick review</h1>
          <Link href="/admin/outreach" className="text-sm font-semibold text-blue-700">← Outreach</Link>
        </div>
        <p className="text-sm text-slate-600">Tick anything that isn&apos;t a fit (a chain, the wrong kind of business, a wrong or personal email) and press <b>Remove ticked</b>. Removed businesses are never emailed and are kept as a record.</p>
        {sp.msg && <div className={`rounded-xl border px-4 py-3 text-sm font-semibold ${sp.ok === '1' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-800'}`}>{sp.msg}</div>}

        <div className="flex flex-wrap gap-2 text-sm">
          {(['approved', 'to_check'] as const).map(s => (
            <Link key={s} href={`/admin/outreach/review?status=${s}`} className={`rounded-full px-3 py-1 font-bold ${status === s ? 'bg-slate-900 text-white' : 'bg-white border border-slate-300 text-slate-700'}`}>
              {s === 'approved' ? 'Approved, waiting to send' : 'Ready to check'}
            </Link>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5 text-xs">
          <Link href={link({ city: '' })} className={`rounded-full px-2.5 py-1 font-semibold ${!sp.city ? 'bg-rose-600 text-white' : 'bg-white border border-slate-300 text-slate-700'}`}>All cities</Link>
          {cities.map(([c, n]) => (
            <Link key={c} href={link({ city: c })} className={`rounded-full px-2.5 py-1 font-semibold ${sp.city === c ? 'bg-rose-600 text-white' : 'bg-white border border-slate-300 text-slate-700'}`}>{c} {n}</Link>
          ))}
        </div>

        <form className="space-y-2">
          <input type="hidden" name="back" value={link({})} />
          <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 bg-slate-50 py-2">
            <PendingButton formAction={removeSelectedAction} pendingLabel="Removing…" className="rounded-lg bg-red-600 text-white font-bold text-sm px-4 py-2">Remove ticked</PendingButton>
            {status === 'to_check' && <PendingButton formAction={approveSelectedAction} pendingLabel="Approving…" className="rounded-lg bg-green-700 text-white font-bold text-sm px-4 py-2">Approve ticked</PendingButton>}
            <span className="text-sm text-slate-500">{rows.length} shown{rows.length === 400 ? ' (first 400: pick a city to see the rest)' : ''}</span>
          </div>
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-slate-100 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr><th className="p-2 w-8"></th><th className="p-2">Business</th><th className="p-2">Email</th><th className="p-2 hidden md:table-cell">Near</th><th className="p-2 hidden lg:table-cell">Notes</th></tr>
              </thead>
              <tbody>
                {rows.map(r => {
                  const chain = looksLikeChain({ name: r.business_name, website: r.website, email: r.email })
                  return (
                    <tr key={r.id} className="border-t border-slate-100 align-top hover:bg-amber-50 has-[:checked]:bg-red-50">
                      <td className="p-2"><input type="checkbox" name="id" value={r.id} className="h-5 w-5" aria-label={`Select ${r.business_name}`} /></td>
                      <td className="p-2">
                        <span className="font-bold text-slate-900">{r.business_name}</span>{chain && <span className="ml-1 rounded bg-amber-200 px-1 text-[10px] font-bold text-amber-900">CHAIN?</span>}
                        <div className="text-xs text-slate-500">{r.category} · {r.city}{r.website ? <> · <a href={r.website} target="_blank" rel="noreferrer" className="text-blue-600">{host(r.website)}</a></> : null}</div>
                      </td>
                      <td className="p-2 break-all text-slate-700">{r.email}</td>
                      <td className="p-2 hidden md:table-cell text-xs text-slate-600">{r.distance_label ?? r.near_venue ?? ''}</td>
                      <td className="p-2 hidden lg:table-cell text-xs text-slate-500 max-w-xs">{(r.notes ?? '').slice(0, 120)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </form>
      </main>
    </div>
  )
}
