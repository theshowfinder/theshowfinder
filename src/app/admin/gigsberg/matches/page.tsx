export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { requireAdmin } from '@/lib/admin-auth'
import { createAdminClient } from '@/lib/supabase/admin'

type MatchRow = {
  id: number
  name: string
  event_date: string
  venue: string | null
  city: string | null
  performer1: string | null
  url: string
  match_status: string
  match_confidence: number | null
  match_reason: string | null
  matched_event_id: string | null
}

export default async function GigsbergMatchesPage() {
  await requireAdmin()
  const db = createAdminClient()
  const { data, error } = await db
    .from('gigsberg_catalogue_events')
    .select('id, name, event_date, venue, city, performer1, url, match_status, match_confidence, match_reason, matched_event_id')
    .in('match_status', ['pending', 'review', 'no_match'])
    .order('event_date', { ascending: true })
    .limit(500) as unknown as { data: MatchRow[] | null; error: { message: string } | null }

  const rows = data ?? []

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center gap-4">
        <Link href="/admin/gigsberg" className="text-slate-400 hover:text-slate-600 text-sm">← Gigsberg</Link>
        <h1 className="text-xl font-extrabold text-slate-900">Gigsberg Matches</h1>
        <span className="text-slate-400 text-sm">{rows.length} catalogue records shown</span>
      </header>
      <main className="max-w-[1500px] mx-auto px-4 sm:px-6 py-8">
        {error ? (
          <div className="bg-red-50 border border-red-200 text-red-800 rounded-xl p-6">Unable to load matches: {error.message}</div>
        ) : rows.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-500">No Gigsberg catalogue records found.</div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-x-auto">
            <table className="w-full min-w-[1050px] text-sm">
              <thead><tr className="border-b border-slate-100 bg-slate-50 text-left">
                <th className="px-4 py-3 font-semibold text-slate-600">Gigsberg event</th>
                <th className="px-4 py-3 font-semibold text-slate-600">Date / location</th>
                <th className="px-4 py-3 font-semibold text-slate-600">Status</th>
                <th className="px-4 py-3 font-semibold text-slate-600">Possible match</th>
                <th className="px-4 py-3" />
              </tr></thead>
              <tbody>{rows.map(row => <tr key={row.id} className="border-b border-slate-100 last:border-0 align-top">
                <td className="px-4 py-4"><p className="font-bold text-slate-900">{row.name}</p><p className="text-xs text-slate-400 mt-1">{row.performer1 || 'Performer unknown'} · ID {row.id}</p></td>
                <td className="px-4 py-4 text-slate-600 whitespace-nowrap">{new Date(row.event_date).toLocaleDateString('en-GB')}<p className="text-xs text-slate-400 mt-1">{row.venue || 'Venue unknown'}{row.city ? `, ${row.city}` : ''}</p></td>
                <td className="px-4 py-4"><span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${row.match_status === 'review' ? 'bg-amber-100 text-amber-800' : row.match_status === 'pending' ? 'bg-blue-100 text-blue-800' : 'bg-slate-100 text-slate-600'}`}>{row.match_status === 'review' ? 'Review' : row.match_status === 'pending' ? 'Awaiting match' : 'New event candidate'}</span></td>
                <td className="px-4 py-4 text-slate-600">{row.match_reason || 'No close match found'}{row.match_confidence !== null && <p className="text-xs text-slate-400 mt-1">Confidence {Math.round(row.match_confidence * 100)}%</p>}</td>
                <td className="px-4 py-4 whitespace-nowrap"><a href={row.url} target="_blank" rel="noreferrer" className="text-blue-600 font-semibold hover:underline">Open Gigsberg →</a></td>
              </tr>)}</tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  )
}
