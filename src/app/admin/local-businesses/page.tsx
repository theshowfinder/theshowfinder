export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { requireAdmin } from '@/lib/admin-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { deleteLocalBusinessAction } from '../actions'
import type { LocalBusiness } from '@/lib/types/database'

export default async function LocalBusinessesAdminPage() {
  await requireAdmin()
  const db = createAdminClient()

  const { data: businesses } = await db
    .from('local_businesses')
    .select('*')
    .order('city', { ascending: true })
    .order('display_order', { ascending: true }) as unknown as { data: LocalBusiness[] | null }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/admin" className="text-slate-400 hover:text-slate-600 text-sm">← Admin</Link>
          <h1 className="text-xl font-extrabold text-slate-900">Local Businesses</h1>
        </div>
        <Link
          href="/admin/local-businesses/new"
          className="inline-block font-bold text-white px-5 py-2.5 rounded-xl hover:opacity-90 transition-opacity text-sm"
          style={{ backgroundColor: '#E8003D' }}
        >
          + Add Business
        </Link>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-10">
        <p className="text-sm text-slate-500 mb-6">
          Shown in the &ldquo;Where to Eat &amp; Drink&rdquo; section on each city page. Sponsored listings always sort first.
        </p>

        {(!businesses || businesses.length === 0) ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
            <p className="text-slate-400 text-4xl mb-3">🏪</p>
            <p className="text-slate-500 mb-4">No local businesses yet.</p>
            <Link href="/admin/local-businesses/new" className="text-blue-600 font-semibold hover:underline">
              Add the first one →
            </Link>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50 text-left">
                  <th className="px-4 py-3 font-semibold text-slate-600">Business</th>
                  <th className="px-4 py-3 font-semibold text-slate-600">City</th>
                  <th className="px-4 py-3 font-semibold text-slate-600">Category</th>
                  <th className="px-4 py-3 font-semibold text-slate-600">Tags</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {businesses.map(biz => (
                  <tr key={biz.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <p className="font-bold text-slate-900">{biz.name}</p>
                      {biz.website_url && <p className="text-slate-400 text-xs truncate max-w-xs">{biz.website_url}</p>}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{biz.city}</td>
                    <td className="px-4 py-3 text-slate-600 capitalize">{biz.category}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1.5">
                        {biz.is_sponsored && (
                          <span className="text-xs font-bold px-2 py-0.5 rounded-full text-white" style={{ backgroundColor: '#E8003D' }}>Sponsored</span>
                        )}
                        {biz.is_lusso_client && (
                          <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">Lusso</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <form action={deleteLocalBusinessAction.bind(null, biz.id, biz.city)}>
                        <button type="submit" className="text-red-600 font-semibold hover:underline text-xs">
                          Delete
                        </button>
                      </form>
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
