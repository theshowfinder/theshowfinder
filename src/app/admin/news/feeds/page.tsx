export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { requireAdmin } from '@/lib/admin-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { CITIES } from '@/lib/cities'
import { NATIONAL_NAME, NATIONAL_OUTLET_LOG_PREFIX } from '@/lib/cityNews'
import { summarizeFeedHealth, feedsNeedingAttention, type SyncLogRow, type FeedHealthSummary } from '@/lib/feedHealth'

const NATIONAL_FEED_OUTLET_NAMES = ['BBC News', 'NME', 'The Guardian', 'The Independent', 'Sky News']

function fmtDateTime(value: string | null): string {
  if (!value) return '—'
  return new Date(value).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export default async function FeedHealthPage() {
  await requireAdmin()
  const db = createAdminClient()
  const now = new Date().getTime()

  const feedNames = [...CITIES.map(c => c.name), NATIONAL_NAME]

  const [{ data: logs }, { data: outletLogs }] = await Promise.all([
    db
      .from('sync_log')
      .select('city, started_at, completed_at, events_synced, status, error')
      .in('city', feedNames)
      .order('started_at', { ascending: false })
      .limit(600) as unknown as Promise<{ data: SyncLogRow[] | null }>,
    db
      .from('sync_log')
      .select('city, started_at, completed_at, events_synced, status, error')
      .like('city', `${NATIONAL_OUTLET_LOG_PREFIX}%`)
      .order('started_at', { ascending: false })
      .limit(30) as unknown as Promise<{ data: SyncLogRow[] | null }>,
  ])

  const summaries = summarizeFeedHealth(feedNames, logs ?? [], now)
  const attention = feedsNeedingAttention(summaries)
  const nationalSummary = summaries.find(s => s.name === NATIONAL_NAME) ?? null
  const citySummaries = summaries.filter(s => s.name !== NATIONAL_NAME)

  function statusLabel(s: FeedHealthSummary): { label: string; classes: string } {
    if (!s.lastRun) return { label: 'Never run', classes: 'bg-slate-100 text-slate-500' }
    if (s.isStale) return { label: 'Stale', classes: 'bg-amber-100 text-amber-700' }
    if (s.recentFailureCount > 0) return { label: `${s.recentFailureCount}/${s.recentRunCount} failed`, classes: 'bg-red-100 text-red-700' }
    return { label: 'Healthy', classes: 'bg-green-100 text-green-700' }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center gap-4 flex-wrap">
        <Link href="/admin/news" className="text-slate-400 hover:text-slate-600 text-sm">← News Inbox</Link>
        <h1 className="text-xl font-extrabold text-slate-900">RSS Feed Health</h1>
        {attention.length > 0 && (
          <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-red-100 text-red-700">
            ⚠ {attention.length} feed{attention.length !== 1 ? 's' : ''} need attention
          </span>
        )}
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-10 space-y-8">
        <p className="text-sm text-slate-500">
          This is the automated RSS pipeline — {CITIES.length} per-city Google News searches plus one national feed (aggregating{' '}
          {NATIONAL_FEED_OUTLET_NAMES.join(', ')}), synced once daily at 03:00 UTC (vercel.json). Content here publishes straight to
          the public site with no human review — see{' '}
          <Link href="/admin/news" className="text-blue-600 hover:underline">the News Inbox</Link> for the separate, reviewed
          manual/URL-import queue. No credentials or API keys are shown on this page.
        </p>

        {nationalSummary && (
          <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-4">National feed</h2>
            <div className="flex flex-wrap items-center gap-3 mb-2">
              <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${statusLabel(nationalSummary).classes}`}>
                {statusLabel(nationalSummary).label}
              </span>
              <span className="text-sm text-slate-600">
                Last run: {fmtDateTime(nationalSummary.lastRun?.started_at ?? null)}
                {nationalSummary.lastRun && ` — ${nationalSummary.lastRun.events_synced ?? 0} items`}
              </span>
            </div>
            {nationalSummary.lastRun?.error && (
              <p className="text-xs text-red-600 mt-1">Last error: {nationalSummary.lastRun.error}</p>
            )}

            <div className="mt-4 pt-4 border-t border-slate-100">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                Per-outlet failures (last 30 logged, any outlet)
              </p>
              <p className="text-xs text-slate-400 mb-3">
                One outlet hiccuping never takes down the other four — the aggregate row above still ran. This list is for
                diagnosing a single outlet that keeps failing; a healthy outlet never appears here at all (only failures are
                logged per-outlet, so there is no &ldquo;last successful run&rdquo; to show per outlet).
              </p>
              {outletLogs && outletLogs.length > 0 ? (
                <ul className="text-sm text-slate-600 space-y-1.5">
                  {outletLogs.map((row, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="font-semibold text-red-700 shrink-0">{row.city.replace(NATIONAL_OUTLET_LOG_PREFIX, '')}</span>
                      <span className="text-slate-400 shrink-0">{fmtDateTime(row.started_at)}</span>
                      <span className="truncate">{row.error}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-slate-400">No outlet failures logged recently.</p>
              )}
            </div>
          </section>
        )}

        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden overflow-x-auto">
          <div className="px-6 py-4 border-b border-slate-100">
            <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wider">
              Per-city feeds ({citySummaries.length})
            </h2>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 text-left">
                <th className="px-4 py-3 font-semibold text-slate-600">City</th>
                <th className="px-4 py-3 font-semibold text-slate-600">Status</th>
                <th className="px-4 py-3 font-semibold text-slate-600">Last run</th>
                <th className="px-4 py-3 font-semibold text-slate-600">Items last run</th>
                <th className="px-4 py-3 font-semibold text-slate-600">Last error</th>
              </tr>
            </thead>
            <tbody>
              {citySummaries.map(s => {
                const status = statusLabel(s)
                return (
                  <tr key={s.name} className={`border-b border-slate-100 last:border-0 hover:bg-slate-50 ${status.label !== 'Healthy' ? 'bg-amber-50/40' : ''}`}>
                    <td className="px-4 py-3 font-semibold text-slate-900 whitespace-nowrap">{s.name}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${status.classes}`}>{status.label}</span>
                    </td>
                    <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{fmtDateTime(s.lastRun?.started_at ?? null)}</td>
                    <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{s.lastRun?.events_synced ?? '—'}</td>
                    <td className="px-4 py-3 text-red-600 max-w-sm truncate">{s.lastRun?.error ?? ''}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </section>
      </main>
    </div>
  )
}
