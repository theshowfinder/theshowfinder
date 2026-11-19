'use server'

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/admin-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { dashboardUrl } from '@/lib/organiserDashboard'
import { publishSubmission, emailOrganiser, boostLink, payoutsLink, queueBoostSocialPost, SITE } from '@/lib/organiserPublish'

export async function approveSubmissionAction(formData: FormData) {
  await requireAdmin()
  const id = String(formData.get('id') ?? '')
  if (!id) return
  const db = createAdminClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pre = await (db as any).from('event_submissions').select('organiser_id, paid_price_pence').eq('id', id).maybeSingle()
  // Approving an organiser's paid-ticket event approves them for paid tickets from now on.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (pre.data?.paid_price_pence) await (db as any).from('organisers').update({ paid_tickets_approved: true }).eq('id', pre.data.organiser_id)
  const slug = await publishSubmission(db, id)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: sub } = await (db as any).from('event_submissions').select('title, manage_token, boost_paid_at, paid_price_pence, free_capacity, organiser_id, organisers(email, name, plan, plan_status, stripe_charges_enabled)').eq('id', id).maybeSingle()
  const o = sub?.organisers
  if (o?.email && slug) {
    const boosted = !!sub.boost_paid_at || (o.plan === 'promoter' && o.plan_status === 'active')
    await emailOrganiser(o.email, `Your event is live: ${sub.title}`, [
      `Hi ${o.name},`,
      `Good news: "${sub.title}" is now live on TheShowFinder: ${SITE}/events/${slug}`,
      sub.paid_price_pence && !o.stripe_charges_enabled ? `Your tickets go on sale as soon as you've set up payouts with Stripe (about 5 minutes): ${payoutsLink(id, sub.manage_token)}` : '',
      boosted ? 'Your boost is on, so it is featured right up to the night.' : `Want more people to see it? Boost it for £9.95: ${boostLink(id, sub.manage_token)}`,
      sub.paid_price_pence || sub.free_capacity ? `Manage your tickets, discount codes and ticket holders in your dashboard (keep it private): ${dashboardUrl(sub.organiser_id)}` : '',
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

/** Feature a live listing free until its date (or take it off): for promoters we want to win. Queues the social post draft too. */
export async function giftFeatureAction(formData: FormData) {
  await requireAdmin()
  const eventId = String(formData.get('event_id') ?? '')
  const on = formData.get('on') === '1'
  if (!eventId) return
  const db = createAdminClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: ev } = await (db as any).from('events').select('start_date').eq('id', eventId).maybeSingle()
  if (!ev) return
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (db as any).from('events').update({ is_featured: on, boost_until: on ? ev.start_date : null }).eq('id', eventId)
  if (on) await queueBoostSocialPost(db, eventId)
  revalidatePath('/admin/event-submissions')
  revalidatePath('/')
}
