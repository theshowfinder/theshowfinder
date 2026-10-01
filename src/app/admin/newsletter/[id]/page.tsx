export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireAdmin } from '@/lib/admin-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import ConfirmSubmitButton from '@/app/admin/news/ConfirmSubmitButton'
import { NewsletterEmailBody } from '@/emails/NewsletterEmail'
import { updateNewsletterAction, deleteNewsletterAction, sendTestNewsletterAction, sendNewsletterAction } from '../actions'
import { describeDestinations, resolveCityNewsTargets, type CandidateCityTarget } from '@/lib/newsPublishing'
import { canSendNewsletter, isNewsletterLocked, resolveNewsletterArticles, applyNewsletterTracking, type NewsletterArticleSummary } from '@/lib/newsletterContent'
import type { Newsletter, NewsCandidate } from '@/lib/types/database'

interface PageProps {
  params: Promise<{ id: string }>
  searchParams: Promise<{ saved?: string; sent?: string; test_sent?: string; error?: string }>
}

const ERROR_MESSAGE: Record<string, string> = {
  locked:              'This newsletter has already been sent and can no longer be edited.',
  save_failed:         'Could not save your changes. Please try again.',
  incomplete:          'Add a subject and select at least one article before sending.',
  invalid_test_email:  'Enter a valid email address to send a test to.',
  send_failed:         'The test email could not be sent. Check the server logs for details.',
  already_sent:        'This newsletter has already been sent.',
  no_valid_articles:   'None of the selected articles are still approved or published — update your selection and save before sending.',
  no_recipients:       'There are no active subscribers to send to.',
  not_found:           'Newsletter not found.',
}

function fmtDateTime(value: string): string {
  return new Date(value).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default async function EditNewsletterPage({ params, searchParams }: PageProps) {
  await requireAdmin()
  const { id } = await params
  const { saved, sent, test_sent, error } = await searchParams
  const db = createAdminClient()

  const [{ data: newsletter }, { data: eligible }, { count: activeSubscriberCount }] = await Promise.all([
    db.from('newsletters').select('*').eq('id', id).single() as unknown as Promise<{ data: Newsletter | null }>,
    db
      .from('news_candidates')
      .select('*')
      .in('review_status', ['approved', 'published'])
      .order('discovered_at', { ascending: false })
      .limit(150) as unknown as Promise<{ data: NewsCandidate[] | null }>,
    db.from('subscribers').select('*', { count: 'exact', head: true }).is('unsubscribed_at', null) as unknown as Promise<{ count: number | null }>,
  ])

  if (!newsletter) notFound()

  const eligibleCandidates = eligible ?? []
  const recipientCount = activeSubscriberCount ?? 0

  const { data: cityRows } = eligibleCandidates.length
    ? await db
        .from('news_candidate_cities')
        .select('candidate_id, city_slug, city_name')
        .in('candidate_id', eligibleCandidates.map(c => c.id)) as unknown as { data: { candidate_id: string; city_slug: string; city_name: string }[] | null }
    : { data: [] as { candidate_id: string; city_slug: string; city_name: string }[] }

  const citiesByCandidate = new Map<string, CandidateCityTarget[]>()
  for (const row of cityRows ?? []) {
    const list = citiesByCandidate.get(row.candidate_id) ?? []
    list.push({ city_slug: row.city_slug, city_name: row.city_name })
    citiesByCandidate.set(row.candidate_id, list)
  }

  function destinationsFor(candidate: NewsCandidate): string {
    const targets = resolveCityNewsTargets(candidate, citiesByCandidate.get(candidate.id) ?? [])
    const names = targets.map(t => t.city_name)
    const parts = describeDestinations(candidate, names.filter(n => n !== 'UK National' && n !== 'TheShowFinder News'))
    return parts.length > 0 ? parts.join(', ') : '—'
  }

  const locked = isNewsletterLocked(newsletter.status)
  const selectedIds = new Set(newsletter.article_ids)

  // Preview + test/send all use this exact same resolved list — reusing
  // ai_suggestions.email_teaser over the plain summary where available
  // (requirement 5), built from the same eligible-candidates fetch above
  // rather than a second query.
  const available = new Map<string, NewsletterArticleSummary>()
  for (const c of eligibleCandidates) {
    const ai = c.ai_suggestions as { email_teaser?: string | null } | null
    const summary = ai?.email_teaser || c.summary
    available.set(c.id, { id: c.id, headline: c.headline, summary, source: c.source, url: c.url })
  }
  // Tagged with this newsletter's own UTM campaign so the preview shows
  // exactly the links a recipient would actually get (requirement 4's
  // newsletter-traffic measurement) — same helper the real send uses.
  const previewArticles = applyNewsletterTracking(resolveNewsletterArticles(newsletter.article_ids, available), id)

  const updateAction = updateNewsletterAction.bind(null, id)
  const deleteAction = deleteNewsletterAction.bind(null, id)
  const sendTestAction = sendTestNewsletterAction.bind(null, id)
  const sendAction = sendNewsletterAction.bind(null, id)

  const sendable = canSendNewsletter(newsletter)

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center gap-4 flex-wrap">
        <Link href="/admin/newsletter" className="text-slate-400 hover:text-slate-600 text-sm">← Newsletters</Link>
        <h1 className="text-xl font-extrabold text-slate-900 truncate">{newsletter.subject || 'Untitled draft'}</h1>
        {locked ? (
          <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-green-100 text-green-700">Sent</span>
        ) : (
          <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-amber-100 text-amber-700">Draft</span>
        )}
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        {saved && (
          <div className="bg-green-50 border border-green-200 text-green-800 rounded-xl px-5 py-3 text-sm font-semibold">
            ✓ Draft saved
          </div>
        )}
        {test_sent && (
          <div className="bg-green-50 border border-green-200 text-green-800 rounded-xl px-5 py-3 text-sm font-semibold">
            ✓ Test email sent to {newsletter.test_sent_to}
          </div>
        )}
        {sent && (
          <div className="bg-green-50 border border-green-200 text-green-800 rounded-xl px-5 py-3 text-sm">
            <p className="font-semibold">✓ Sent to {newsletter.sent_count ?? 0} subscriber{newsletter.sent_count === 1 ? '' : 's'}</p>
          </div>
        )}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-800 rounded-xl px-5 py-3 text-sm font-semibold">
            ⚠ {ERROR_MESSAGE[error] ?? 'Something went wrong.'}
          </div>
        )}

        {locked ? (
          <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-3">
            <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wider">Sent newsletter — locked</h2>
            <p className="text-sm text-slate-600">
              Sent {newsletter.sent_at && fmtDateTime(newsletter.sent_at)} to {newsletter.sent_count ?? 0} subscriber{newsletter.sent_count === 1 ? '' : 's'}.
              {newsletter.test_sent_at && ` A test was also sent to ${newsletter.test_sent_to} on ${fmtDateTime(newsletter.test_sent_at)}.`}
            </p>
            <p className="text-sm text-slate-600">Intro: {newsletter.intro || '(none)'}</p>
            <p className="text-sm text-slate-600">{previewArticles.length} article{previewArticles.length === 1 ? '' : 's'} included.</p>
          </section>
        ) : (
          <>
            <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
              <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wider">Content</h2>
              <form action={updateAction} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Subject</label>
                  <input
                    name="subject"
                    defaultValue={newsletter.subject}
                    required
                    placeholder="e.g. This week's on-sale tickets and tour news"
                    className="w-full text-sm text-slate-700 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-200"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Intro</label>
                  <textarea
                    name="intro"
                    defaultValue={newsletter.intro}
                    rows={3}
                    placeholder="A couple of sentences introducing this round-up…"
                    className="w-full text-sm text-slate-700 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-200"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                    Articles ({selectedIds.size} selected · approved or published only)
                  </label>
                  {eligibleCandidates.length === 0 ? (
                    <p className="text-sm text-slate-400">
                      No approved or published stories yet — approve or publish something in the{' '}
                      <Link href="/admin/news" className="text-blue-600 hover:underline">News Inbox</Link> first.
                    </p>
                  ) : (
                    <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 max-h-96 overflow-y-auto">
                      {eligibleCandidates.map(c => (
                        <label key={c.id} className="flex items-start gap-3 px-4 py-3 hover:bg-slate-50 cursor-pointer">
                          <input
                            type="checkbox"
                            name="article_ids"
                            value={c.id}
                            defaultChecked={selectedIds.has(c.id)}
                            className="mt-1"
                          />
                          <span className="min-w-0">
                            <span className="block text-sm font-semibold text-slate-900">{c.headline}</span>
                            {c.summary && <span className="block text-xs text-slate-500 mt-0.5 line-clamp-2">{c.summary}</span>}
                            <span className="block text-xs text-slate-400 mt-1">
                              {c.source ?? 'Manual'} · {destinationsFor(c)}
                            </span>
                          </span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-3">
                  <button type="submit" className="text-sm font-bold px-4 py-2 rounded-xl bg-blue-600 text-white hover:opacity-90 transition-opacity">
                    Save draft
                  </button>
                  <ConfirmSubmitButton
                    action={deleteAction}
                    confirmMessage={`Delete this draft newsletter ("${newsletter.subject || 'Untitled draft'}")? This cannot be undone.`}
                    className="text-sm font-semibold text-slate-400 hover:text-red-600 transition-colors ml-auto"
                  >
                    Delete draft
                  </ConfirmSubmitButton>
                </div>
              </form>
            </section>

            <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
              <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wider">Preview</h2>
              <p className="text-xs text-slate-400">Reflects your last saved draft — save your changes above to update it.</p>
              <div className="border border-slate-200 rounded-xl bg-[#F5F5F0] p-6 flex justify-center overflow-x-auto">
                <NewsletterEmailBody
                  intro={newsletter.intro}
                  articles={previewArticles}
                  unsubscribeUrl="https://www.theshowfinder.com/unsubscribe?email=preview%40example.com"
                />
              </div>
            </section>

            <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
              <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wider">Send</h2>

              <form action={sendTestAction} className="flex flex-wrap items-center gap-3">
                <input
                  type="email"
                  name="testEmail"
                  required
                  defaultValue={newsletter.test_sent_to ?? ''}
                  placeholder="you@theshowfinder.com"
                  className="flex-1 min-w-[220px] text-sm text-slate-700 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-200"
                />
                <button
                  type="submit"
                  disabled={!sendable}
                  className="text-sm font-semibold px-4 py-2 rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Send test to this address
                </button>
              </form>

              {!sendable && (
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  Add a subject and select at least one article before you can send a test or the final newsletter.
                </p>
              )}

              <div className="border-t border-slate-100 pt-4">
                <p className="text-sm text-slate-600 mb-3">
                  Sending the final newsletter emails every active subscriber — currently{' '}
                  <span className="font-bold text-slate-900">{recipientCount.toLocaleString('en-GB')}</span>{' '}
                  {recipientCount === 1 ? 'person' : 'people'}. This cannot be undone and the newsletter is locked afterwards.
                </p>
                <ConfirmSubmitButton
                  action={sendAction}
                  confirmMessage={
                    sendable
                      ? `Send "${newsletter.subject}" to ${recipientCount} active subscriber${recipientCount === 1 ? '' : 's'} now? This cannot be undone.`
                      : 'Add a subject and select at least one article first.'
                  }
                  className="text-sm font-bold px-5 py-2.5 rounded-xl text-white bg-[#E8003D] hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  Send newsletter now
                </ConfirmSubmitButton>
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  )
}
