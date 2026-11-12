import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { withJobRun } from '@/lib/jobRuns'
import { businessMonthStats } from '@/lib/advertiserReports'
import { sendTrialCheckIn } from '@/lib/advertiserEmails'
import { gbp, FOUNDING_OFFER_KEY, FOUNDING_PRICES } from '@/lib/advertisingPackages'

export const maxDuration = 60
export const dynamic = 'force-dynamic'

// Founding partner offer (first month free), daily (vercel.json):
// 1. About three weeks in (9 days before the free month ends), a business that is live gets one email with what its
//    listing has done so far, when the free month ends and the price after it.
// 2. A day after a free month has ended, Stripe is asked whether the subscription is now paying ("active" → paid) or
//    was cancelled, in case the invoice.paid / subscription.deleted webhooks were missed.
// ?dry=1 lists without sending or changing anything.
type Loose = any // eslint-disable-line @typescript-eslint/no-explicit-any
const CHECK_IN_DAYS_BEFORE_END = 9
const day = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', timeZone: 'Europe/London' })

async function handleGet(request: Request) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const dry = new URL(request.url).searchParams.get('dry') === '1'
  const db = createAdminClient() as Loose
  const now = Date.now()
  const { data: apps, error } = await db.from('advertiser_applications')
    .select('id, email, contact_name, business_name, city, package, business_id, approved_at, created_at, trial_ends_at, trial_report_sent_at, stripe_subscription_id, payment_status')
    .eq('offer', FOUNDING_OFFER_KEY).eq('payment_status', 'trial')
  if (error) throw new Error(error.message)

  const checkIns: string[] = [], converted: string[] = [], cancelled: string[] = [], failed: string[] = []
  for (const a of (apps ?? []) as Loose[]) {
    if (!a.trial_ends_at) continue
    const ends = Date.parse(a.trial_ends_at)
    // 1. Three-week check-in, once, only for a listing that is live.
    if (!a.trial_report_sent_at && a.business_id && now >= ends - CHECK_IN_DAYS_BEFORE_END * 86_400_000 && now < ends) {
      const { data: b } = await db.from('local_businesses').select('id, name, city, package, offer_text, status').eq('id', a.business_id).maybeSingle()
      if (b && b.status === 'active') {
        const start = new Date(a.approved_at ?? a.created_at)
        const stats = await businessMonthStats(b, { start, end: new Date(), label: 'your first three weeks' })
        const t = { contactName: a.contact_name ?? '', endsOn: day(a.trial_ends_at), monthlyPrice: gbp(FOUNDING_PRICES[a.package === 'featured' ? 'featured' : 'standard']) }
        if (dry) checkIns.push(a.business_name)
        else {
          try {
            await sendTrialCheckIn(a.email, stats, t)
            await db.from('advertiser_applications').update({ trial_report_sent_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', a.id)
            checkIns.push(a.business_name)
          } catch (e) { failed.push(`${a.business_name}: ${e instanceof Error ? e.message : String(e)}`) }
        }
      }
    }
    // 2. Free month over: is it paying now?
    if (now > ends + 86_400_000 && a.stripe_subscription_id && process.env.STRIPE_SECRET_KEY) {
      try {
        const r = await fetch(`https://api.stripe.com/v1/subscriptions/${encodeURIComponent(a.stripe_subscription_id)}`, { headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}` }, cache: 'no-store' })
        const sub = await r.json() as { status?: string }
        const status = sub.status === 'active' ? 'paid' : sub.status === 'canceled' || sub.status === 'incomplete_expired' ? 'pending' : null
        if (status) {
          if (!dry) await db.from('advertiser_applications').update({ payment_status: status, updated_at: new Date().toISOString() }).eq('id', a.id).eq('payment_status', 'trial')
          ;(status === 'paid' ? converted : cancelled).push(a.business_name)
        }
      } catch (e) { failed.push(`${a.business_name}: Stripe check failed (${e instanceof Error ? e.message : String(e)})`) }
    }
  }
  return NextResponse.json({ success: failed.length === 0, dry, inTrial: (apps ?? []).length, checkIns, converted, cancelled, failed })
}

export const GET = withJobRun('founding-partners', handleGet)
