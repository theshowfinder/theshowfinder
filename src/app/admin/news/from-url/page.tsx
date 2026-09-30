export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { requireAdmin } from '@/lib/admin-auth'
import { createNewsCandidateFromUrlAction } from '../../actions'

interface PageProps {
  searchParams: Promise<{ error?: string; url?: string }>
}

export default async function AddFromUrlPage({ searchParams }: PageProps) {
  await requireAdmin()
  const { error, url } = await searchParams

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center gap-4">
        <Link href="/admin/news" className="text-slate-400 hover:text-slate-600 text-sm">← News Inbox</Link>
        <h1 className="text-xl font-extrabold text-slate-900">Add from URL</h1>
      </header>

      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        <p className="text-sm text-slate-500">
          Paste a trusted article URL. TheShowFinder fetches the page, extracts what it can, and (if configured) asks Claude to
          suggest headline, scope, cities, category and priority for you to review and edit — nothing is ever published
          automatically. This is the same duplicate check as the manual form: a URL already queued or already live will be
          rejected with a clear message before anything is created.
        </p>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-800 rounded-xl px-5 py-3 text-sm font-semibold">
            ⚠ {error}
          </div>
        )}

        <form action={createNewsCandidateFromUrlAction} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Article URL *</label>
            <input
              name="url"
              type="url"
              required
              defaultValue={url}
              placeholder="https://example.com/some-article"
              autoFocus
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            />
            <p className="text-xs text-slate-400 mt-1">
              Only public http(s) pages can be fetched — local/internal addresses are rejected automatically.
            </p>
          </div>

          <div className="flex items-center gap-4">
            <button
              type="submit"
              className="font-bold text-white px-8 py-3 rounded-xl hover:opacity-90 transition-opacity text-base shadow-sm"
              style={{ backgroundColor: '#E8003D' }}
            >
              Fetch &amp; suggest
            </button>
            <Link href="/admin/news" className="text-sm text-slate-500 hover:text-slate-700">
              Cancel
            </Link>
          </div>
        </form>

        <p className="text-xs text-slate-400">
          Prefer to type everything yourself? <Link href="/admin/news/new" className="text-blue-600 hover:underline">Use the manual form instead →</Link>
        </p>
      </main>
    </div>
  )
}
