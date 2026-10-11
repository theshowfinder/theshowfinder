export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { requireAdmin } from '@/lib/admin-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { linkSeeTicketsToExistingEventAction } from '@/app/admin/gigsberg/actions'

export default async function SeeTicketsLinkPage({ searchParams }: { searchParams: Promise<{ catalogue_id?: string; q?: string; return_to?: string }> }) {
  await requireAdmin()
  const params = await searchParams
  const catalogueId = String(params.catalogue_id ?? '')
  const db = createAdminClient()
  const { data: catalogue, error } = await db.from('see_tickets_catalogue_events')
    .select('id, name, event_date, venue, city, primary_artist, second_artist, url')
    .eq('id', catalogueId)
    .single()
  const query = (params.q || catalogue?.primary_artist || catalogue?.name || '').trim()
  let eventsQuery = db.from('events_with_venue').select('id, title, start_date, venue_name, venue_city, slug').gte('start_date', new Date().toISOString()).order('start_date', { ascending: true }).limit(50)
  if (query) eventsQuery = eventsQuery.ilike('title', `%${query}%`)
  const { data: events } = await eventsQuery

  return <div className="min-h-screen bg-slate-50"><header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center gap-4"><Link href="/admin/see-tickets" className="text-slate-400">← See Tickets inventory</Link><h1 className="text-xl font-extrabold text-slate-900">Link See Tickets event</h1></header><main className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-6">
    {error || !catalogue ? <p className="bg-red-50 border border-red-200 text-red-800 rounded-xl p-5">See Tickets record not found.</p> : <><section className="bg-white rounded-2xl border border-slate-200 p-6"><p className="text-xs uppercase tracking-wide font-bold text-slate-400">See Tickets event</p><h2 className="text-2xl font-extrabold text-slate-900 mt-2">{catalogue.name}</h2><p className="text-slate-600 mt-2">{catalogue.event_date} · {catalogue.venue || 'Venue unknown'}, {catalogue.city || 'UK'}</p><a href={catalogue.url} target="_blank" rel="noreferrer" className="inline-block text-blue-600 font-semibold mt-3">Open See Tickets listing →</a></section><section className="bg-white rounded-2xl border border-slate-200 overflow-hidden"><div className="p-6 border-b border-slate-100"><h2 className="font-extrabold text-slate-900">Choose the Showfinder event</h2><form method="get" className="flex gap-2 mt-4"><input type="hidden" name="catalogue_id" value={catalogue.id} />{params.return_to && <input type="hidden" name="return_to" value={params.return_to} />}<input name="q" defaultValue={query} className="flex-1 border border-slate-300 rounded-lg px-3 py-2" placeholder="Search event title" /><button className="bg-blue-700 text-white font-bold rounded-lg px-5">Search</button></form></div><div className="divide-y divide-slate-100">{(events ?? []).map(event => <div key={event.id} className="p-5 flex items-center justify-between gap-4"><div><p className="font-bold text-slate-900">{event.title}</p><p className="text-sm text-slate-500">{new Date(event.start_date).toLocaleDateString('en-GB')} · {event.venue_name || 'Venue unknown'}, {event.venue_city || 'UK'}</p><Link href={`/events/${event.slug}`} target="_blank" className="text-blue-600 text-sm font-semibold">Open event page →</Link></div><form action={linkSeeTicketsToExistingEventAction}><input type="hidden" name="catalogue_id" value={catalogue.id} /><input type="hidden" name="event_id" value={event.id} />{params.return_to && <input type="hidden" name="return_to" value={params.return_to} />}<button className="rounded-lg bg-green-700 text-white font-bold px-4 py-2 whitespace-nowrap">Link this event</button></form></div>)}{!events?.length && <p className="p-8 text-center text-slate-500">No future Showfinder events matched that title.</p>}</div></section></>}
  </main></div>
}
