export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { requireAdmin } from '@/lib/admin-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Subscriber } from '@/lib/types/database'

function fmtDate(value: string): string {
  return new Date(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

// Phase 5A, requirement 1: "Admin visibility of subscriber counts/status."
// Read-only by design — nothing on this page sends an email to anyone;
// that only ever happens from the admin newsletter workflow, and only
// after an explicit confirm (requirement 1's "no email sending without
// explicit admin action").
export default async function AdminSubscribersPage() {
  await requireAdmin()
  const db = createAdminClient()

  const [totalResult, activeResult, recentResult] = await Promise.all([
    db.from('subscribers').select('*', { count: 'exact', head: true }) as unknown as Promise<{ count: number | null }>,
    db.from('subscribers').select('*', { count: 'exact', head: true }).is('unsubscribed_at', null) as unknown as Promise<{ count: number | null }>,
    db.from('subscribers').select('*').order('created_at', { ascending: false }).limit(100) as unknown as Promise<{ data: Subscriber[] | null }>,
  ])

  const total = totalResult.count ?? 0
  const active = activeResult.count ?? 0
  const unsubscribed = total - active
  const recent = recentResult.data ?? []

  // City breakdown — only among active subscribers, since an unsubscribed
  // row's city tag no longer describes anyone TheShowFinder can actually
  // reach for city-targeted sends.
  const cityCounts = new Map<string, number>()
  for (const row of recent) {
    if (row.unsubscribed_at) continue
    const key = row.city ?? 'No city tag'
    cityCounts.set(key, (cityCounts.get(key) ?? 0) + 1)
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center gap-4 flex-wrap">
        <Link href="/admin" className="text-slate-400 hover:text-slate-600 text-sm">← Admin</Link>
        <h1 className="text-xl font-extrabold text-slate-900">Subscribers</h1>
        <Link
          href="/admin/newsletter"
          className="inline-block font-bold text-white px-5 py-2.5 rounded-xl hover:opacity-90 transition-opacity text-sm ml-auto"
          style={{ backgroundColor: '#E8003D' }}
        >
          Newsletter →
        </Link>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-10 space-y-8">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Total ever signed up</p>
            <p className="text-3xl font-extrabold text-slate-900">{total.toLocaleString('en-GB')}</p>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Active (will receive mail)</p>
            <p className="text-3xl font-extrabold text-green-600">{active.toLocaleString('en-GB')}</p>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Unsubscribed</p>
            <p className="text-3xl font-extrabold text-slate-400">{unsubscribed.toLocaleString('en-GB')}</p>
          </div>
        </div>

        {cityCounts.size > 0 && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-3">
              City tags (last {recent.length} signups)
            </h2>
            <div className="flex flex-wrap gap-2">
              {[...cityCounts.entries()].sort((a, b) => b[1] - a[1]).map(([city, count]) => (
                <span key={city} className="text-xs font-semibold px-3 py-1.5 rounded-full bg-slate-100 text-slate-600">
                  {city} · {count}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden overflow-x-auto">
          <div className="px-6 py-4 border-b border-slate-100">
            <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wider">Most recent {recent.length} signups</h2>
          </div>
          {recent.length === 0 ? (
            <p className="text-slate-400 text-sm px-6 py-8 text-center">No subscribers yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50 text-left">
                  <th className="px-4 py-3 font-semibold text-slate-600">Email</th>
                  <th className="px-4 py-3 font-semibold text-slate-600">City</th>
                  <th className="px-4 py-3 font-semibold text-slate-600">Signed up</th>
                  <th className="px-4 py-3 font-semibold text-slate-600">Status</th>
                </tr>
              </thead>
              <tbody>
                {recent.map(row => (
                  <tr key={row.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-4 py-3 text-slate-700">{row.email}</td>
                    <td className="px-4 py-3 text-slate-500">{row.city ?? '—'}</td>
                    <td className="px-4 py-3 text-slate-500">{fmtDate(row.created_at)}</td>
                    <td className="px-4 py-3">
                      {row.unsubscribed_at ? (
                        <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-slate-100 text-slate-500">
                          Unsubscribed {fmtDate(row.unsubscribed_at)}
                        </span>
                      ) : (
                        <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-green-100 text-green-700">Active</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </main>
    </div>
  )
}
