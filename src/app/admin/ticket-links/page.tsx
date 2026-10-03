export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { requireAdmin } from '@/lib/admin-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { updateEventTicketLinksFromQueueAction } from '../actions'

interface TicketLinkQueueEvent {
  id: string
  title: string
  slug: string
  start_date: string
  own_ticket_url: string | null
  viagogo_url: string | null
  stubhub_url: string | null
  gigsberg_url: string | null
  venue: { name: string; city: string } | null
}

async function fetchAllUpcomingEvents(db: ReturnType<typeof createAdminClient>) {
  const pageSize = 1000
  const allEvents: TicketLinkQueueEvent[] = []
  let offset = 0

  while (true) {
    const { data, error } = await db
      .from('events')
      .select('id, title, slug, start_date, own_ticket_url, viagogo_url, stubhub_url, gigsberg_url, venue:venues(name, city)')
      .in('status', ['upcoming', 'on_sale', 'sold_out'])
      .gte('start_date', new Date().toISOString())
      .order('start_date', { ascending: true })
      .range(offset, offset + pageSize - 1) as unknown as { data: TicketLinkQueueEvent[] | null; error: { message: string } | null }

    if (error) return { data: null, error }

    const page = data ?? []
    allEvents.push(...page)
    if (page.length < pageSize) break
    offset += pageSize
  }

  return { data: allEvents, error: null }
}

export default async function TicketLinksPage({ searchParams }: { searchParams: Promise<{ saved?: string; q?: string }> }) {
  await requireAdmin()
  const { saved, q } = await searchParams
  const db = createAdminClient()

  const { data: events, error } = await fetchAllUpcomingEvents(db)

  const rows = events ?? []
  const query = q?.trim() ?? ''
  const normalizedQuery = query.toLocaleLowerCase()
  const filteredRows = normalizedQuery
    ? rows.filter(event => [
      event.title,
      event.venue?.name,
      event.venue?.city,
    ].some(value => value?.toLocaleLowerCase().includes(normalizedQuery)))
    : rows

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center gap-4">
        <Link href="/admin" className="text-slate-400 hover:text-slate-600 text-sm">← Admin</Link>
        <h1 className="text-xl font-extrabold text-slate-900">Ticket Links</h1>
        <span className="text-slate-400 text-sm">{rows.length} upcoming events</span>
      </header>

      <main className="max-w-[1500px] mx-auto px-4 sm:px-6 py-8 space-y-6">
        {saved && <div className="bg-green-50 border border-green-200 text-green-800 rounded-xl px-5 py-3 text-sm font-semibold">✓ Ticket links saved</div>}
        <section className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4">
          <div>
            <h2 className="text-lg font-extrabold text-slate-900">Exact event listings</h2>
            <p className="text-sm text-slate-500 mt-1">
              Paste only the listing for the matching artist, venue and date. Generic searches and provider homepages are not accepted as event links.
            </p>
          </div>
          <form method="get" className="flex flex-col sm:flex-row gap-2">
            <input
              name="q"
              defaultValue={query}
              placeholder="Search artist, event, venue or city"
              aria-label="Search artist, event, venue or city"
              className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button type="submit" className="font-bold text-white px-5 py-2 rounded-lg text-sm hover:opacity-90" style={{ backgroundColor: '#1E3A8A' }}>
              Search
            </button>
            {query && <Link href="/admin/ticket-links" className="text-center border border-slate-300 text-slate-600 font-semibold px-5 py-2 rounded-lg text-sm hover:bg-slate-50">Clear</Link>}
          </form>
          {query && <p className="text-xs text-slate-500">Showing {filteredRows.length} of {rows.length} upcoming events</p>}
        </section>

        {error ? (
          <div className="bg-red-50 border border-red-200 text-red-800 rounded-xl p-6">Unable to load ticket links: {error.message}</div>
        ) : rows.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-500">No upcoming events need ticket links.</div>
        ) : filteredRows.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-500">No events match “{query}”.</div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-x-auto">
            <table className="w-full min-w-[1100px] text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50 text-left">
                  <th className="px-4 py-3 font-semibold text-slate-600">Event</th>
                  <th className="px-4 py-3 font-semibold text-slate-600">Date / venue</th>
                  <th className="px-4 py-3 font-semibold text-slate-600">Your listing</th>
                  <th className="px-4 py-3 font-semibold text-slate-600">Viagogo</th>
                  <th className="px-4 py-3 font-semibold text-slate-600">StubHub</th>
                  <th className="px-4 py-3 font-semibold text-slate-600">Gigsberg</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {filteredRows.map(event => {
                  const updateAction = updateEventTicketLinksFromQueueAction.bind(null, event.id)
                  return (
                    <tr key={event.id} className="border-b border-slate-100 last:border-0 align-top">
                      <td className="px-4 py-4 min-w-[250px]">
                        <Link href={`/admin/events/${event.slug}`} className="font-bold text-slate-900 hover:text-blue-600 hover:underline">{event.title}</Link>
                        <p className="text-xs text-slate-400 mt-1">View event →</p>
                      </td>
                      <td className="px-4 py-4 text-slate-600 whitespace-nowrap">
                        <p>{new Date(event.start_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                        <p className="text-xs text-slate-400 mt-1">{event.venue ? `${event.venue.name}, ${event.venue.city}` : 'Venue unknown'}</p>
                      </td>
                      {(['own_ticket_url', 'viagogo_url', 'stubhub_url', 'gigsberg_url'] as const).map(name => (
                        <td key={name} className="px-4 py-4 min-w-[210px]">
                          <input
                            name={name}
                            form={`ticket-links-${event.id}`}
                            type="url"
                            defaultValue={event[name] ?? ''}
                            placeholder="Exact event URL"
                            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </td>
                      ))}
                      <td className="px-4 py-4 whitespace-nowrap">
                        <form id={`ticket-links-${event.id}`} action={updateAction}>
                          <button type="submit" className="font-bold text-white px-4 py-2 rounded-lg text-xs hover:opacity-90" style={{ backgroundColor: '#E8003D' }}>Save</button>
                        </form>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  )
}
