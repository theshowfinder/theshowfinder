export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireAdmin } from '@/lib/admin-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  updateNewsCandidateAction,
  approveNewsCandidateAction,
  rejectNewsCandidateAction,
  reopenNewsCandidateAction,
  publishNewsCandidateAction,
  unpublishNewsCandidateAction,
  deleteNewsCandidateAction,
} from '../../actions'
import NewsCandidateForm from '../NewsCandidateForm'
import ConfirmSubmitButton from '../ConfirmSubmitButton'
import type { NewsCandidate } from '@/lib/types/database'

interface PageProps {
  params: Promise<{ id: string }>
  searchParams: Promise<{ created?: string; saved?: string }>
}

const STATUS_STYLE: Record<string, string> = {
  pending:   'bg-amber-100 text-amber-700',
  approved:  'bg-blue-100 text-blue-700',
  rejected:  'bg-red-100 text-red-700',
  published: 'bg-green-100 text-green-700',
}

export default async function EditNewsCandidatePage({ params, searchParams }: PageProps) {
  await requireAdmin()
  const { id } = await params
  const { created, saved } = await searchParams
  const db = createAdminClient()

  const [{ data: candidate }, { data: artists }] = await Promise.all([
    db.from('news_candidates').select('*').eq('id', id).single() as unknown as Promise<{ data: NewsCandidate | null }>,
    db.from('artists').select('id, name').order('name', { ascending: true }) as unknown as Promise<{ data: { id: string; name: string }[] | null }>,
  ])

  if (!candidate) notFound()

  const updateAction = updateNewsCandidateAction.bind(null, candidate.id)
  const approveAction = approveNewsCandidateAction.bind(null, candidate.id)
  const rejectAction = rejectNewsCandidateAction.bind(null, candidate.id)
  const reopenAction = reopenNewsCandidateAction.bind(null, candidate.id)
  const publishAction = publishNewsCandidateAction.bind(null, candidate.id)
  const unpublishAction = unpublishNewsCandidateAction.bind(null, candidate.id)
  const deleteAction = deleteNewsCandidateAction.bind(null, candidate.id)

  const liveNewsPath = candidate.review_status === 'published'
    ? (candidate.scope_type === 'national' ? '/' : `/cities/${encodeURIComponent(candidate.city_name ?? '')}`)
    : null

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center gap-4">
        <Link href="/admin/news" className="text-slate-400 hover:text-slate-600 text-sm">← News Inbox</Link>
        <h1 className="text-xl font-extrabold text-slate-900 truncate">{candidate.headline}</h1>
        <span className={`text-xs font-bold px-2.5 py-1 rounded-full capitalize whitespace-nowrap ${STATUS_STYLE[candidate.review_status] ?? ''}`}>
          {candidate.review_status}
        </span>
        {liveNewsPath && (
          <Link href={liveNewsPath} target="_blank" className="text-slate-400 hover:text-slate-600 text-sm ml-auto whitespace-nowrap">
            View live →
          </Link>
        )}
      </header>

      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        {created && (
          <div className="bg-green-50 border border-green-200 text-green-800 rounded-xl px-5 py-3 text-sm font-semibold">
            ✓ Added to the queue
          </div>
        )}
        {saved && (
          <div className="bg-green-50 border border-green-200 text-green-800 rounded-xl px-5 py-3 text-sm font-semibold">
            ✓ Saved successfully
          </div>
        )}

        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-4">Review actions</h2>
          <div className="flex flex-wrap items-center gap-3">
            {candidate.review_status === 'pending' && (
              <>
                <form action={approveAction}>
                  <button type="submit" className="text-sm font-bold px-4 py-2 rounded-xl bg-blue-600 text-white hover:opacity-90 transition-opacity">
                    Approve
                  </button>
                </form>
                <form action={rejectAction}>
                  <button type="submit" className="text-sm font-bold px-4 py-2 rounded-xl bg-red-50 text-red-700 hover:bg-red-100 transition-colors">
                    Reject
                  </button>
                </form>
              </>
            )}

            {candidate.review_status === 'approved' && (
              <>
                <form action={publishAction}>
                  <button type="submit" className="text-sm font-bold px-4 py-2 rounded-xl bg-green-600 text-white hover:opacity-90 transition-opacity">
                    Publish to site
                  </button>
                </form>
                <form action={rejectAction}>
                  <button type="submit" className="text-sm font-bold px-4 py-2 rounded-xl bg-red-50 text-red-700 hover:bg-red-100 transition-colors">
                    Reject
                  </button>
                </form>
                <form action={reopenAction}>
                  <button type="submit" className="text-sm font-semibold px-4 py-2 rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors">
                    Back to pending
                  </button>
                </form>
              </>
            )}

            {(candidate.review_status === 'rejected' || candidate.review_status === 'published') && (
              <form action={reopenAction}>
                <button type="submit" className="text-sm font-semibold px-4 py-2 rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors">
                  Reopen for review
                </button>
              </form>
            )}

            {candidate.review_status === 'published' && (
              <>
                <form action={publishAction}>
                  <button type="submit" className="text-sm font-semibold px-4 py-2 rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors">
                    Re-publish (refresh live card)
                  </button>
                </form>
                <ConfirmSubmitButton
                  action={unpublishAction}
                  confirmMessage={`Unpublish "${candidate.headline}"? This removes it from the live site immediately. The story stays in the queue as Approved, so you can publish it again later.`}
                  className="text-sm font-bold px-4 py-2 rounded-xl bg-red-50 text-red-700 hover:bg-red-100 transition-colors"
                >
                  Unpublish
                </ConfirmSubmitButton>
              </>
            )}

            <form action={deleteAction} className="ml-auto">
              <button type="submit" className="text-sm font-semibold text-slate-400 hover:text-red-600 transition-colors">
                Delete
              </button>
            </form>
          </div>
          {candidate.published_to_city_news_at && (
            <p className="text-xs text-slate-400 mt-3">
              Published to city_news {new Date(candidate.published_to_city_news_at).toLocaleString('en-GB')}
            </p>
          )}
        </section>

        <NewsCandidateForm mode="edit" action={updateAction} candidate={candidate} artists={artists ?? []} />
      </main>
    </div>
  )
}
