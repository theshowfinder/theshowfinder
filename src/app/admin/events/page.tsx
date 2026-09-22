export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { requireAdmin } from '@/lib/admin-auth'
import { createAdminClient } from '@/lib/supabase/admin'

interface EventRow {
  id: string
  title: string
  slug: string
  start_date: string
  own_ticket_url: string | null
  venue: { name: string; city: string } | null
}

export default async function AdminEventsPage() {
  await requireAdmin()
  const db = createAdminClient()

  const { data: events } = await db
    .from('events')
    .select('id, title, slug, start_date, own_ticket_url, venue:venues(name, city)')
    .gte('start_date', new Date().toISOString())
    .order('start_date', { ascending: true })
    .limit(200) as unknown as { data: EventRow[] | null }

  const rows = events ?? []

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center gap-4">
        <Link href="/admin" className="text-slate-400 hover:text-slate-600 text-sm">← Admin</Link>
        <h1 className="text-xl font-extrabold text-slate-900">Events</h1>
        <span className="text-slate-400 text-sm ml-auto">{rows.length} upcoming</span>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-10">
        {rows.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
            <p className="text-slate-400 text-4xl mb-3">🎫</p>
            <p className="text-slate-500">No upcoming events synced yet.</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50 text-left">
                  <th className="px-4 py-3 font-semibold text-slate-600">Event</th>
                  <th className="px-4 py-3 font-semibold text-slate-600">Date</th>
                  <th className="px-4 py-3 font-semibold text-slate-600">Venue</th>
                  <th className="px-4 py-3 font-semibold text-slate-600">Own tickets</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {rows.map(event => (
                  <tr key={event.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <p className="font-bold text-slate-900">{event.title}</p>
                      <p className="text-slate-400 text-xs">/events/{event.slug}</p>
                    </td>
                    <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                      {new Date(event.start_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' })}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {event.venue ? `${event.venue.name}, ${event.venue.city}` : '—'}
                    </td>
                    <td className="px-4 py-3">
                      {event.own_ticket_url ? (
                        <span className="text-xs font-bold px-3 py-1 rounded-full bg-green-100 text-green-700">Set</span>
                      ) : (
                        <span className="text-xs font-bold px-3 py-1 rounded-full bg-slate-100 text-slate-500">Not set</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link href={`/admin/events/${event.slug}`} className="text-blue-600 font-semibold hover:underline">
                        Edit
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  )
}
