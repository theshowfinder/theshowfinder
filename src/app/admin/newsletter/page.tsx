export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { requireAdmin } from '@/lib/admin-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { createNewsletterAction } from './actions'
import type { Newsletter } from '@/lib/types/database'

function fmtDateTime(value: string): string {
  return new Date(value).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default async function AdminNewsletterListPage() {
  await requireAdmin()
  const db = createAdminClient()

  const { data: newsletters } = await db
    .from('newsletters')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100) as unknown as { data: Newsletter[] | null }

  const rows = newsletters ?? []

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center gap-4 flex-wrap">
        <Link href="/admin" className="text-slate-400 hover:text-slate-600 text-sm">← Admin</Link>
        <h1 className="text-xl font-extrabold text-slate-900">Newsletter</h1>
        <Link
          href="/admin/subscribers"
          className="text-sm text-slate-400 hover:text-slate-600 ml-2"
        >
          Subscribers →
        </Link>
        <form action={createNewsletterAction} className="ml-auto">
          <button
            type="submit"
            className="inline-block font-bold text-white px-5 py-2.5 rounded-xl hover:opacity-90 transition-opacity text-sm"
            style={{ backgroundColor: '#E8003D' }}
          >
            + New newsletter
          </button>
        </form>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-10">
        <p className="text-sm text-slate-500 mb-6">
          Built from approved or published news only — nothing is ever sent automatically. Drafts stay editable until
          sent; a sent newsletter is locked, showing exactly what went out and when.
        </p>

        {rows.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
            <p className="text-slate-400 text-4xl mb-3">📧</p>
            <p className="text-slate-500 mb-4">No newsletters yet.</p>
            <form action={createNewsletterAction}>
              <button type="submit" className="text-blue-600 font-semibold hover:underline">Start the first one →</button>
            </form>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50 text-left">
                  <th className="px-4 py-3 font-semibold text-slate-600">Subject</th>
                  <th className="px-4 py-3 font-semibold text-slate-600">Articles</th>
                  <th className="px-4 py-3 font-semibold text-slate-600">Status</th>
                  <th className="px-4 py-3 font-semibold text-slate-600">Created</th>
                  <th className="px-4 py-3 font-semibold text-slate-600">Sent</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(row => (
                  <tr key={row.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <Link href={`/admin/newsletter/${row.id}`} className="font-semibold text-slate-900 hover:underline">
                        {row.subject || <span className="text-slate-400 italic">(untitled draft)</span>}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-slate-500">{row.article_ids.length}</td>
                    <td className="px-4 py-3">
                      {row.status === 'sent' ? (
                        <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-green-100 text-green-700">Sent</span>
                      ) : (
                        <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-amber-100 text-amber-700">Draft</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-500">{fmtDateTime(row.created_at)}</td>
                    <td className="px-4 py-3 text-slate-500">
                      {row.sent_at ? `${fmtDateTime(row.sent_at)} · ${row.sent_count ?? 0} recipients` : '—'}
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
