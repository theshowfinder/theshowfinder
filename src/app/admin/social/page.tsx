export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { requireAdmin } from '@/lib/admin-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { bulkAdvanceSocialPackStatusAction } from '../actions'
import type { SocialPack, SocialPackStatus } from '@/lib/types/database'

// Phase 7, requirement 9 — the manual-review queue for Social Packs.
// Mirrors /admin/news's own list-page pattern (status chips, a simple
// table, newest first) rather than inventing a new layout. Nothing here
// posts anywhere — every row is Draft, Ready for review, Approved or
// Posted, and only ever moves between those by an admin opening the row
// and clicking a button on /admin/social/[id].

const STATUS_STYLE: Record<SocialPackStatus, string> = {
  draft:            'bg-slate-100 text-slate-500',
  ready_for_review: 'bg-amber-100 text-amber-700',
  approved:         'bg-blue-100 text-blue-700',
  posted:           'bg-green-100 text-green-700',
  skipped:          'bg-slate-200 text-slate-500',
}

const STATUS_LABEL: Record<SocialPackStatus, string> = {
  draft:            'Draft',
  ready_for_review: 'Ready for review',
  approved:         'Approved',
  posted:           'Posted',
  skipped:          'Skipped',
}

const ALL_STATUSES: SocialPackStatus[] = ['draft', 'ready_for_review', 'approved', 'posted', 'skipped']

function Chip({ label, active, href }: { label: string; active: boolean; href: string }) {
  return (
    <Link
      href={href}
      className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors ${
        active ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
      }`}
    >
      {label}
    </Link>
  )
}

function fmtDate(value: string): string {
  return new Date(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' })
}

interface SearchParams {
  status?: string
  error?: string
  saved?: string
}

export default async function SocialPacksAdminPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireAdmin()
  const { status, error, saved } = await searchParams
  const db = createAdminClient()

  const { data: packs } = await db
    .from('social_packs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200) as unknown as { data: SocialPack[] | null }

  const allRows = packs ?? []
  const activeStatus = ALL_STATUSES.includes(status as SocialPackStatus) ? (status as SocialPackStatus) : null
  const rows = activeStatus ? allRows.filter(p => p.status === activeStatus) : allRows

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center gap-4">
        <Link href="/admin" className="text-slate-400 hover:text-slate-600 text-sm">← Admin</Link>
        <h1 className="text-xl font-extrabold text-slate-900">Social Packs</h1>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        {error && <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p>}
        {saved && <p className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm font-semibold text-green-700">Selected packs updated.</p>}
        <p className="text-sm text-slate-500">
          Manual-review drafts prepared from published city news stories and events you flag yourself. Nothing here
          posts to Facebook, Instagram or TikTok automatically. Select a batch to move it through review, then use
          Meta Business Suite or TikTok Scheduler for the final publishing step.
        </p>

        <div className="flex flex-wrap gap-2">
          <Chip label={`All (${allRows.length})`} active={activeStatus === null} href="/admin/social" />
          {ALL_STATUSES.map(s => (
            <Chip
              key={s}
              label={`${STATUS_LABEL[s]} (${allRows.filter(p => p.status === s).length})`}
              active={activeStatus === s}
              href={`/admin/social?status=${s}`}
            />
          ))}
        </div>

        {rows.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
            <p className="text-slate-400 text-4xl mb-3">📣</p>
            <p className="text-slate-500">
              {activeStatus ? `No packs with status "${STATUS_LABEL[activeStatus]}".` : 'No Social Packs yet.'}
            </p>
            <p className="text-slate-400 text-sm mt-2">
              A pack is prepared automatically when a city-targeted news story is published, or you can prepare one
              by hand from an event&rsquo;s admin page.
            </p>
          </div>
        ) : (
          <form action={bulkAdvanceSocialPackStatusAction} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 bg-slate-50 px-4 py-3">
              <select name="to" defaultValue="ready_for_review" className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700">
                <option value="ready_for_review">Mark selected ready for review</option>
                <option value="approved">Approve selected</option>
              </select>
              <button type="submit" className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-bold text-white hover:bg-slate-700">
                Apply to selected
              </button>
              <span className="text-xs text-slate-500">Only valid one-step transitions are accepted.</span>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50 text-left">
                  <th className="px-4 py-3" />
                  <th className="px-4 py-3 font-semibold text-slate-600">Headline</th>
                  <th className="px-4 py-3 font-semibold text-slate-600">City</th>
                  <th className="px-4 py-3 font-semibold text-slate-600">Source</th>
                  <th className="px-4 py-3 font-semibold text-slate-600">Status</th>
                  <th className="px-4 py-3 font-semibold text-slate-600">Created</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {rows.map(pack => (
                  <tr key={pack.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <input type="checkbox" name="pack_ids" value={pack.id} aria-label={`Select ${pack.headline}`} className="h-4 w-4 rounded border-slate-300" />
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-bold text-slate-900 max-w-md truncate">{pack.headline}</p>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{pack.city_name ?? '—'}</td>
                    <td className="px-4 py-3 text-slate-500 capitalize">{pack.source_type.replace('_', ' ')}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-bold px-2.5 py-1 rounded-full whitespace-nowrap ${STATUS_STYLE[pack.status]}`}>
                        {STATUS_LABEL[pack.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-500">{fmtDate(pack.created_at)}</td>
                    <td className="px-4 py-3 text-right">
                      <Link href={`/admin/social/${pack.id}`} className="text-blue-600 font-semibold hover:underline">
                        Open
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </form>
        )}
      </main>
    </div>
  )
}
