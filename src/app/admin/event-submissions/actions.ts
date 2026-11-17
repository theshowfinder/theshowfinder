'use server'

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/admin-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { publishSubmission, emailOrganiser, boostLink, SITE } from '@/lib/organiserPublish'

export async function approveSubmissionAction(formData: FormData) {
  await requireAdmin()
  const id = String(formData.get('id') ?? '')
  if (!id) return
  const db = createAdminClient()
  const slug = await publishSubmission(db, id)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: sub } = await (db as any).from('event_submissions').select('title, manage_token, boost_paid_at, organisers(email, name, plan, plan_status)').eq('id', id).maybeSingle()
  const o = sub?.organisers
  if (o?.email && slug) {
    const boosted = !!sub.boost_paid_at || (o.plan === 'promoter' && o.plan_status === 'active')
    await emailOrganiser(o.email, `Your event is live: ${sub.title}`, [
      `Hi ${o.name},`,
      `Good news: "${sub.title}" is now live on TheShowFinder: ${SITE}/events/${slug}`,
      boosted ? 'Your boost is on, so it is featured right up to the night.' : `Want more people to see it? Boost it for £9.95: ${boostLink(id, sub.manage_token)}`,
      'Chris, TheShowFinder',
    ])
  }
  revalidatePath('/admin/event-submissions')
}

export async function rejectSubmissionAction(formData: FormData) {
  await requireAdmin()
  const id = String(formData.get('id') ?? '')
  const reason = String(formData.get('reason') ?? '').trim().slice(0, 300) || 'It did not meet our listing guidelines.'
  if (!id) return
  const db = createAdminClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: sub } = await (db as any).from('event_submissions').update({ status: 'rejected', review_reason: reason, reviewed_at: new Date().toISOString() }).eq('id', id).select('title, boost_paid_at, organisers(email, name)').maybeSingle()
  const o = sub?.organisers
  if (o?.email) {
    await emailOrganiser(o.email, `About your listing: ${sub.title}`, [
      `Hi ${o.name},`,
      `Sorry, we couldn't list "${sub.title}" on TheShowFinder. ${reason}`,
      sub.boost_paid_at ? 'You paid for a boost on this listing, so we will refund it in full. You will see it back on your card within 5 to 10 days.' : '',
      'If you think we got this wrong, just reply and we will take another look.',
      'Chris, TheShowFinder',
    ].filter(Boolean))
  }
  revalidatePath('/admin/event-submissions')
}
