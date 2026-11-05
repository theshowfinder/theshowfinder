import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { withJobRun } from '@/lib/jobRuns'
import { canEmail, takeAcrossCities, DAILY_LIMIT, FOLLOW_UP_AFTER_DAYS, NO_RESPONSE_AFTER_DAYS, type Prospect } from '@/lib/outreach'
import { sendOutreachEmail } from '@/lib/outreachSend'

export const maxDuration = 60
export const dynamic = 'force-dynamic'

// Advertiser outreach sender (vercel.json: hourly, weekdays 09:10–17:10 UTC). Each run sends a few emails, so the
// day's sends are spread out and never more than DAILY_LIMIT: first emails to businesses Chris approved, then one
// follow-up FOLLOW_UP_AFTER_DAYS later to anyone still at "sent" (not replied, interested, onboarding or opted out),
// and "No response" NO_RESPONSE_AFTER_DAYS after the first email. ?dry=1 lists only.
const PER_RUN = 5   // 9 weekday runs x 5 = up to 45 a day, spread out
type Loose = any // eslint-disable-line @typescript-eslint/no-explicit-any
const COLS = 'id, business_name, category, city, near_venue, distance_label, contact_name, email, company_type, status, ref_code, unsubscribe_token'

async function handleGet(request: Request) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const dry = new URL(request.url).searchParams.get('dry') === '1'
  const db = createAdminClient() as Loose
  // Followed up and still nothing after NO_RESPONSE_AFTER_DAYS: "No response", never chased again.
  if (!dry) {
    const cutoff = new Date(Date.now() - NO_RESPONSE_AFTER_DAYS * 86_400_000).toISOString()
    await db.from('outreach_prospects').update({ status: 'no_response', updated_at: new Date().toISOString() }).eq('status', 'followed_up').lte('sent_at', cutoff)
  }
  const dayStart = new Date(); dayStart.setUTCHours(0, 0, 0, 0)
  const [{ count: firstToday }, { count: followToday }] = await Promise.all([
    db.from('outreach_prospects').select('id', { count: 'exact', head: true }).gte('sent_at', dayStart.toISOString()),
    db.from('outreach_prospects').select('id', { count: 'exact', head: true }).gte('followed_up_at', dayStart.toISOString()),
  ])
  let budget = Math.min(PER_RUN, DAILY_LIMIT - (firstToday ?? 0) - (followToday ?? 0))
  const sent: string[] = [], failed: string[] = []
  if (budget <= 0) return NextResponse.json({ success: true, dry, sent, failed, note: 'daily limit reached' })

  const followBefore = new Date(Date.now() - FOLLOW_UP_AFTER_DAYS * 86_400_000).toISOString()
  const [{ data: firsts }, { data: follows }] = await Promise.all([
    db.from('outreach_prospects').select(COLS).eq('status', 'approved').order('created_at').limit(300),
    db.from('outreach_prospects').select(COLS).eq('status', 'sent').lte('sent_at', followBefore).order('sent_at').limit(budget),
  ])
  const queue: Array<{ p: Prospect; kind: 'first' | 'follow_up' }> = [
    ...takeAcrossCities((firsts ?? []) as Prospect[], budget).map(p => ({ p, kind: 'first' as const })),
    ...((follows ?? []) as Prospect[]).map(p => ({ p, kind: 'follow_up' as const })),
  ]
  for (const { p, kind } of queue) {
    if (budget <= 0) break
    // Safety stop: several failures in one run (rejected addresses, a sending problem) and the rest wait for a person.
    if (failed.length >= 3) break
    if (!canEmail(p)) continue
    budget--
    if (dry) { sent.push(`${kind}: ${p.business_name} <${p.email}>`); continue }
    const r = await sendOutreachEmail(p, kind)
    const now = new Date().toISOString()
    if (r.ok) {
      sent.push(`${kind}: ${p.business_name}`)
      await db.from('outreach_prospects').update(kind === 'first'
        ? { status: 'sent', sent_at: now, last_error: null, updated_at: now }
        : { status: 'followed_up', followed_up_at: now, last_error: null, updated_at: now }).eq('id', p.id)
    } else {
      failed.push(`${p.business_name}: ${r.error}`)
      await db.from('outreach_prospects').update({ last_error: r.error, updated_at: now }).eq('id', p.id)
    }
  }
  return NextResponse.json({ success: failed.length === 0, dry, sent, failed })
}

export const GET = withJobRun('outreach-send', handleGet)
