export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { requireAdmin } from '@/lib/admin-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  candidateAttentionReasons,
  resolveCityNewsTargets,
  isCandidateVisibleAtDestination,
  destinationDisplayLimit,
  type NewsCandidateAttentionReason,
} from '@/lib/newsPublishing'
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

const ATTENTION_LABEL: Record<NewsCandidateAttentionReason, string> = {
  no_destination:         'No publishing destination selected',
  stale_pending:          'Pending review for 2+ days',
  approved_not_published: 'Approved but not published for 24h+',
  ai_suggestion_failed:   'AI suggestion failed',
  not_visible:            'Published but no longer visible on a destination (pushed out by newer stories)',
}

// Review-queue ordering: pending stories surface first (that's the actual
// inbox), then approved (waiting to publish), then the two resolved states.
// Within a status, highest priority and newest-discovered sort first. This
// is the queue's one fixed row order — filters (below) narrow which rows
// are shown, they never change how the shown rows are ordered, so the
// mental model stays simple: "find the thing, then look at it in a
// consistent place".
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

const RECENT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000

function Chip({ label, active, href, tone }: { label: string; active: boolean; href: string; tone?: 'amber' }) {
  const activeClasses = tone === 'amber'
    ? 'bg-amber-600 text-white border-amber-600'
    : 'bg-slate-900 text-white border-slate-900'
  return (
    <Link
      href={href}
      className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors ${
        active ? activeClasses : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
      }`}
    >
      {label}
    </Link>
  )
}

interface SearchParams {
  status?: string
  provenance?: string
  priority?: string
  recent?: string
  attention?: string
}

export default async function NewsCandidatesAdminPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireAdmin()
  const params = await searchParams
  const db = createAdminClient()
  const now = new Date().getTime()

  const { data: candidates } = await db
    .from('news_candidates')
    .select('*')
    .order('discovered_at', { ascending: false })
    .limit(200) as unknown as { data: NewsCandidate[] | null }

  const allRows = sortCandidates(candidates ?? [])

  // One extra query for every candidate's target cities (Phase 2 —
  // supersedes the single city_name column for anything beyond display).
  const { data: cityRows } = allRows.length
    ? await db
        .from('news_candidate_cities')
        .select('candidate_id, city_slug, city_name')
        .in('candidate_id', allRows.map(r => r.id)) as unknown as { data: { candidate_id: string; city_slug: string; city_name: string }[] | null }
    : { data: [] as { candidate_id: string; city_slug: string; city_name: string }[] }

  const citiesByCandidate = new Map<string, { city_slug: string; city_name: string }[]>()
  for (const row of cityRows ?? []) {
    const list = citiesByCandidate.get(row.candidate_id) ?? []
    list.push({ city_slug: row.city_slug, city_name: row.city_name })
    citiesByCandidate.set(row.candidate_id, list)
  }

  function cityNamesFor(item: NewsCandidate): string[] {
    const rows = citiesByCandidate.get(item.id) ?? (item.city_name ? [{ city_slug: item.city_slug ?? '', city_name: item.city_name }] : [])
    return rows.map(r => r.city_name)
  }

  function scopeLabel(item: NewsCandidate): string {
    if (item.scope_type === 'national') return 'National'
    const cities = cityNamesFor(item)
    if (cities.length === 0) return '—'
    if (cities.length === 1) return cities[0]
    return `${cities[0]} +${cities.length - 1} more`
  }

  // Publishing destinations (migration_029) are independent of scope_type.
  function destinationBadges(item: NewsCandidate): string {
    const badges: string[] = []
    if (item.publish_to_homepage) badges.push('🏠')
    if (item.publish_to_news_page) badges.push('📰')
    return badges.join(' ')
  }

  // Attach computed attention reasons to every row once, up front — reused
  // by both the aggregate banner/counts and the per-row badge/filter below.
  // Targets are kept alongside so the visibility check below can reuse
  // them without resolving a second time.
  const rowsWithTargets = allRows.map(item => {
    const targets = resolveCityNewsTargets(item, citiesByCandidate.get(item.id) ?? [])
    const reasons = candidateAttentionReasons(item, targets.length === 0, now)
    return { item, targets, reasons }
  })

  // ── "Published but no longer visible" check (requirement 6) ────────────
  // A published candidate's city_news row can still fail to show up on its
  // own destination page once enough newer rows (RSS or other editorial)
  // have pushed it out of that page's visible slice — see
  // destinationDisplayLimit for the real per-destination page limits. This
  // needs a live read of each destination's actual current rows, so unlike
  // the other attention reasons it can't live inside the pure
  // candidateAttentionReasons; it's computed here, once, as one extra
  // query across every unique destination slug any published candidate
  // targets, then merged into the same `reasons` list every row already
  // carries so the rest of the page (badges, tooltip, filter chip) doesn't
  // need to know this check is a separate code path.
  const publishedWithTargets = rowsWithTargets.filter(r => r.item.review_status === 'published' && r.targets.length > 0)
  const destinationSlugs = [...new Set(publishedWithTargets.flatMap(r => r.targets.map(t => t.city_slug)))]

  const rowsByDestinationSlug = new Map<string, { url: string; published_at: string | null }[]>()
  if (destinationSlugs.length > 0) {
    const { data: destinationRows } = await db
      .from('city_news')
      .select('city_slug, url, published_at')
      .in('city_slug', destinationSlugs)
      .order('published_at', { ascending: false })
      .limit(2000) as unknown as { data: { city_slug: string; url: string; published_at: string | null }[] | null }
    for (const row of destinationRows ?? []) {
      const list = rowsByDestinationSlug.get(row.city_slug) ?? []
      list.push({ url: row.url, published_at: row.published_at })
      rowsByDestinationSlug.set(row.city_slug, list)
    }
  }

  const rowsWithAttention = rowsWithTargets.map(({ item, targets, reasons }) => {
    if (item.review_status !== 'published' || targets.length === 0) return { item, reasons }
    const invisibleSomewhere = targets.some(t => {
      const rows = rowsByDestinationSlug.get(t.city_slug) ?? []
      return !isCandidateVisibleAtDestination(item.url, rows, destinationDisplayLimit(t.city_slug))
    })
    return invisibleSomewhere ? { item, reasons: [...reasons, 'not_visible' as const] } : { item, reasons }
  })

  const pendingCount = allRows.filter(r => r.review_status === 'pending').length
  const attentionCount = rowsWithAttention.filter(r => r.reasons.length > 0).length

  // ── Filters (narrow which rows are shown; never change row order) ──────
  const filtered = rowsWithAttention.filter(({ item, reasons }) => {
    if (params.status && item.review_status !== params.status) return false
    if (params.provenance && item.intake_method !== params.provenance) return false
    if (params.priority && item.priority !== params.priority) return false
    if (params.recent === '1' && now - new Date(item.discovered_at).getTime() > RECENT_WINDOW_MS) return false
    if (params.attention === '1' && reasons.length === 0) return false
    return true
  })

  // Builds a filter-chip href that toggles one query param on/off while
  // preserving every other active filter — so chips combine (e.g. "Pending
  // review" + "High priority" together) rather than replacing each other.
  function chipHref(key: keyof SearchParams, value: string): string {
    const next = new URLSearchParams()
    for (const [k, v] of Object.entries(params)) {
      if (v && k !== key) next.set(k, v)
    }
    if (params[key] !== value) next.set(key, value)
    const qs = next.toString()
    return '/admin/news' + (qs ? `?${qs}` : '')
  }

  const hasActiveFilters = Object.values(params).some(Boolean)

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center gap-4 flex-wrap">
        <Link href="/admin" className="text-slate-400 hover:text-slate-600 text-sm">← Admin</Link>
        <h1 className="text-xl font-extrabold text-slate-900">News Intelligence Inbox</h1>
        {pendingCount > 0 && (
          <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-amber-100 text-amber-700">
            {pendingCount} pending
          </span>
        )}
        {attentionCount > 0 && (
          <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-red-100 text-red-700">
            ⚠ {attentionCount} need attention
          </span>
        )}
        <Link
          href="/admin/news/feeds"
          className="text-sm text-slate-400 hover:text-slate-600 ml-2"
        >
          RSS feed health →
        </Link>
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

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-10">
        <p className="text-sm text-slate-500 mb-4">
          Manually queued presale, tour-announcement and ticket news, plus AI-assisted URL imports. RSS-sourced stories publish
          automatically straight to the public site (not reviewed here) — see{' '}
          <Link href="/admin/news/feeds" className="text-blue-600 hover:underline">RSS feed health</Link> for that pipeline.
          Approve and publish a story here to add it to the same news cards shown on the homepage, Main News page and city pages.
        </p>

        <div className="flex flex-wrap items-center gap-2 mb-6">
          <Chip label="Pending review" active={params.status === 'pending'} href={chipHref('status', 'pending')} />
          <Chip label="Already published" active={params.status === 'published'} href={chipHref('status', 'published')} />
          <Chip label="Recently added (7d)" active={params.recent === '1'} href={chipHref('recent', '1')} />
          <Chip label="High priority" active={params.priority === 'high'} href={chipHref('priority', 'high')} />
          <Chip label="URL imports" active={params.provenance === 'url_import'} href={chipHref('provenance', 'url_import')} />
          <Chip label="Manual entries" active={params.provenance === 'manual'} href={chipHref('provenance', 'manual')} />
          <Chip label="⚠ Needs attention" active={params.attention === '1'} href={chipHref('attention', '1')} tone="amber" />
          {hasActiveFilters && (
            <Link href="/admin/news" className="text-xs font-semibold text-slate-400 hover:text-slate-600 px-2">
              Clear filters
            </Link>
          )}
        </div>

        {filtered.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
            <p className="text-slate-400 text-4xl mb-3">📰</p>
            <p className="text-slate-500 mb-4">{hasActiveFilters ? 'No candidates match these filters.' : 'No candidates yet.'}</p>
            {hasActiveFilters ? (
              <Link href="/admin/news" className="text-blue-600 font-semibold hover:underline">Clear filters →</Link>
            ) : (
              <Link href="/admin/news/new" className="text-blue-600 font-semibold hover:underline">Add the first one →</Link>
            )}
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50 text-left">
                  <th className="px-4 py-3 font-semibold text-slate-600">Headline</th>
                  <th className="px-4 py-3 font-semibold text-slate-600">Source</th>
                  <th className="px-4 py-3 font-semibold text-slate-600">Provenance</th>
                  <th className="px-4 py-3 font-semibold text-slate-600">AI</th>
                  <th className="px-4 py-3 font-semibold text-slate-600">Destinations</th>
                  <th className="px-4 py-3 font-semibold text-slate-600">Priority</th>
                  <th className="px-4 py-3 font-semibold text-slate-600">Status</th>
                  <th className="px-4 py-3 font-semibold text-slate-600">Article date</th>
                  <th className="px-4 py-3 font-semibold text-slate-600">Added</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {filtered.map(({ item, reasons }) => (
                  <tr key={item.id} className={`border-b border-slate-100 last:border-0 hover:bg-slate-50 ${reasons.length > 0 ? 'bg-amber-50/40' : ''}`}>
                    <td className="px-4 py-3 max-w-xs">
                      <p className="font-bold text-slate-900 line-clamp-2">
                        {reasons.length > 0 && <span title={reasons.map(r => ATTENTION_LABEL[r]).join(' · ')}>⚠ </span>}
                        {item.headline}
                      </p>
                      {item.artist_name && <p className="text-slate-400 text-xs mt-0.5">{item.artist_name}</p>}
                      <p className="text-slate-400 text-xs mt-0.5">{STORY_TYPE_LABEL[item.story_type] ?? item.story_type}</p>
                    </td>
                    <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{item.source ?? '—'}</td>
                    <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                      {item.intake_method === 'url_import' ? '🔗 URL import' : '✎ Manual'}
                    </td>
                    <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                      {item.intake_method !== 'url_import' ? (
                        <span className="text-slate-300">—</span>
                      ) : reasons.includes('ai_suggestion_failed') ? (
                        <span className="text-red-600 font-semibold">⚠ Failed</span>
                      ) : item.ai_review_status === 'reviewed' ? (
                        <span className="text-green-700">✓ Reviewed</span>
                      ) : item.ai_review_status === 'unreviewed' ? (
                        <span className="text-amber-600">⏳ Unreviewed</span>
                      ) : (
                        <span className="text-slate-300">n/a</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                      {scopeLabel(item)}
                      {destinationBadges(item) && <span className="ml-1.5" title="Publishing destinations">{destinationBadges(item)}</span>}
                    </td>
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
                    <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{fmtDate(item.discovered_at)}</td>
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
