import Link from 'next/link'
import { requireAdmin } from '@/lib/admin-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { CITIES } from '@/lib/cities'
import { LIVE_EVENT_STATUSES } from '@/lib/eventPools'

export const dynamic = 'force-dynamic'

export default async function GigsbergCoveragePage({ searchParams }: { searchParams: Promise<{ city?: string }> }) {
  await requireAdmin()
  const requestedCity = (await searchParams).city?.trim() ?? ''
  const city = CITIES.find(item => item.name.toLowerCase() === requestedCity.toLowerCase())?.name ?? CITIES[0].name
  const db = createAdminClient()
  const now = new Date().toISOString()
  const today = now.slice(0, 10)

  const [{ data: ticketmasterEvents }, { data: gigsbergEvents }] = await Promise.all([
    db.from('events_with_venue')
      .select('id, title, start_date, venue_name, venue_city, ticketmaster_id, gigsberg_affiliate_url')
      .ilike('venue_city', city)
      .in('status', LIVE_EVENT_STATUSES)
      .gte('start_date', now)
      .order('start_date', { ascending: true })
      .limit(5000) as unknown as Promise<{ data: Array<{ id: string; title: string; start_date: string; venue_name: string; venue_city: string; ticketmaster_id: string | null; gigsberg_affiliate_url: string | null }> | null }>,
    db.from('gigsberg_catalogue_events')
      .select('id, name, event_date, event_time, venue, city, url, match_status, matched_event_id, inventory_status')
      .ilike('city', city)
      .gte('event_date', today)
      .order('event_date', { ascending: true })
      .limit(5000) as unknown as Promise<{ data: Array<{ id: number; name: string; event_date: string; event_time: string | null; venue: string | null; city: string | null; url: string; match_status: string; matched_event_id: string | null; inventory_status: string }> | null }>,
  ])

  const tmRows = ticketmasterEvents ?? []
  const gbRows = gigsbergEvents ?? []
  const matched = gbRows.filter(row => row.matched_event_id).length
  const linked = tmRows.filter(row => row.gigsberg_affiliate_url).length

  return <main className="min-h-screen bg-slate-50 px-4 sm:px-6 py-8">
    <div className="max-w-[1500px] mx-auto space-y-6">
      <header className="flex items-center gap-4"><Link href="/admin/gigsberg" className="text-slate-400 hover:text-slate-600 text-sm">← Gigsberg</Link><h1 className="text-2xl font-extrabold text-slate-900">{city} source coverage</h1></header>
      <form method="get" className="bg-white rounded-2xl border border-slate-200 p-5 flex gap-3 items-end"><label className="text-sm font-semibold text-slate-600">City<select name="city" defaultValue={city} className="block mt-1 border border-slate-300 rounded-lg px-3 py-2"><option value="">Choose a city</option>{CITIES.map(item => <option key={item.name}>{item.name}</option>)}</select></label><button className="bg-blue-900 text-white font-bold rounded-lg px-5 py-2">View coverage</button></form>
      <section className="grid gap-4 sm:grid-cols-4"><Metric label="Ticketmaster imported" value={tmRows.length} /><Metric label="Gigsberg imported" value={gbRows.length} /><Metric label="Gigsberg matched" value={matched} /><Metric label="Gigsberg links live" value={linked} /></section>
      <section className="bg-white rounded-2xl border border-slate-200 p-6"><h2 className="text-lg font-extrabold mb-4">Gigsberg events imported from {city}</h2><div className="overflow-x-auto"><table className="w-full min-w-[900px] text-sm"><thead><tr className="border-b text-left"><th className="py-2">Event</th><th>Date / venue</th><th>Status</th><th>Match</th><th>Source</th></tr></thead><tbody>{gbRows.map(row => <tr key={row.id} className="border-b last:border-0"><td className="py-3 font-semibold">{row.name}</td><td className="text-slate-600">{row.event_date}<br />{row.venue ?? '—'}</td><td>{row.inventory_status}</td><td>{row.matched_event_id ? 'Matched' : 'Unmatched'}</td><td><a href={row.url} target="_blank" rel="noreferrer" className="text-blue-600 font-semibold">Open Gigsberg →</a></td></tr>)}</tbody></table>{gbRows.length === 0 && <p className="py-8 text-center text-slate-500">No future Gigsberg records currently stored for {city}.</p>}</div></section>
      <section className="bg-white rounded-2xl border border-slate-200 p-6"><h2 className="text-lg font-extrabold mb-4">Ticketmaster events imported from {city}</h2><div className="overflow-x-auto"><table className="w-full min-w-[900px] text-sm"><thead><tr className="border-b text-left"><th className="py-2">Event</th><th>Date / venue</th><th>Ticketmaster ID</th><th>Gigsberg link</th></tr></thead><tbody>{tmRows.map(row => <tr key={row.id} className="border-b last:border-0"><td className="py-3 font-semibold">{row.title}</td><td className="text-slate-600">{new Date(row.start_date).toLocaleDateString('en-GB')}<br />{row.venue_name}</td><td className="text-slate-500">{row.ticketmaster_id ?? '—'}</td><td>{row.gigsberg_affiliate_url ? 'Linked' : 'Not linked'}</td></tr>)}</tbody></table></div></section>
    </div>
  </main>
}

function Metric({ label, value }: { label: string; value: number }) { return <div className="bg-white rounded-2xl border border-slate-200 p-5"><p className="text-xs uppercase tracking-wide font-bold text-slate-400">{label}</p><p className="text-3xl font-extrabold text-slate-900 mt-2">{value}</p></div> }
