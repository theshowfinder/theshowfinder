import { NextResponse } from 'next/server'
import { withJobRun } from '@/lib/jobRuns'
import { createAdminClient } from '@/lib/supabase/admin'
import { resend } from '@/lib/resend'
import { inSendingHours } from '@/lib/linkOutreach'
import { buildTicketEmail, TICKET_OUTREACH_PER_DAY, TICKET_FOLLOW_UP_DAYS, SITE } from '@/lib/ticketOutreach'
import { ticketsTestMode, ticketsStripeReady } from '@/lib/ticketPayments'

export const maxDuration = 60
export const dynamic = 'force-dynamic'

// Ticket-selling outreach, sending side (vercel.json: every 20 minutes, weekdays). Sends organisers Chris approved on
// /admin/organisers, 09:00-17:00 UK, up to TICKET_OUTREACH_PER_DAY a day (first emails + follow-ups), through Resend on
// the outreach subdomain. Obeys the outreach brake (a spam complaint or bounces pause Resend outreach). The email only
// offers paid ticket sales once Stripe is live. ?dry=1 lists only; ?anytime=1 ignores the hours.
const PER_RUN = 2
type Loose = any // eslint-disable-line @typescript-eslint/no-explicit-any
const SELECT = 'id, name, city, email, sample_event, sample_venue, events_seen, unsubscribe_token, sent_at, status'

async function send(o: Loose, step: 'first' | 'follow_up', paidLive: boolean): Promise<{ ok: boolean; id?: string; error?: string }> {
  const { subject, text } = buildTicketEmail(o, step, paidLive)
  const from = process.env.OUTREACH_FROM_ADDRESS ? `Chris at TheShowFinder <${process.env.OUTREACH_FROM_ADDRESS}>` : 'Chris at TheShowFinder <partners@theshowfinder.com>'
  const { data, error } = await resend.emails.send({
    from, to: o.email, replyTo: 'hello@theshowfinder.com', subject, text,
    headers: { 'List-Unsubscribe': `<${SITE}/unsubscribe/${o.unsubscribe_token}>, <mailto:hello@theshowfinder.com?subject=unsubscribe>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
    tags: [{ name: 'kind', value: 'ticket_outreach' }],
  })
  return error ? { ok: false, error: JSON.stringify(error).slice(0, 300) } : { ok: true, id: data?.id }
}

async function handleGet(request: Request) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || request.headers.get('authorization') !== `Bearer ${cronSecret}`) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const params = new URL(request.url).searchParams
  const dry = params.get('dry') === '1'
  if (params.get('anytime') !== '1' && !inSendingHours()) return NextResponse.json({ success: true, dry, sent: [], note: 'outside sending hours (weekdays 09:00-17:00 UK)' })
  const db = createAdminClient() as Loose
  const { data: brake } = await db.from('outreach_settings').select('resend_paused_until').eq('id', 1).maybeSingle()
  if (brake?.resend_paused_until && Date.parse(brake.resend_paused_until) > Date.now()) return NextResponse.json({ success: true, dry, sent: [], note: 'outreach brake is on' })
  const today = new Date(new Date().toISOString().slice(0, 10)).toISOString()
  const [{ count: a }, { count: b }] = await Promise.all([
    db.from('organiser_prospects').select('id', { count: 'exact', head: true }).gte('sent_at', today),
    db.from('organiser_prospects').select('id', { count: 'exact', head: true }).gte('followed_up_at', today),
  ])
  let room = Math.min(PER_RUN, TICKET_OUTREACH_PER_DAY - (a ?? 0) - (b ?? 0))
  const paidLive = ticketsStripeReady() && !ticketsTestMode()
  const sent: Loose[] = [], failed: Loose[] = []
  if (room <= 0) return NextResponse.json({ success: true, dry, sent, note: 'daily limit reached' })

  const due = new Date(Date.now() - TICKET_FOLLOW_UP_DAYS * 86_400_000).toISOString()
  const { data: follow } = await db.from('organiser_prospects').select(SELECT).eq('status', 'contacted').lt('sent_at', due).is('followed_up_at', null).not('email', 'is', null).order('sent_at').limit(room)
  const { data: first } = await db.from('organiser_prospects').select(SELECT).eq('status', 'approved').not('email', 'is', null).order('approved_at').limit(room)
  const queue: Array<[Loose, 'first' | 'follow_up']> = [...((follow ?? []) as Loose[]).map(o => [o, 'follow_up'] as [Loose, 'follow_up']), ...((first ?? []) as Loose[]).map(o => [o, 'first'] as [Loose, 'first'])]
  for (const [o, step] of queue) {
    if (room <= 0) break
    if (dry) { sent.push({ name: o.name, step }); room--; continue }
    const r = await send(o, step, paidLive)
    const now = new Date().toISOString()
    if (r.ok) {
      await db.from('organiser_prospects').update(step === 'first' ? { status: 'contacted', sent_at: now, sent_via: 'resend', resend_id: r.id ?? null } : { status: 'followed_up', followed_up_at: now }).eq('id', o.id)
      sent.push({ name: o.name, step }); room--
    } else { await db.from('organiser_prospects').update({ last_error: r.error }).eq('id', o.id); failed.push({ name: o.name, error: r.error }) }
  }
  return NextResponse.json({ success: true, dry, paidLive, sent, failed })
}

export const GET = withJobRun('ticket-outreach', handleGet)
