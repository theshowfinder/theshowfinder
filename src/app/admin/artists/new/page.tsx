import Link from 'next/link'
import { requireAdmin } from '@/lib/admin-auth'
import { createArtistAction } from '../../actions'

export default async function NewArtistPage() {
  await requireAdmin()

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center gap-4">
        <Link href="/admin" className="text-slate-400 hover:text-slate-600 text-sm">← Admin</Link>
        <h1 className="text-xl font-extrabold text-slate-900">Add Artist</h1>
      </header>

      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-10">
        <form action={createArtistAction} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-5">
          <div className="grid grid-cols-2 gap-5">
            <div className="col-span-2">
              <label className="block text-sm font-semibold text-slate-700 mb-1">Artist Name *</label>
              <input name="name" required className="w-full border border-slate-300 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>

            <div className="col-span-2">
              <label className="block text-sm font-semibold text-slate-700 mb-1">Slug (auto-generated if blank)</label>
              <input name="slug" placeholder="e.g. donny-osmond" className="w-full border border-slate-300 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>

            <div className="col-span-2">
              <label className="block text-sm font-semibold text-slate-700 mb-1">Image URL</label>
              <input name="image_url" type="url" placeholder="https://..." className="w-full border border-slate-300 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>

            <div className="col-span-2">
              <label className="block text-sm font-semibold text-slate-700 mb-1">Description</label>
              <textarea name="description" rows={3} className="w-full border border-slate-300 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
            </div>

            <div className="col-span-2">
              <label className="block text-sm font-semibold text-slate-700 mb-1">Tour Name</label>
              <input name="tour_name" placeholder="e.g. The Great Aloha Tour" className="w-full border border-slate-300 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">On Sale Date / Time</label>
              <input name="onsale_date" type="datetime-local" className="w-full border border-slate-300 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Tickets URL</label>
              <input name="tickets_url" type="url" placeholder="https://..." className="w-full border border-slate-300 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>

            <div className="col-span-2 flex items-center gap-3">
              <input type="checkbox" name="is_featured" id="is_featured" className="w-4 h-4 accent-blue-600" />
              <label htmlFor="is_featured" className="text-sm font-semibold text-slate-700">
                Feature on homepage On Sale This Week section
              </label>
            </div>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <button
              type="submit"
              className="font-bold text-white px-6 py-2.5 rounded-xl hover:opacity-90 transition-opacity"
              style={{ backgroundColor: '#E8003D' }}
            >
              Create Artist
            </button>
            <Link href="/admin" className="text-sm text-slate-500 hover:text-slate-700">Cancel</Link>
          </div>
        </form>
      </main>
    </div>
  )
}
