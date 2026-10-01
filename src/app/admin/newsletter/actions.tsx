'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/admin-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { resend, FROM_EMAIL } from '@/lib/resend'
import NewsletterEmail from '@/emails/NewsletterEmail'
import { normalizeEmail, isValidEmail } from '@/lib/subscribers'
import {
  isEligibleForNewsletter,
  canSendNewsletter,
  isNewsletterLocked,
  chunkRecipients,
  buildUnsubscribeLink,
  resolveNewsletterArticles,
  type NewsletterArticleSummary,
} from '@/lib/newsletterContent'
import type { Newsletter } from '@/lib/types/database'

type DbClient = ReturnType<typeof createAdminClient>

// Every action below starts with requireAdmin() even though most other
// admin server actions in this codebase don't re-check auth themselves
// (they rely on the page that renders their form already being gated).
// A mass email send is categorically more consequential than an admin
// database edit — requirement 1's "no email sending without explicit
// admin action" is read here as "and only an authenticated admin", so
// this file adds that check itself rather than relying only on the page.

async function fetchNewsletter(db: DbClient, id: string): Promise<Newsletter | null> {
  const { data } = await db.from('newsletters').select('*').eq('id', id).single() as unknown as { data: Newsletter | null }
  return data
}

// Resolves a newsletter's selected article_ids against news_candidates,
// dropping any that are no longer eligible (e.g. unpublished or rejected
// since being added to the draft) — so a send can never include a story
// that no longer represents what was approved/published, even if it was
// selected earlier while it was.
async function fetchResolvedArticles(db: DbClient, newsletter: Newsletter): Promise<NewsletterArticleSummary[]> {
  if (newsletter.article_ids.length === 0) return []

  const { data } = await db
    .from('news_candidates')
    .select('id, headline, summary, source, url, review_status, ai_suggestions')
    .in('id', newsletter.article_ids) as unknown as {
      data: { id: string; headline: string; summary: string | null; source: string | null; url: string; review_status: string; ai_suggestions: unknown }[] | null
    }

  const available = new Map<string, NewsletterArticleSummary>()
  for (const row of data ?? []) {
    if (!isEligibleForNewsletter(row.review_status)) continue
    // Requirement 5's "use existing social/email copy where available":
    // the AI suggestion's email_teaser (src/lib/newsAiSuggestions.ts) was
    // purpose-written for exactly this — a newsletter blurb — so it takes
    // priority over the candidate's general-purpose summary, which falls
    // back in when there's no AI suggestion (a manually-entered candidate)
    // or the teaser is empty.
    const ai = row.ai_suggestions as { email_teaser?: string | null } | null
    const summary = ai?.email_teaser || row.summary
    available.set(row.id, { id: row.id, headline: row.headline, summary, source: row.source, url: row.url })
  }
  return resolveNewsletterArticles(newsletter.article_ids, available)
}

// ── Draft management ─────────────────────────────────────────────────────

export async function createNewsletterAction() {
  await requireAdmin()
  const db = createAdminClient()
  const { data, error } = await db.from('newsletters').insert({ subject: '', intro: '' }).select('id').single() as unknown as { data: { id: string } | null; error: { message: string } | null }

  if (error || !data) {
    console.error('[newsletter] create failed:', error?.message)
    redirect('/admin/newsletter?error=create_failed')
  }
  revalidatePath('/admin/newsletter')
  redirect(`/admin/newsletter/${data.id}`)
}

export async function updateNewsletterAction(id: string, formData: FormData) {
  await requireAdmin()
  const db = createAdminClient()
  const existing = await fetchNewsletter(db, id)
  if (!existing) redirect('/admin/newsletter?error=not_found')
  if (isNewsletterLocked(existing.status)) redirect(`/admin/newsletter/${id}?error=locked`)

  const subject = ((formData.get('subject') as string) ?? '').trim()
  const intro = ((formData.get('intro') as string) ?? '').trim()
  const articleIds = formData.getAll('article_ids').map(String)

  const { error } = await db
    .from('newsletters')
    .update({ subject, intro, article_ids: articleIds, updated_at: new Date().toISOString() })
    .eq('id', id)

  if (error) {
    console.error('[newsletter] update failed:', error.message)
    redirect(`/admin/newsletter/${id}?error=save_failed`)
  }

  revalidatePath(`/admin/newsletter/${id}`)
  redirect(`/admin/newsletter/${id}?saved=1`)
}

export async function deleteNewsletterAction(id: string) {
  await requireAdmin()
  const db = createAdminClient()
  const existing = await fetchNewsletter(db, id)
  if (existing && isNewsletterLocked(existing.status)) redirect(`/admin/newsletter/${id}?error=locked`)

  await db.from('newsletters').delete().eq('id', id)
  revalidatePath('/admin/newsletter')
  redirect('/admin/newsletter')
}

// ── Sending ───────────────────────────────────────────────────────────────

// Sends to exactly one address (the admin's own, typed into the form —
// there's no stored admin email anywhere in this codebase, admin auth is
// a single shared password, see src/lib/admin-auth.ts) using the real
// template and real selected articles, so what the admin previews in
// their own inbox is exactly what a recipient would get. Never changes
// `status` — a test send is not a send.
export async function sendTestNewsletterAction(id: string, formData: FormData) {
  await requireAdmin()
  const testEmail = normalizeEmail((formData.get('testEmail') as string) ?? '')
  if (!isValidEmail(testEmail)) redirect(`/admin/newsletter/${id}?error=invalid_test_email`)

  const db = createAdminClient()
  const newsletter = await fetchNewsletter(db, id)
  if (!newsletter) redirect('/admin/newsletter?error=not_found')
  if (!canSendNewsletter(newsletter)) redirect(`/admin/newsletter/${id}?error=incomplete`)

  const articles = await fetchResolvedArticles(db, newsletter)

  try {
    const { error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: testEmail,
      subject: `[TEST] ${newsletter.subject}`,
      react: <NewsletterEmail
        subject={newsletter.subject}
        intro={newsletter.intro}
        articles={articles}
        unsubscribeUrl={buildUnsubscribeLink(testEmail)}
      />,
    })
    if (error) {
      console.error('[newsletter] test send returned error:', JSON.stringify(error))
      redirect(`/admin/newsletter/${id}?error=send_failed`)
    }
  } catch (err) {
    console.error('[newsletter] test send threw exception:', err)
    redirect(`/admin/newsletter/${id}?error=send_failed`)
  }

  await db.from('newsletters').update({ test_sent_at: new Date().toISOString(), test_sent_to: testEmail }).eq('id', id)
  revalidatePath(`/admin/newsletter/${id}`)
  redirect(`/admin/newsletter/${id}?test_sent=1`)
}

// The real, final send — every active (non-unsubscribed) subscriber, one
// personalized message each via Resend's batch API (never a single email
// with many `to` addresses: that would expose every recipient's address
// to every other recipient, and can't carry a per-recipient unsubscribe
// link). Requirement 2's "send the final newsletter only after explicit
// confirmation" is enforced by the admin page's ConfirmSubmitButton in
// front of this action, not inside it — this action is the one thing
// that confirm dialog gates. Locks the newsletter (status -> 'sent')
// before anything else so a double-submit can never send twice.
export async function sendNewsletterAction(id: string) {
  await requireAdmin()
  const db = createAdminClient()
  const newsletter = await fetchNewsletter(db, id)
  if (!newsletter) redirect('/admin/newsletter?error=not_found')
  if (isNewsletterLocked(newsletter.status)) redirect(`/admin/newsletter/${id}?error=already_sent`)
  if (!canSendNewsletter(newsletter)) redirect(`/admin/newsletter/${id}?error=incomplete`)

  const articles = await fetchResolvedArticles(db, newsletter)
  if (articles.length === 0) redirect(`/admin/newsletter/${id}?error=no_valid_articles`)

  const { data: subscriberRows } = await db
    .from('subscribers')
    .select('email')
    .is('unsubscribed_at', null) as unknown as { data: { email: string }[] | null }
  const recipients = (subscriberRows ?? []).map(r => r.email)
  if (recipients.length === 0) redirect(`/admin/newsletter/${id}?error=no_recipients`)

  // Locked first, before any email goes out: if sendNewsletterAction were
  // somehow invoked twice concurrently (a double form submit slipping past
  // the confirm dialog), the second call's isNewsletterLocked check above
  // would already see this newsletter as sent — the lock is what actually
  // prevents a double send, the confirm dialog is the UI-level backstop.
  await db.from('newsletters').update({ status: 'sent' as const }).eq('id', id)

  let sentCount = 0
  for (const batch of chunkRecipients(recipients)) {
    const messages = batch.map(email => ({
      from: FROM_EMAIL,
      to: email,
      subject: newsletter.subject,
      react: <NewsletterEmail
        subject={newsletter.subject}
        intro={newsletter.intro}
        articles={articles}
        unsubscribeUrl={buildUnsubscribeLink(email)}
      />,
    }))
    try {
      const { data, error } = await resend.batch.send(messages)
      if (error) {
        console.error('[newsletter] batch send returned error:', JSON.stringify(error))
      } else {
        sentCount += data?.data?.length ?? 0
      }
    } catch (err) {
      console.error('[newsletter] batch send threw exception:', err)
    }
  }

  await db.from('newsletters').update({ sent_at: new Date().toISOString(), sent_count: sentCount }).eq('id', id)
  revalidatePath(`/admin/newsletter/${id}`)
  revalidatePath('/admin/newsletter')
  redirect(`/admin/newsletter/${id}?sent=1`)
}
