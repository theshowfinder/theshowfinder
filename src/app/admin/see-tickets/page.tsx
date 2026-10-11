export const dynamic = 'force-dynamic'
export const maxDuration = 60

import Link from 'next/link'
import { requireAdmin } from '@/lib/admin-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { CITIES } from '@/lib/cities'
import { createSeeTicketsEventAction } from '@/app/admin/gigsberg/actions'

type SearchParams = Promise<{ status?: string; city?: string; q?: string }>

const STATUSES = ['pending', 'auto_matched', 'review', 'no_match'] as const

function money(value: number | null) {
  return value == null ? '—' : `£${Number(value).toFixed(2)}`
}

function statusLabel(status: string) {
  return status === 'auto_matched' ? 'Matched' : status === 'no_match' ? 'No match' : status === 'review' ? 'Awaiting review' : 'Pending'
}

export default async function SeeTicketsInventoryPage({ searchParams }: { searchParams: SearchParams }) {
  await requireAdmin()
  const params = await searchParams
  const status = STATUSES.includes(params.status as typeof STATUSES[number]) ? params.status! : ''
  const city = (params.city ?? '').trim()
  const query = (params.q ?? '').trim()
  const db = createAdminClient()
  const today = new Date().toISOString().slice(0, 10)

  const base = () => {
    let request = db.from('see_tickets_catalogue_events').select('*', { count: 'exact', head: true }).gte('event_date', today)
    if (status) request = request.eq('match_status', status)
    if (city) request = request.ilike('city', city)
    if (query) request = request.or(`name.ilike.%${query}%,primary_artist.ilike.%${query}%,venue.ilike.%${query}%`)
    return request
  }

  const [allCount, matchedCount, reviewCount, noMatchCount] = await Promise.all(
    ['', 'auto_matched', 'review', 'no_match'].map(value => {
      let request = db.from('see_tickets_catalogue_events').select('*', { count: 'exact', head: true }).gte('event_date', today)
      if (value) request = request.eq('match_status', value)
      return request
    }),
  )

  let rowsQuery = db.from('see_tickets_catalogue_events')
    .select('id, name, event_date, venue, city, primary_artist, second_artist, url, availability_status, min_price, max_price, match_status, match_confidence, match_reason, matched_event_id')
    .gte('event_date', today)
    .order('event_date', { ascending: true })
    .order('name', { ascending: true })
    .limit(150)
  if (status) rowsQuery = rowsQuery.eq('match_status', status)
  if (city) rowsQuery = rowsQuery.ilike('city', city)
  if (query) rowsQuery = rowsQuery.or(`name.ilike.%${query}%,primary_artist.ilike.%${query}%,venue.ilike.%${query}%`)
  const { data: rows, error } = await rowsQuery
  const eventIds = (rows ?? []).map(row => row.matched_event_id).filter(Boolean) as string[]
  const { data: linkedEvents } = eventIds.length
    ? await db.from('events').select('id, title, slug').in('id', eventIds)
    : { data: [] as { id: string; title: string; slug: string }[] }
  const eventMap = new Map((linkedEvents ?? []).map(event => [event.id, event]))

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center gap-4">
        <Link href="/admin/gigsberg" className="text-slate-400 hover:text-slate-600 text-sm">← Admin</Link>
        <h1 className="text-xl font-extrabold text-slate-900">See Tickets inventory</h1>
        <span className="text-slate-400 text-sm">24-month catalogue and matching</span>
      </header>
      <main className="max-w-[1600px] mx-auto px-4 sm:px-6 py-8 space-y-6">
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ['Total inventory', allCount.count ?? 0, ''],
            ['Matched to Showfinder', matchedCount.count ?? 0, 'auto_matched'],
            ['Awaiting review', reviewCount.count ?? 0, 'review'],
            ['No match yet', noMatchCount.count ?? 0, 'no_match'],
          ].map(([label, value, filter]) => (
            <Link key={label} href={filter ? `/admin/see-tickets?status=${filter}` : '/admin/see-tickets'} className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm hover:border-blue-400">
              <p className="text-xs uppercase tracking-wide font-bold text-slate-400">{label}</p>
              <p className="text-3xl font-extrabold text-slate-900 mt-2">{value}</p>
              <p className="text-xs text-blue-600 mt-2">View events →</p>
            </Link>
          ))}
        </section>

        <section className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <form method="get" className="grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto_auto] items-end">
            <label className="text-sm font-semibold text-slate-600">Search<input name="q" defaultValue={query} placeholder="Event, artist or venue" className="block w-full mt-1 border border-slate-300 rounded-lg px-3 py-2" /></label>
            <label className="text-sm font-semibold text-slate-600">City<select name="city" defaultValue={city} className="block w-full mt-1 border border-slate-300 rounded-lg px-3 py-2"><option value="">All cities</option>{CITIES.map(item => <option key={item.name}>{item.name}</option>)}</select></label>
            <label className="text-sm font-semibold text-slate-600">Match status<select name="status" defaultValue={status} className="block w-full mt-1 border border-slate-300 rounded-lg px-3 py-2"><option value="">All statuses</option><option value="auto_matched">Matched</option><option value="review">Awaiting review</option><option value="no_match">No match</option><option value="pending">Pending</option></select></label>
            <button className="bg-blue-700 text-white font-bold rounded-lg px-5 py-2.5">Filter</button>
            {(query || city || status) && <Link href="/admin/see-tickets" className="text-center border border-slate-300 text-slate-600 font-semibold rounded-lg px-5 py-2.5">Clear</Link>}
          </form>
          <p className="text-sm text-slate-500 mt-4">Showing up to 150 upcoming records. Click a total above to focus on that group.</p>
        </section>

        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-x-auto">
          {error && <p className="p-6 text-red-700">Could not load See Tickets inventory: {error.message}</p>}
          <table className="w-full min-w-[1250px] text-sm">
            <thead><tr className="border-b border-slate-100 bg-slate-50 text-left"><th className="px-4 py-3">Event</th><th className="px-4 py-3">Date / venue</th><th className="px-4 py-3">Inventory</th><th className="px-4 py-3">Match</th><th className="px-4 py-3">Showfinder page</th><th className="px-4 py-3">Source / actions</th></tr></thead>
            <tbody>{(rows ?? []).map(row => {
              const linked = row.matched_event_id ? eventMap.get(row.matched_event_id) : null
              return <tr key={row.id} className="border-b border-slate-100 align-top">
                <td className="px-4 py-4 font-bold text-slate-900">{row.name}<p className="text-xs text-slate-400 mt-1">{row.primary_artist || row.second_artist || '—'} · {row.city || 'UK'}</p></td>
                <td className="px-4 py-4 text-slate-600 whitespace-nowrap">{row.event_date || '—'}<p className="text-xs text-slate-400 mt-1">{row.venue || '—'}</p></td>
                <td className="px-4 py-4 text-slate-600">{row.availability_status || 'Unknown'}<p className="text-xs text-slate-400 mt-1">{money(row.min_price)}{row.max_price ? `–${money(row.max_price)}` : ''}</p></td>
                <td className="px-4 py-4"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${row.match_status === 'auto_matched' ? 'bg-green-100 text-green-800' : row.match_status === 'review' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-700'}`}>{statusLabel(row.match_status)}</span><p className="text-xs text-slate-400 mt-2">{row.match_reason || 'Not checked yet'}</p></td>
                <td className="px-4 py-4">{linked ? <Link href={`/events/${linked.slug}`} className="text-blue-600 font-semibold hover:underline">{linked.title} →</Link> : <Link href={`/admin/see-tickets/link?catalogue_id=${encodeURIComponent(row.id)}&return_to=${encodeURIComponent(`/admin/see-tickets${status || city || query ? `?${new URLSearchParams({ ...(status ? { status } : {}), ...(city ? { city } : {}), ...(query ? { q: query } : {}) }).toString()}` : ''}`)}`} className="text-green-700 font-bold hover:underline">Link event →</Link>}</td>
                <td className="px-4 py-4"><a href={row.url} target="_blank" rel="noreferrer" className="text-blue-600 font-semibold hover:underline">Open See Tickets →</a>{!linked && <form action={createSeeTicketsEventAction} className="mt-2"><input type="hidden" name="catalogue_id" value={row.id} /><input type="hidden" name="return_to" value={`/admin/see-tickets${status || city || query ? `?${new URLSearchParams({ ...(status ? { status } : {}), ...(city ? { city } : {}), ...(query ? { q: query } : {}) }).toString()}` : ''}`} /><button className="block text-green-700 font-bold hover:underline">Create Showfinder page</button></form>}</td>
              </tr>
            })}</tbody>
          </table>
          {!rows?.length && !error && <p className="p-10 text-center text-slate-500">No See Tickets records match these filters.</p>}
        </section>
      </main>
    </div>
  )
}
