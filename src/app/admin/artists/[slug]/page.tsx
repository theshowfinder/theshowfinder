export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireAdmin } from '@/lib/admin-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { updateArtistAction, addTourDateAction, deleteTourDateAction } from '../../actions'
import type { Artist, Tour, TourDate } from '@/lib/types/database'

interface PageProps {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ saved?: string }>
}

export default async function EditArtistPage({ params, searchParams }: PageProps) {
  await requireAdmin()
  const { slug } = await params
  const { saved } = await searchParams
  const db = createAdminClient()

  const { data: artist } = await db
    .from('artists')
    .select('*')
    .eq('slug', slug)
    .single() as unknown as { data: Artist | null }

  if (!artist) notFound()

  const { data: tours } = await db
    .from('tours')
    .select('*')
    .eq('artist_id', artist.id)
    .order('created_at', { ascending: false })
    .limit(1) as unknown as { data: Tour[] | null }

  const tour = tours?.[0] ?? null

  const { data: tourDates } = tour
    ? await db
        .from('tour_dates')
        .select('*')
        .eq('tour_id', tour.id)
        .order('date', { ascending: true }) as unknown as { data: TourDate[] | null }
    : { data: [] as TourDate[] }

  const dates = tourDates ?? []

  const onsaleLocal = artist.onsale_date
    ? new Date(artist.onsale_date).toISOString().slice(0, 16)
    : ''

  const updateAction = updateArtistAction.bind(null, artist.id)
  const addDateAction = tour ? addTourDateAction.bind(null, tour.id, slug) : null

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center gap-4">
        <Link href="/admin" className="text-slate-400 hover:text-slate-600 text-sm">← Admin</Link>
        <h1 className="text-xl font-extrabold text-slate-900">{artist.name}</h1>
        <Link href={`/artists/${slug}`} className="text-slate-400 hover:text-slate-600 text-sm ml-auto">
          View page →
        </Link>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-10 space-y-8">
        {saved && (
          <div className="bg-green-50 border border-green-200 text-green-800 rounded-xl px-5 py-3 text-sm font-semibold">
            ✓ Artist saved successfully
          </div>
        )}

        {/* Edit form */}
        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <h2 className="text-lg font-extrabold text-slate-900 mb-5">Artist Details</h2>
          <form action={updateAction} className="space-y-5">
            <div className="grid grid-cols-2 gap-5">
              <div className="col-span-2">
                <label className="block text-sm font-semibold text-slate-700 mb-1">Artist Name *</label>
                <input name="name" required defaultValue={artist.name} className="w-full border border-slate-300 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>

              <div className="col-span-2">
                <label className="block text-sm font-semibold text-slate-700 mb-1">Slug</label>
                <input name="slug" defaultValue={artist.slug} className="w-full border border-slate-300 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>

              <div className="col-span-2">
                <label className="block text-sm font-semibold text-slate-700 mb-1">Image URL</label>
                <input name="image_url" type="url" defaultValue={artist.image_url ?? ''} className="w-full border border-slate-300 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>

              <div className="col-span-2">
                <label className="block text-sm font-semibold text-slate-700 mb-1">Description</label>
                <textarea name="description" rows={3} defaultValue={artist.description ?? ''} className="w-full border border-slate-300 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
              </div>

              <div className="col-span-2">
                <label className="block text-sm font-semibold text-slate-700 mb-1">Tour Name</label>
                <input name="tour_name" defaultValue={artist.tour_name ?? ''} className="w-full border border-slate-300 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">On Sale Date / Time</label>
                <input name="onsale_date" type="datetime-local" defaultValue={onsaleLocal} className="w-full border border-slate-300 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Tickets URL</label>
                <input name="tickets_url" type="url" defaultValue={artist.tickets_url ?? ''} className="w-full border border-slate-300 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>

              <div className="col-span-2 flex items-center gap-3">
                <input type="checkbox" name="is_featured" id="is_featured" defaultChecked={artist.is_featured} className="w-4 h-4 accent-blue-600" />
                <label htmlFor="is_featured" className="text-sm font-semibold text-slate-700">
                  Feature on homepage On Sale This Week section
                </label>
              </div>
            </div>

            <button
              type="submit"
              className="font-bold text-white px-6 py-2.5 rounded-xl hover:opacity-90 transition-opacity"
              style={{ backgroundColor: '#E8003D' }}
            >
              Save Changes
            </button>
          </form>
        </section>

        {/* Tour dates */}
        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <h2 className="text-lg font-extrabold text-slate-900 mb-5">
            Tour Dates {tour && <span className="text-sm font-normal text-slate-400 ml-2">({tour.tour_name})</span>}
          </h2>

          {!tour && (
            <p className="text-slate-400 text-sm mb-4">Save a tour name above to enable date management.</p>
          )}

          {dates.length > 0 && (
            <div className="space-y-2 mb-6">
              {dates.map(d => (
                <div key={d.id} className="flex items-center gap-4 bg-slate-50 rounded-xl px-4 py-3">
                  <div className="flex-1">
                    <p className="font-semibold text-slate-900 text-sm">
                      {new Date(d.date).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
                      {' '}· {new Date(d.date).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                    <p className="text-slate-500 text-sm">{d.venue_name}, {d.city}</p>
                  </div>
                  <form action={deleteTourDateAction.bind(null, d.id, slug)}>
                    <button type="submit" className="text-red-500 hover:text-red-700 text-sm font-semibold">
                      Remove
                    </button>
                  </form>
                </div>
              ))}
            </div>
          )}

          {addDateAction && (
            <form action={addDateAction} className="border-t border-slate-100 pt-5 space-y-4">
              <h3 className="text-sm font-bold text-slate-700">Add Date</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Date</label>
                  <input name="date" type="date" required className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Time (optional, 19:00 default)</label>
                  <input name="time" type="time" placeholder="19:00" className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Venue</label>
                  <input name="venue_name" required placeholder="e.g. O2 Arena" className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">City</label>
                  <input name="city" required placeholder="e.g. London" className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>
              <button
                type="submit"
                className="font-bold text-white px-5 py-2 rounded-lg text-sm hover:opacity-90 transition-opacity"
                style={{ backgroundColor: '#026CDF' }}
              >
                + Add Date
              </button>
            </form>
          )}
        </section>
      </main>
    </div>
  )
}
