export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { requireAdmin } from '@/lib/admin-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { logoutAction, toggleFeaturedAction, toggleFeaturedOnsaleAction } from './actions'
import type { Artist } from '@/lib/types/database'

export default async function AdminPage() {
  await requireAdmin()
  const db = createAdminClient()

  const { data: artists } = await db
    .from('artists')
    .select('*')
    .order('name', { ascending: true }) as unknown as { data: Artist[] | null }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
        <h1 className="text-xl font-extrabold text-slate-900">TheShowFinder Admin</h1>
        <div className="flex items-center gap-4">
          <Link
            href="/"
            className="text-sm text-slate-500 hover:text-slate-700"
          >
            View site
          </Link>
          <form action={logoutAction}>
            <button type="submit" className="text-sm font-semibold text-red-600 hover:text-red-700">
              Sign out
            </button>
          </form>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-10 space-y-8">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-extrabold text-slate-900">Artists</h2>
          <Link
            href="/admin/artists/new"
            className="inline-block font-bold text-white px-5 py-2.5 rounded-xl hover:opacity-90 transition-opacity text-sm"
            style={{ backgroundColor: '#E8003D' }}
          >
            + Add Artist
          </Link>
        </div>

        {(!artists || artists.length === 0) ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
            <p className="text-slate-400 text-4xl mb-3">🎤</p>
            <p className="text-slate-500 mb-4">No artists yet.</p>
            <Link href="/admin/artists/new" className="text-blue-600 font-semibold hover:underline">
              Add the first one →
            </Link>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50 text-left">
                  <th className="px-4 py-3 font-semibold text-slate-600">Artist</th>
                  <th className="px-4 py-3 font-semibold text-slate-600">Tour</th>
                  <th className="px-4 py-3 font-semibold text-slate-600">On Sale</th>
                  <th className="px-4 py-3 font-semibold text-slate-600">Featured</th>
                  <th className="px-4 py-3 font-semibold text-slate-600">On Sale This Week</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {artists.map(artist => (
                  <tr key={artist.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        {artist.image_url && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={artist.image_url} alt={artist.name} className="w-10 h-10 rounded-lg object-cover object-top" />
                        )}
                        <div>
                          <p className="font-bold text-slate-900">{artist.name}</p>
                          <p className="text-slate-400 text-xs">/artists/{artist.slug}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{artist.tour_name ?? '—'}</td>
                    <td className="px-4 py-3 text-slate-600">
                      {artist.onsale_date
                        ? new Date(artist.onsale_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' })
                        : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <form action={toggleFeaturedAction.bind(null, artist.id, !artist.is_featured)}>
                        <button
                          type="submit"
                          className={`text-xs font-bold px-3 py-1 rounded-full ${artist.is_featured ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500'}`}
                        >
                          {artist.is_featured ? '★ Featured' : '☆ Feature'}
                        </button>
                      </form>
                    </td>
                    <td className="px-4 py-3">
                      <form action={toggleFeaturedOnsaleAction.bind(null, artist.id, !artist.featured_onsale)}>
                        <button
                          type="submit"
                          className={`text-xs font-bold px-3 py-1 rounded-full ${artist.featured_onsale ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}
                        >
                          {artist.featured_onsale ? '🎟 On Sale' : '+ On Sale'}
                        </button>
                      </form>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/admin/artists/${artist.slug}`}
                        className="text-blue-600 font-semibold hover:underline"
                      >
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
