import Link from 'next/link'
import { requireAdmin } from '@/lib/admin-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { CITIES } from '@/lib/cities'
import { LIVE_EVENT_STATUSES } from '@/lib/eventPools'
import { checkGigsbergInventoryAction, createGigsbergEventAction } from '../actions'

export const dynamic = 'force-dynamic'

export default async function GigsbergCoveragePage({ searchParams }: { searchParams: Promise<{ city?: string; source?: string; inventory?: string; linked?: string; created?: string }> }) {
  await requireAdmin()
  const requestedParams = await searchParams
  const requestedCity = requestedParams.city?.trim() ?? ''
  const sourceFilter = requestedParams.source
  const city = CITIES.find(item => item.name.toLowerCase() === requestedCity.toLowerCase())?.name ?? CITIES[0].name
  const db = createAdminClient()
  const now = new Date().toISOString()
  const today = now.slice(0, 10)
  type CountResult = { count: number | null }

  const [
    { data: ticketmasterEvents, count: ticketmasterCount },
    { data: gigsbergEvents, count: gigsbergCount },
    { count: bothLinksCount },
    { count: ticketmasterOnlyCount },
    { count: gigsbergOnlyCount },
    { count: gigsbergAwaitingCount },
  ] = await Promise.all([
    db.from('events')
      .select('id, title, start_date, ticketmaster_id, gigsberg_affiliate_url, venue:venues!inner(name, city)', { count: 'exact' })
      .ilike('venues.city', city)
      .not('ticketmaster_id', 'is', null)
      .in('status', LIVE_EVENT_STATUSES)
      .gte('start_date', now)
      .order('start_date', { ascending: true })
      .limit(5000) as unknown as Promise<{ data: Array<{ id: string; title: string; start_date: string; ticketmaster_id: string | null; gigsberg_affiliate_url: string | null; venue: { name: string; city: string } | null }> | null; count: number | null }>,
    db.from('gigsberg_catalogue_events')
      .select('id, name, event_date, event_time, venue, city, url, match_status, matched_event_id, inventory_status', { count: 'exact' })
      .ilike('city', city)
      .gte('event_date', today)
      .order('event_date', { ascending: true })
      .limit(5000) as unknown as Promise<{ data: Array<{ id: number; name: string; event_date: string; event_time: string | null; venue: string | null; city: string | null; url: string; match_status: string; matched_event_id: string | null; inventory_status: string }> | null; count: number | null }>,
    db.from('events')
      .select('id, venue:venues!inner(city)', { count: 'exact', head: true })
      .ilike('venues.city', city)
      .not('ticketmaster_id', 'is', null)
      .not('gigsberg_affiliate_url', 'is', null)
      .in('status', LIVE_EVENT_STATUSES)
      .gte('start_date', now) as unknown as Promise<CountResult>,
    db.from('events')
      .select('id, venue:venues!inner(city)', { count: 'exact', head: true })
      .ilike('venues.city', city)
      .not('ticketmaster_id', 'is', null)
      .is('gigsberg_affiliate_url', null)
      .in('status', LIVE_EVENT_STATUSES)
      .gte('start_date', now) as unknown as Promise<CountResult>,
    db.from('events')
      .select('id, venue:venues!inner(city)', { count: 'exact', head: true })
      .ilike('venues.city', city)
      .is('ticketmaster_id', null)
      .not('gigsberg_affiliate_url', 'is', null)
      .in('status', LIVE_EVENT_STATUSES)
      .gte('start_date', now) as unknown as Promise<CountResult>,
    db.from('gigsberg_catalogue_events')
      .select('id', { count: 'exact', head: true })
      .ilike('city', city)
      .gte('event_date', today)
      .in('match_status', ['pending', 'review', 'no_match']) as unknown as Promise<CountResult>,
  ])

  const tmRows = (ticketmasterEvents ?? []).map(row => ({
    ...row,
    venue_name: row.venue?.name ?? '—',
    venue_city: row.venue?.city ?? city,
  }))
  const gbRows = gigsbergEvents ?? []
  const linkedEventIds = Array.from(new Set(gbRows.map(row => row.matched_event_id).filter((id): id is string => Boolean(id))))
  const { data: linkedEvents } = linkedEventIds.length
    ? await db.from('events').select('id, title, slug, ticketmaster_id, gigsberg_affiliate_url').in('id', linkedEventIds)
    : { data: [] as Array<{ id: string; title: string; slug: string; ticketmaster_id: string | null; gigsberg_affiliate_url: string | null }> }
  const linkedEventMap = new Map((linkedEvents ?? []).map(event => [event.id, event]))
  const visibleTmRows = sourceFilter === 'ticketmaster-only'
    ? tmRows.filter(row => !row.gigsberg_affiliate_url)
    : tmRows
  return <main className="min-h-screen bg-slate-50 px-4 sm:px-6 py-8">
    <div className="max-w-[1500px] mx-auto space-y-6">
      <header className="flex items-center gap-4"><Link href="/admin/gigsberg" className="text-slate-400 hover:text-slate-600 text-sm">← Gigsberg</Link><h1 className="text-2xl font-extrabold text-slate-900">{city} source coverage</h1></header>
      <section className="bg-green-50 rounded-2xl border border-green-200 p-5"><div className="flex items-center justify-between gap-4 mb-3"><div><h2 className="text-lg font-extrabold text-green-950">Create pages for available Gigsberg events</h2><p className="text-sm text-green-800 mt-1">These events are not linked yet. Create a Showfinder page when Gigsberg has current inventory.</p></div></div><div className="space-y-2">{gbRows.filter(row => !row.matched_event_id && row.inventory_status === 'available').map(row => <div key={`quick-create-${row.id}`} className="flex items-center justify-between gap-4 rounded-xl bg-white border border-green-200 px-4 py-3"><div><p className="font-bold text-slate-900">{row.name}</p><p className="text-sm text-slate-500">{row.event_date} · {row.venue ?? 'Venue unknown'}</p></div><form action={createGigsbergEventAction}><input type="hidden" name="catalogue_id" value={row.id} /><input type="hidden" name="return_to" value={`/admin/gigsberg/coverage?city=${encodeURIComponent(city)}`} /><button type="submit" className="rounded-lg bg-green-700 text-white font-bold px-4 py-2 whitespace-nowrap">Create Showfinder page</button></form></div>)}{gbRows.every(row => row.matched_event_id || row.inventory_status !== 'available') && <p className="text-sm text-green-800">No available unlinked Gigsberg events are waiting for page creation.</p>}</div></section>
      {requestedParams.created ? <div className="rounded-xl px-5 py-4 text-sm font-semibold bg-green-50 border border-green-200 text-green-800">✓ Showfinder page created from the Gigsberg event.</div> : requestedParams.linked ? <div className="rounded-xl px-5 py-4 text-sm font-semibold bg-green-50 border border-green-200 text-green-800">✓ Gigsberg event linked to the Showfinder event.</div> : requestedParams.inventory && <div className={`rounded-xl px-5 py-4 text-sm font-semibold ${requestedParams.inventory === 'available' ? 'bg-green-50 border border-green-200 text-green-800' : 'bg-amber-50 border border-amber-200 text-amber-800'}`}>{requestedParams.inventory === 'available' ? '✓ Inventory found — this Gigsberg event can be linked or highlighted.' : requestedParams.inventory === 'no_inventory' ? 'No current Gigsberg inventory found.' : 'Inventory could not be confirmed.'}</div>}
      <form method="get" className="bg-white rounded-2xl border border-slate-200 p-5 flex gap-3 items-end"><label className="text-sm font-semibold text-slate-600">City<select name="city" defaultValue={city} className="block mt-1 border border-slate-300 rounded-lg px-3 py-2"><option value="">Choose a city</option>{CITIES.map(item => <option key={item.name}>{item.name}</option>)}</select></label><button className="bg-blue-900 text-white font-bold rounded-lg px-5 py-2">View coverage</button></form>
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"><Metric href="#ticketmaster" label="Ticketmaster total" value={ticketmasterCount ?? 0} /><Metric href={`/admin/gigsberg/matches?city=${encodeURIComponent(city)}`} label="Gigsberg catalogue total" value={gigsbergCount ?? 0} /><Metric href={`/admin/gigsberg/matches?city=${encodeURIComponent(city)}&view=matched&filter=both`} label="Both links live" value={bothLinksCount ?? 0} /><Metric href={`/admin/gigsberg/coverage?city=${encodeURIComponent(city)}&source=ticketmaster-only#ticketmaster`} label="Ticketmaster only" value={ticketmasterOnlyCount ?? 0} /><Metric href={`/admin/gigsberg/matches?city=${encodeURIComponent(city)}&view=matched&filter=gigsberg_only`} label="Gigsberg-only pages" value={gigsbergOnlyCount ?? 0} /><Metric href={`/admin/gigsberg/matches?city=${encodeURIComponent(city)}&filter=awaiting`} label="Gigsberg awaiting match/approval" value={gigsbergAwaitingCount ?? 0} /></section>
      <section className="bg-white rounded-2xl border border-slate-200 p-6"><div className="flex items-center justify-between gap-4 mb-4"><div><h2 className="text-lg font-extrabold">Gigsberg events imported from {city}</h2><p className="text-sm text-slate-500 mt-1">Linked rows show the exact Showfinder event. Unlinked rows can be matched manually.</p></div><Link href={`/admin/gigsberg/matches?city=${encodeURIComponent(city)}&filter=awaiting`} className="text-blue-600 font-semibold whitespace-nowrap">Review unlinked →</Link></div><div className="overflow-x-auto"><table className="w-full min-w-[1050px] text-sm"><thead><tr className="border-b text-left"><th className="py-2">Gigsberg event</th><th>Date / venue</th><th>Inventory</th><th>Showfinder link</th><th>Actions</th></tr></thead><tbody>{gbRows.map(row => { const linked = row.matched_event_id ? linkedEventMap.get(row.matched_event_id) : null; return <tr id={`gigsberg-${row.id}`} key={row.id} className="border-b last:border-0 align-top"><td className="py-3 font-semibold">{row.name}</td><td className="text-slate-600">{row.event_date}<br />{row.venue ?? '—'}</td><td><StatusLabel value={row.inventory_status === 'unknown' ? 'Not checked' : row.inventory_status} /></td><td>{linked ? <><StatusLabel value={linked.ticketmaster_id ? 'Both links live' : 'Gigsberg-only page'} /><Link href={`/events/${linked.slug}`} target="_blank" className="block text-blue-600 font-semibold mt-1">{linked.title} →</Link></> : <StatusLabel value="Not linked" />}</td><td className="space-y-1"><a href={row.url} target="_blank" rel="noreferrer" className="block text-blue-600 font-semibold">Open Gigsberg →</a><form action={checkGigsbergInventoryAction}><input type="hidden" name="catalogue_id" value={row.id} /><input type="hidden" name="return_to" value={`/admin/gigsberg/coverage?city=${encodeURIComponent(city)}`} /><input type="hidden" name="return_anchor" value={`gigsberg-${row.id}`} /><button type="submit" className="block text-blue-700 font-bold hover:underline">Check inventory</button></form>{linked ? <Link href={`/events/${linked.slug}`} target="_blank" className="block text-blue-600 font-semibold">Open Showfinder →</Link> : <Link href={`/admin/gigsberg/link?catalogue_id=${row.id}&return_to=${encodeURIComponent(`/admin/gigsberg/coverage?city=${city}`)}`} className="block text-green-700 font-bold">Link existing event →</Link>}</td></tr> })}</tbody></table>{gbRows.length === 0 && <p className="py-8 text-center text-slate-500">No future Gigsberg records currently stored for {city}.</p>}</div></section>
      <section id="ticketmaster" className="bg-white rounded-2xl border border-slate-200 p-6"><div className="flex items-center justify-between gap-4 mb-4"><div><h2 className="text-lg font-extrabold">Ticketmaster events imported from {city}</h2><p className="text-sm text-slate-500 mt-1">These are the same source categories used by the public event pages.</p></div><Link href={`/admin/gigsberg/matches?city=${encodeURIComponent(city)}&filter=awaiting`} className="text-blue-600 font-semibold whitespace-nowrap">Review missing Gigsberg links →</Link></div><div className="overflow-x-auto"><table className="w-full min-w-[1050px] text-sm"><thead><tr className="border-b text-left"><th className="py-2">Ticketmaster event</th><th>Date / venue</th><th>Source status</th><th>Gigsberg link</th></tr></thead><tbody>{visibleTmRows.map(row => <tr key={row.id} className="border-b last:border-0 align-top"><td className="py-3 font-semibold">{row.title}</td><td className="text-slate-600">{new Date(row.start_date).toLocaleDateString('en-GB')}<br />{row.venue_name}</td><td className="text-slate-500">Ticketmaster imported</td><td>{row.gigsberg_affiliate_url ? <><StatusLabel value="Both links live" /><a href={row.gigsberg_affiliate_url} target="_blank" rel="noreferrer" className="block text-blue-600 font-semibold mt-1">Open Gigsberg →</a></> : <><StatusLabel value="Ticketmaster only" /><Link href={`/admin/gigsberg/matches?city=${encodeURIComponent(city)}&filter=awaiting`} className="block text-green-700 font-bold mt-1">Find/link Gigsberg →</Link></>}</td></tr>)}</tbody></table></div></section>
      <section className="bg-white rounded-2xl border border-slate-200 p-6"><div className="mb-4"><h2 className="text-lg font-extrabold">Create pages for unlinked Gigsberg events</h2><p className="text-sm text-slate-500 mt-1">Use this for genuine Gigsberg-only events when no existing Showfinder event should be linked.</p></div><div className="space-y-3">{gbRows.filter(row => !row.matched_event_id).map(row => <div key={`create-${row.id}`} className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 px-4 py-3"><div><p className="font-bold text-slate-900">{row.name}</p><p className="text-sm text-slate-500">{row.event_date} · {row.venue ?? 'Venue unknown'}</p></div><form action={createGigsbergEventAction}><input type="hidden" name="catalogue_id" value={row.id} /><input type="hidden" name="return_to" value={`/admin/gigsberg/coverage?city=${encodeURIComponent(city)}`} /><button type="submit" className="rounded-lg bg-green-700 text-white font-bold px-4 py-2 whitespace-nowrap">Create Showfinder page</button></form></div>)}{gbRows.every(row => row.matched_event_id) && <p className="text-sm text-slate-500">All imported Gigsberg events for this city are already linked.</p>}</div></section>
    </div>
  </main>
}

function Metric({ href, label, value }: { href?: string; label: string; value: number }) { const content = <><p className="text-xs uppercase tracking-wide font-bold text-slate-400">{label}</p><p className="text-3xl font-extrabold text-slate-900 mt-2">{value}</p><p className="text-xs text-blue-600 font-semibold mt-2">View events →</p></>; return href ? <Link href={href} className="block bg-white rounded-2xl border border-slate-200 p-5 hover:border-blue-400 hover:shadow-sm">{content}</Link> : <div className="bg-white rounded-2xl border border-slate-200 p-5">{content}</div> }

function StatusLabel({ value }: { value: string }) {
  const tone = value === 'Both links live' ? 'bg-green-100 text-green-800' : value === 'Not linked' || value === 'Ticketmaster only' || value === 'Not checked' ? 'bg-amber-100 text-amber-800' : value === 'available' ? 'bg-green-100 text-green-800' : value === 'no_inventory' ? 'bg-slate-100 text-slate-600' : 'bg-blue-100 text-blue-800'
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${tone}`}>{value}</span>
}
