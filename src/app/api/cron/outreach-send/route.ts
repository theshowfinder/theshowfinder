import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { withJobRun } from '@/lib/jobRuns'
import { canEmail, subjectVariantFor, looksLikeChain, spreadAcrossCities, DAILY_LIMIT, FOLLOW_UP_AFTER_DAYS, NO_RESPONSE_AFTER_DAYS, type Prospect } from '@/lib/outreach'
import { sendOutreachEmail } from '@/lib/outreachSend'
import { loadOutreachShow } from '@/lib/outreachShow'
import { fetchAllPages } from '@/lib/pagedFetch'

export const maxDuration = 60
export const dynamic = 'force-dynamic'

// Advertiser outreach sender: weekday mornings, 10 an hour at 07:10, 08:10, 09:10 and 10:10 UK time (Chris, 9 Nov
// 2026), never more than DAILY_LIMIT a day. vercel.json runs it 06:10–10:10 UTC and a run outside 07:00–10:59 UK time
// does nothing, so it keeps to UK hours through the clock changes. first emails to businesses Chris approved, then one
// follow-up FOLLOW_UP_AFTER_DAYS later to anyone still at "sent" (not replied, interested, onboarding or opted out),
// and "No response" NO_RESPONSE_AFTER_DAYS after the first email. ?dry=1 lists only.
const PER_RUN = 10  // 4 morning runs x 10 = DAILY_LIMIT (40)
const UK_HOURS = { from: 7, to: 10 }

function ukHour(now = new Date()): number {
  return Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', hourCycle: 'h23' }).format(now))
}
type Loose = any // eslint-disable-line @typescript-eslint/no-explicit-any
const COLS = 'id, business_name, category, city, near_venue, distance_label, contact_name, email, company_type, status, ref_code, unsubscribe_token, sent_at, subject_variant'

/**
 * Every city takes turns (12 Nov 2026; it used to be "today's city" first), the cities we have emailed least so far
 * going first. Within a city: independents before chains, oldest first.
 */
function firstsInOrder(all: Prospect[], n: number, sentByCity: Map<string, number>): Prospect[] {
  const isChain = (r: Prospect) => looksLikeChain({ name: r.business_name, email: r.email })
  return spreadAcrossCities([...all.filter(r => !isChain(r)), ...all.filter(isChain)], n, sentByCity)
}

async function handleGet(request: Request) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const params = new URL(request.url).searchParams
  const dry = params.get('dry') === '1'
  const h = ukHour()
  if (params.get('anytime') !== '1' && (h < UK_HOURS.from || h > UK_HOURS.to)) {
    return NextResponse.json({ success: true, dry, sent: [], failed: [], note: `outside sending hours (UK ${h}:00; sends 07:00-10:59)` })
  }
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
  // All of the queue (paged: it can pass PostgREST's 1,000-row cap), and how many each city has had so far.
  const [firsts, sentRows, { data: follows }] = await Promise.all([
    fetchAllPages<Prospect>((from, to) => db.from('outreach_prospects').select(COLS).eq('status', 'approved').order('created_at').order('id').range(from, to)),
    fetchAllPages<{ city: string }>((from, to) => db.from('outreach_prospects').select('city').not('sent_at', 'is', null).order('id').range(from, to)),
    db.from('outreach_prospects').select(COLS).eq('status', 'sent').lte('sent_at', followBefore).order('sent_at').limit(budget),
  ])
  const sentByCity = new Map<string, number>()
  for (const r of sentRows) sentByCity.set(r.city, (sentByCity.get(r.city) ?? 0) + 1)
  const queue: Array<{ p: Prospect; kind: 'first' | 'follow_up' }> = [
    ...firstsInOrder(firsts, budget, sentByCity).map(p => ({ p, kind: 'first' as const })),
    ...((follows ?? []) as Prospect[]).map(p => ({ p, kind: 'follow_up' as const })),
  ]
  for (const { p, kind } of queue) {
    if (budget <= 0) break
    // Safety stop: several failures in one run (rejected addresses, a sending problem) and the rest wait for a person.
    if (failed.length >= 3) break
    if (!canEmail(p)) continue
    budget--
    if (dry) { sent.push(`${kind}: ${p.business_name} <${p.email}>`); continue }
    // First emails get an A/B subject (see outreachSubject), saved with sent_at so the follow-up replies to it.
    const variant = kind === 'first' ? subjectVariantFor(p.id) : null
    const show = await loadOutreachShow(db, p)
    const r = await sendOutreachEmail(variant ? { ...p, subject_variant: variant } : p, kind, show)
    const now = new Date().toISOString()
    if (r.ok) {
      sent.push(`${kind}: ${p.business_name}`)
      await db.from('outreach_prospects').update(kind === 'first'
        ? { status: 'sent', sent_at: now, subject_variant: variant, last_error: null, updated_at: now }
        : { status: 'followed_up', followed_up_at: now, last_error: null, updated_at: now }).eq('id', p.id)
    } else {
      failed.push(`${p.business_name}: ${r.error}`)
      await db.from('outreach_prospects').update({ last_error: r.error, updated_at: now }).eq('id', p.id)
    }
  }
  return NextResponse.json({ success: failed.length === 0, dry, sent, failed })
}

export const GET = withJobRun('outreach-send', handleGet)
