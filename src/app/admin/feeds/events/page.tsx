export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { requireAdmin } from '@/lib/admin-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { LIVE_EVENT_STATUSES } from '@/lib/listedEvents'
import { COMBOS, applyCombo } from '@/lib/feedsOverview'

const PAGE = 50
type Loose = any // eslint-disable-line @typescript-eslint/no-explicit-any

const fmt = (d: string) => new Date(d).toLocaleDateString('en-GB', { timeZone: 'Europe/London', weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
function Chip({ on, label }: { on: boolean; label: string }) {
  return <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded ${on ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-300'}`}>{label}</span>
}

export default async function FeedEventsPage({ searchParams }: { searchParams: Promise<{ combo?: string; page?: string; q?: string }> }) {
  await requireAdmin()
  const sp = await searchParams
  const combo = COMBOS.find(c => c.key === sp.combo) ?? COMBOS[0]
  const page = Math.max(1, Number(sp.page) || 1)
  const q = (sp.q ?? '').trim().replace(/[%_,()\\]/g, ' ')
  const from = (page - 1) * PAGE
  const db = createAdminClient() as Loose

  let query = db.from('events')
    .select('id, title, slug, start_date, status, ticketmaster_id, gigsberg_affiliate_url, see_tickets_affiliate_url, source, venue:venues(name, city)', { count: 'exact' })
    .gte('start_date', new Date().toISOString()).in('status', LIVE_EVENT_STATUSES)
  query = applyCombo(query, combo)
  if (q) query = query.ilike('title', `%${q}%`)
  const { data, count } = await query.order('start_date', { ascending: true }).range(from, from + PAGE - 1)
  const rows = (data ?? []) as Array<{ id: string; title: string; slug: string; start_date: string; status: string; ticketmaster_id: string | null; gigsberg_affiliate_url: string | null; see_tickets_affiliate_url: string | null; source: string | null; venue: { name: string; city: string } | null }>
  const total = count ?? 0
  const pages = Math.max(1, Math.ceil(total / PAGE))
  const href = (over: Record<string, string | number>) => `/admin/feeds/events?${new URLSearchParams({ combo: combo.key, ...(q ? { q } : {}), ...Object.fromEntries(Object.entries(over).map(([k, v]) => [k, String(v)])) }).toString()}`
  const tab = (on: boolean) => `text-sm font-semibold px-3 py-1.5 rounded-full border ${on ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-700 border-slate-300'}`
  const missingGb = !combo.gb, missingSt = !combo.st

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
        <h1 className="text-xl font-extrabold text-slate-900">{combo.label}</h1>
        <Link href="/admin/feeds" className="text-sm text-slate-500 hover:text-slate-700">← Feeds &amp; matching</Link>
      </header>
      <main className="max-w-6xl mx-auto px-4 py-6">
        <div className="flex flex-wrap gap-2 mb-4">
          {COMBOS.map(c => <Link key={c.key} href={`/admin/feeds/events?combo=${c.key}`} className={tab(c.key === combo.key)}>{c.label}</Link>)}
        </div>
        <p className="text-sm text-slate-600 mb-3">{combo.hint}.{(missingGb || missingSt) && combo.tm ? ' To add the missing button, open Match the unmatched on the Feeds page and link the show there.' : ''}</p>
        <form className="flex gap-2 mb-4" action="/admin/feeds/events">
          <input type="hidden" name="combo" value={combo.key} />
          <input name="q" defaultValue={q} placeholder="Search by name" className="border border-slate-300 rounded-lg px-3 py-2 text-sm w-64" />
          <button className="text-sm font-bold bg-slate-800 text-white rounded-lg px-4 py-2">Search</button>
        </form>
        <p className="text-sm text-slate-600 mb-3"><b>{total.toLocaleString('en-GB')}</b> events · page {page} of {pages}</p>
        <div className="bg-white border border-slate-200 rounded-2xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wider text-slate-500 border-b border-slate-100"><tr><th className="p-3">Event</th><th className="p-3">Date</th><th className="p-3">Venue</th><th className="p-3">Buttons</th><th className="p-3">Pages</th></tr></thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id} className="border-b border-slate-50 align-top">
                  <td className="p-3 font-semibold text-slate-900">{r.title}{r.status === 'sold_out' && <span className="ml-2 text-[11px] font-bold bg-red-100 text-red-700 rounded px-1.5 py-0.5">SOLD OUT</span>}</td>
                  <td className="p-3 whitespace-nowrap text-slate-600">{fmt(r.start_date)}</td>
                  <td className="p-3 text-slate-600">{r.venue?.name}<div className="text-xs text-slate-400">{r.venue?.city}</div></td>
                  <td className="p-3 space-x-1 whitespace-nowrap"><Chip on={!!r.ticketmaster_id} label="TM" /><Chip on={!!r.gigsberg_affiliate_url} label="Gigsberg" /><Chip on={!!r.see_tickets_affiliate_url} label="See Tickets" /></td>
                  <td className="p-3 whitespace-nowrap"><Link href={`/events/${r.slug}`} target="_blank" className="text-blue-700 underline">site page</Link> · <Link href={`/admin/events/${r.slug}`} className="text-blue-700 underline">edit</Link></td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={5} className="p-8 text-center text-slate-500">No events in this group.</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="flex gap-2 mt-5">
          {page > 1 && <Link href={href({ page: page - 1 })} className={tab(false)}>← Previous</Link>}
          {page < pages && <Link href={href({ page: page + 1 })} className={tab(false)}>Next →</Link>}
        </div>
      </main>
    </div>
  )
}
