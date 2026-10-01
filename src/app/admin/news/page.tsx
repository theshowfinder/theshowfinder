export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { requireAdmin } from '@/lib/admin-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import type { NewsCandidate } from '@/lib/types/database'

const STATUS_STYLE: Record<string, string> = {
  pending:   'bg-amber-100 text-amber-700',
  approved:  'bg-blue-100 text-blue-700',
  rejected:  'bg-red-100 text-red-700',
  published: 'bg-green-100 text-green-700',
}

const PRIORITY_STYLE: Record<string, string> = {
  low:    'bg-slate-100 text-slate-500',
  normal: 'bg-slate-100 text-slate-600',
  high:   'bg-red-100 text-red-700',
}

const STORY_TYPE_LABEL: Record<string, string> = {
  presale:              'Presale',
  tour_announcement:    'Tour announcement',
  new_dates:            'New dates',
  venue_news:           'Venue news',
  general_entertainment: 'General',
}

// Review-queue ordering: pending stories surface first (that's the actual
// inbox), then approved (waiting to publish), then the two resolved states.
// Within a status, highest priority and newest-discovered sort first.
const STATUS_RANK: Record<string, number> = { pending: 0, approved: 1, published: 2, rejected: 3 }
const PRIORITY_RANK: Record<string, number> = { high: 0, normal: 1, low: 2 }

function sortCandidates(rows: NewsCandidate[]): NewsCandidate[] {
  return [...rows].sort((a, b) => {
    const statusDiff = STATUS_RANK[a.review_status] - STATUS_RANK[b.review_status]
    if (statusDiff !== 0) return statusDiff
    const priorityDiff = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]
    if (priorityDiff !== 0) return priorityDiff
    return new Date(b.discovered_at).getTime() - new Date(a.discovered_at).getTime()
  })
}

function fmtDate(value: string | null): string {
  if (!value) return '—'
  return new Date(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' })
}

export default async function NewsCandidatesAdminPage() {
  await requireAdmin()
  const db = createAdminClient()

  const { data: candidates } = await db
    .from('news_candidates')
    .select('*')
    .order('discovered_at', { ascending: false })
    .limit(200) as unknown as { data: NewsCandidate[] | null }

  const rows = sortCandidates(candidates ?? [])
  const pendingCount = rows.filter(r => r.review_status === 'pending').length

  // One extra query for every candidate's target cities (Phase 2 —
  // supersedes the single city_name column for anything beyond display).
  const { data: cityRows } = rows.length
    ? await db
        .from('news_candidate_cities')
        .select('candidate_id, city_name')
        .in('candidate_id', rows.map(r => r.id)) as unknown as { data: { candidate_id: string; city_name: string }[] | null }
    : { data: [] as { candidate_id: string; city_name: string }[] }

  const citiesByCandidate = new Map<string, string[]>()
  for (const row of cityRows ?? []) {
    const list = citiesByCandidate.get(row.candidate_id) ?? []
    list.push(row.city_name)
    citiesByCandidate.set(row.candidate_id, list)
  }

  function scopeLabel(item: NewsCandidate): string {
    if (item.scope_type === 'national') return 'National'
    const cities = citiesByCandidate.get(item.id) ?? (item.city_name ? [item.city_name] : [])
    if (cities.length === 0) return '—'
    if (cities.length === 1) return cities[0]
    return `${cities[0]} +${cities.length - 1} more`
  }

  // Publishing destinations (migration_029) are independent of scope_type
  // — this is purely a display hint next to the Scope/City column, not a
  // reflection of what scope_type itself means.
  function destinationBadges(item: NewsCandidate): string {
    const badges: string[] = []
    if (item.publish_to_homepage) badges.push('🏠')
    if (item.publish_to_news_page) badges.push('📰')
    return badges.join(' ')
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center gap-4">
        <Link href="/admin" className="text-slate-400 hover:text-slate-600 text-sm">← Admin</Link>
        <h1 className="text-xl font-extrabold text-slate-900">News Intelligence Inbox</h1>
        {pendingCount > 0 && (
          <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-amber-100 text-amber-700">
            {pendingCount} pending
          </span>
        )}
        <Link
          href="/admin/news/from-url"
          className="inline-block font-semibold text-slate-600 px-5 py-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 transition-colors text-sm ml-auto"
        >
          🔗 Add from URL
        </Link>
        <Link
          href="/admin/news/new"
          className="inline-block font-bold text-white px-5 py-2.5 rounded-xl hover:opacity-90 transition-opacity text-sm"
          style={{ backgroundColor: '#E8003D' }}
        >
          + Add Story
        </Link>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-10">
        <p className="text-sm text-slate-500 mb-6">
          Manually queued presale, tour-announcement and ticket news the RSS feeds haven&rsquo;t found yet. Approve and publish a
          story to add it to the same news cards shown on the homepage / city pages.
        </p>

        {rows.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
            <p className="text-slate-400 text-4xl mb-3">📰</p>
            <p className="text-slate-500 mb-4">No candidates yet.</p>
            <Link href="/admin/news/new" className="text-blue-600 font-semibold hover:underline">
              Add the first one →
            </Link>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50 text-left">
                  <th className="px-4 py-3 font-semibold text-slate-600">Headline</th>
                  <th className="px-4 py-3 font-semibold text-slate-600">Source</th>
                  <th className="px-4 py-3 font-semibold text-slate-600">Scope / City</th>
                  <th className="px-4 py-3 font-semibold text-slate-600">Story type</th>
                  <th className="px-4 py-3 font-semibold text-slate-600">Priority</th>
                  <th className="px-4 py-3 font-semibold text-slate-600">Status</th>
                  <th className="px-4 py-3 font-semibold text-slate-600">Published</th>
                  <th className="px-4 py-3 font-semibold text-slate-600">Created</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {rows.map(item => (
                  <tr key={item.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                    <td className="px-4 py-3 max-w-xs">
                      <p className="font-bold text-slate-900 line-clamp-2">{item.headline}</p>
                      {item.artist_name && <p className="text-slate-400 text-xs mt-0.5">{item.artist_name}</p>}
                      {item.intake_method === 'url_import' && (
                        <p className="text-slate-400 text-xs mt-0.5">🔗 via URL{item.ai_review_status === 'unreviewed' ? ' — AI suggestion not yet reviewed' : ''}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{item.source ?? '—'}</td>
                    <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                      {scopeLabel(item)}
                      {destinationBadges(item) && <span className="ml-1.5" title="Publishing destinations">{destinationBadges(item)}</span>}
                    </td>
                    <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{STORY_TYPE_LABEL[item.story_type] ?? item.story_type}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-bold px-2.5 py-1 rounded-full capitalize ${PRIORITY_STYLE[item.priority] ?? PRIORITY_STYLE.normal}`}>
                        {item.priority}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-bold px-2.5 py-1 rounded-full capitalize ${STATUS_STYLE[item.review_status] ?? ''}`}>
                        {item.review_status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{fmtDate(item.published_at)}</td>
                    <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{fmtDate(item.created_at)}</td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <Link href={`/admin/news/${item.id}`} className="text-blue-600 font-semibold hover:underline">
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
