// Phase 5A: newsletter preparation — pure, dependency-free content and
// validation logic for the admin newsletter workflow
// (src/app/admin/newsletter), kept free of Next.js/Supabase/Resend
// machinery so it can be unit-tested with Node's built-in test runner,
// matching the pattern already used for newsFiltering.ts/newsPublishing.ts.

import { buildNewsletterLink } from './analytics.ts'

export interface NewsletterArticleSummary {
  id: string
  headline: string
  summary: string | null
  source: string | null
  url: string
}

// A newsletter is only ever built from candidates that have actually
// passed editorial review — requirement 2's "using approved or published
// news only." The admin article picker only ever queries for these in the
// first place, but this is the one place that rule is expressed in code
// rather than only in what a query happens to return, so it's the thing
// under test, not the query.
export function isEligibleForNewsletter(reviewStatus: string): boolean {
  return reviewStatus === 'approved' || reviewStatus === 'published'
}

// A draft needs a real subject and at least one selected article before
// either a test or the final send is allowed — nothing else stops an
// admin from leaving the article picker empty or the subject blank.
export function canSendNewsletter(newsletter: { subject: string; article_ids: string[] }): boolean {
  return newsletter.subject.trim().length > 0 && newsletter.article_ids.length > 0
}

// Once a newsletter has been sent, its content is locked — requirement 2's
// "record when a newsletter was sent" implies that record describes what
// actually went out, which a later edit would falsify. The admin page
// uses this to switch the whole editor into a read-only view.
export function isNewsletterLocked(status: string): boolean {
  return status === 'sent'
}

// Resend's batch-send API accepts at most 100 messages per call — this
// splits a recipient list into call-sized chunks. Each recipient is sent
// as its own message (not one email with many `to` addresses), so every
// send gets a personalized unsubscribe link and no recipient sees anyone
// else's address.
const RESEND_BATCH_SIZE = 100

export function chunkRecipients<T>(recipients: T[], size: number = RESEND_BATCH_SIZE): T[][] {
  if (size <= 0) throw new Error('chunkRecipients: size must be positive')
  const chunks: T[][] = []
  for (let i = 0; i < recipients.length; i += size) {
    chunks.push(recipients.slice(i, i + size))
  }
  return chunks
}

// The same /unsubscribe?email=... contract the welcome email
// (src/app/actions/newsletter.tsx) and the /unsubscribe page already use —
// kept here as the one place a newsletter send builds this link, so it
// can never drift from that contract.
export function buildUnsubscribeLink(email: string, baseUrl = 'https://www.theshowfinder.com'): string {
  return `${baseUrl}/unsubscribe?email=${encodeURIComponent(email)}`
}

// Preserves the admin's selection order (the order articles were checked
// in the picker, which buildArticleOrder below treats as send order) while
// dropping any id that no longer resolves to a real, still-eligible
// candidate — e.g. one that was unpublished or deleted after being added
// to a draft. Looked up by the caller (a live Supabase fetch), passed in
// as `available` so this stays pure.
export function resolveNewsletterArticles(
  articleIds: string[],
  available: Map<string, NewsletterArticleSummary>
): NewsletterArticleSummary[] {
  return articleIds.map(id => available.get(id)).filter((a): a is NewsletterArticleSummary => a !== undefined)
}

// Requirement 4's "Newsletter traffic" measurement: tags every article
// link that goes out in a send with utm_source=newsletter/medium=email/
// campaign=newsletter-<id>, so GA4 can separate newsletter click-throughs
// from everything else. Applied once here — both the live send
// (src/app/admin/newsletter/actions.tsx) and the admin preview
// (src/app/admin/newsletter/[id]/page.tsx) call this before handing
// articles to NewsletterEmail/NewsletterEmailBody, so what an admin
// previews is exactly what a recipient's links will actually point to.
export function applyNewsletterTracking(
  articles: NewsletterArticleSummary[],
  newsletterId: string
): NewsletterArticleSummary[] {
  return articles.map(article => ({ ...article, url: buildNewsletterLink(article.url, newsletterId) }))
}
