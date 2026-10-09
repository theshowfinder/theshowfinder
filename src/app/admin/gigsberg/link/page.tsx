export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { requireAdmin } from '@/lib/admin-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { linkGigsbergToExistingEventAction } from '../actions'

type CatalogueRow = {
  id: number
  name: string
  event_date: string
  venue: string | null
  city: string | null
}

type EventRow = {
  id: string
  title: string
  slug: string
  start_date: string
  venue: { name: string; city: string } | null
}

export default async function LinkGigsbergEventPage({ searchParams }: { searchParams: Promise<{ catalogue_id?: string; q?: string }> }) {
  await requireAdmin()
  const params = await searchParams
  const catalogueId = Number(params.catalogue_id)
  const db = createAdminClient()

  const { data: catalogue } = await db
    .from('gigsberg_catalogue_events')
    .select('id, name, event_date, venue, city')
    .eq('id', catalogueId)
    .maybeSingle() as unknown as { data: CatalogueRow | null }

  if (!catalogue) {
    return <main className="min-h-screen bg-slate-50 p-8"><div className="max-w-3xl mx-auto bg-white rounded-2xl border border-slate-200 p-8">Catalogue event not found.</div></main>
  }

  const query = (params.q ?? catalogue.name).trim()
  const { data: events } = await db
    .from('events')
    .select('id, title, slug, start_date, venue:venues(name, city)')
    .gte('start_date', new Date().toISOString())
    .ilike('title', `%${query}%`)
    .order('start_date', { ascending: true })
    .limit(50) as unknown as { data: EventRow[] | null }

  return (
    <main className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center gap-4">
        <Link href="/admin/gigsberg/matches" className="text-slate-400 hover:text-slate-600 text-sm">← Matches</Link>
        <h1 className="text-xl font-extrabold text-slate-900">Link existing Showfinder event</h1>
      </header>
      <section className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        <div className="bg-white rounded-2xl border border-slate-200 p-6 mb-6">
          <p className="text-sm text-slate-500">Gigsberg event</p>
          <h2 className="text-2xl font-extrabold text-slate-900 mt-1">{catalogue.name}</h2>
          <p className="text-slate-600 mt-2">{new Date(catalogue.event_date).toLocaleDateString('en-GB')} · {catalogue.venue ?? 'Venue unknown'}, {catalogue.city ?? 'City unknown'}</p>
          <form className="flex gap-3 mt-6">
            <input type="hidden" name="catalogue_id" value={catalogue.id} />
            <input name="q" defaultValue={query} className="flex-1 rounded-lg border border-slate-300 px-4 py-2" placeholder="Search Showfinder event title" />
            <button className="rounded-lg bg-blue-700 text-white font-bold px-5 py-2">Search</button>
          </form>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100"><h2 className="font-extrabold text-slate-900">Existing events matching “{query}”</h2></div>
          {!events?.length ? <p className="p-6 text-slate-500">No matching future event was found. Try a shorter artist name or search term.</p> : <div className="divide-y divide-slate-100">
            {events.map(event => <div key={event.id} className="p-6 flex items-center justify-between gap-5">
              <div><p className="font-bold text-slate-900">{event.title}</p><p className="text-sm text-slate-500 mt-1">{new Date(event.start_date).toLocaleDateString('en-GB')} · {event.venue?.name ?? 'Venue unknown'}, {event.venue?.city ?? 'City unknown'}</p><Link href={`/events/${event.slug}`} target="_blank" className="text-blue-600 text-sm font-semibold hover:underline">Open event page →</Link></div>
              <form action={linkGigsbergToExistingEventAction}><input type="hidden" name="catalogue_id" value={catalogue.id} /><input type="hidden" name="event_id" value={event.id} /><button className="rounded-lg bg-green-700 text-white font-bold px-4 py-2 whitespace-nowrap">Link this event</button></form>
            </div>)}
          </div>}
        </div>
      </section>
    </main>
  )
}
