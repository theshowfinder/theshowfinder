export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { requireAdmin } from '@/lib/admin-auth'
import { createNewsCandidatesFromUrlsAction } from '../../actions'

interface BatchError {
  url: string
  message: string
}

interface PageProps {
  searchParams: Promise<{ error?: string; created?: string; failed?: string; ids?: string; errors?: string }>
}

function parseErrors(value?: string): BatchError[] {
  if (!value) return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.filter(item => item && typeof item.url === 'string' && typeof item.message === 'string') : []
  } catch {
    return []
  }
}

export default async function BatchNewsPage({ searchParams }: PageProps) {
  await requireAdmin()
  const params = await searchParams
  const created = Number(params.created ?? 0)
  const failed = Number(params.failed ?? 0)
  const ids = (params.ids ?? '').split(',').filter(Boolean)
  const errors = parseErrors(params.errors)

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center gap-4">
        <Link href="/admin/news" className="text-slate-400 hover:text-slate-600 text-sm">← News Inbox</Link>
        <h1 className="text-xl font-extrabold text-slate-900">Batch city news import</h1>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        <div>
          <h2 className="text-2xl font-extrabold text-slate-900">Queue multiple article URLs</h2>
          <p className="text-sm text-slate-500 mt-2">
            Paste one trusted article URL per line. Each page is fetched, checked for duplicates, and turned into a normal pending News Inbox item. AI suggests the headline, story type and relevant supported cities, but nothing publishes automatically.
          </p>
        </div>

        {params.error && (
          <div className="bg-red-50 border border-red-200 text-red-800 rounded-xl px-5 py-3 text-sm font-semibold">⚠ {params.error}</div>
        )}

        {(created > 0 || failed > 0) && (
          <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
            <p className="font-bold text-slate-900">Batch complete: {created} queued{failed ? `, ${failed} not queued` : ''}.</p>
            {ids.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {ids.map(id => <Link key={id} href={`/admin/news/${id}`} className="text-sm font-semibold text-blue-600 hover:underline">Review queued story →</Link>)}
              </div>
            )}
            {errors.length > 0 && (
              <div className="border-t border-slate-100 pt-3 space-y-2">
                <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Not queued</p>
                {errors.map(item => (
                  <div key={item.url} className="text-sm text-red-700">
                    <span className="font-semibold break-all">{item.url}</span><span className="text-red-500"> — {item.message}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <form action={createNewsCandidatesFromUrlsAction} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
          <div>
            <label htmlFor="batch-news-urls" className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Article URLs</label>
            <textarea
              id="batch-news-urls"
              name="urls"
              required
              rows={12}
              placeholder={'https://example.com/first-story\nhttps://example.com/second-story\nhttps://example.com/third-story'}
              className="w-full border border-slate-300 rounded-lg px-3 py-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white resize-y"
            />
            <p className="text-xs text-slate-400 mt-1">Up to 20 URLs per batch. Duplicate URLs are skipped safely.</p>
          </div>
          <div className="flex items-center gap-4">
            <button type="submit" className="font-bold text-white px-8 py-3 rounded-xl hover:opacity-90 transition-opacity text-base shadow-sm" style={{ backgroundColor: '#E8003D' }}>
              Fetch and queue batch
            </button>
            <Link href="/admin/news" className="text-sm text-slate-500 hover:text-slate-700">Cancel</Link>
          </div>
        </form>

        <div className="bg-blue-50 border border-blue-100 rounded-xl px-5 py-4 text-sm text-blue-900 space-y-1">
          <p className="font-bold">Next step</p>
          <p>Open each queued story in News Inbox, confirm the suggested cities and publishing destinations, then approve and publish. Publishing creates the city news and the matching Social Packs.</p>
        </div>
      </main>
    </div>
  )
}
