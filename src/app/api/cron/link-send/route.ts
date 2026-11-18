import { NextResponse } from 'next/server'
import { withJobRun } from '@/lib/jobRuns'
import { LINK_FOLLOW_UP_DAYS, LINK_ZOHO_PER_DAY, inSendingHours, linkResendLimit } from '@/lib/linkOutreach'
import { LINK_SELECT, linkDb, sendLinkEmail, type LinkChannel } from '@/lib/linkOutreachSend'
import { zohoConfigured } from '@/lib/outreachSend'

export const maxDuration = 60
export const dynamic = 'force-dynamic'

// Backlink outreach, sending side (vercel.json: every 10 minutes, weekdays). Only emails Chris approved in
// /admin/backlinks go, 09:00-17:00 UK. Two channels: Resend, whose daily limit grows each weekday as reputation builds
// (linkResendLimit: 30 → 150), and Chris's Zoho mailbox (up to LINK_ZOHO_PER_DAY). Both obey the outreach brake
// (outreach_settings): a spam complaint or 3 bounces in a day pause Resend; a Zoho refusal pauses Zoho for the day.
// One follow-up goes LINK_FOLLOW_UP_DAYS after the first email, on the same channel. ?dry=1 lists only; ?anytime=1 ignores the hours.
const RESEND_PER_RUN = 4
const ZOHO_PER_RUN = 1
type Loose = any // eslint-disable-line @typescript-eslint/no-explicit-any

async function handleGet(request: Request) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || request.headers.get('authorization') !== `Bearer ${cronSecret}`) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const params = new URL(request.url).searchParams
  const dry = params.get('dry') === '1'
  if (params.get('anytime') !== '1' && !inSendingHours()) return NextResponse.json({ success: true, dry, sent: [], note: 'outside sending hours (weekdays 09:00-17:00 UK)' })
  const db = linkDb()
  const now = Date.now()
  const today = new Date(new Date().toISOString().slice(0, 10)).toISOString()

  const [{ data: brake }, { data: first }, { data: todays }] = await Promise.all([
    db.from('outreach_settings').select('resend_paused_until, zoho_paused_until').eq('id', 1).maybeSingle(),
    db.from('link_prospects').select('sent_at').not('sent_at', 'is', null).order('sent_at').limit(1),
    db.from('link_prospects').select('sent_via, sent_at, followed_up_at').or(`sent_at.gte.${today},followed_up_at.gte.${today}`),
  ])
  const used: Record<LinkChannel, number> = { resend: 0, zoho: 0 }
  for (const r of (todays ?? []) as Loose[]) {
    const ch: LinkChannel = r.sent_via === 'zoho' ? 'zoho' : 'resend'
    if (r.sent_at >= today) used[ch]++
    if (r.followed_up_at && r.followed_up_at >= today) used[ch]++
  }
  const open = (t: string | null | undefined) => !t || Date.parse(t) <= now
  const room: Record<LinkChannel, number> = {
    resend: open(brake?.resend_paused_until) ? Math.min(RESEND_PER_RUN, linkResendLimit(first?.[0]?.sent_at ?? null) - used.resend) : 0,
    zoho: open(brake?.zoho_paused_until) && zohoConfigured() ? Math.min(ZOHO_PER_RUN, LINK_ZOHO_PER_DAY - used.zoho) : 0,
  }
  const sent: Loose[] = [], failed: Loose[] = []

  const send = async (r: Loose, step: 'first' | 'follow_up', channel: LinkChannel) => {
    if (dry) { sent.push({ name: r.name, step, channel }); room[channel]--; return }
    const res = await sendLinkEmail(r, step, channel)
    const at = new Date().toISOString()
    if (res.ok) {
      await db.from('link_prospects').update(step === 'first'
        ? { status: 'sent', sent_at: at, sent_via: channel, resend_id: channel === 'resend' ? res.id ?? null : null, updated_at: at }
        : { status: 'followed_up', followed_up_at: at, updated_at: at }).eq('id', r.id)
      sent.push({ name: r.name, step, channel }); room[channel]--
    } else {
      await db.from('link_prospects').update({ ...(step === 'first' && !res.fatal ? { status: 'failed' } : {}), last_error: res.error, updated_at: at }).eq('id', r.id)
      failed.push({ name: r.name, channel, error: res.error })
      if (channel === 'zoho' && res.fatal) {
        await db.from('outreach_settings').update({ zoho_paused_until: new Date(now + 20 * 3_600_000).toISOString(), pause_reason: `Zoho refused a send: ${String(res.error).slice(0, 200)}`, updated_at: at }).eq('id', 1)
        room.zoho = 0
      }
    }
  }

  // Follow-ups first, on the channel the first email went from.
  const due = new Date(now - LINK_FOLLOW_UP_DAYS * 86_400_000).toISOString()
  const { data: followUps } = await db.from('link_prospects').select(`${LINK_SELECT}, sent_via`).eq('status', 'sent').lt('sent_at', due).is('followed_up_at', null).order('sent_at').limit(10)
  for (const r of (followUps ?? []) as Loose[]) {
    const ch: LinkChannel = r.sent_via === 'zoho' ? 'zoho' : 'resend'
    if (room[ch] > 0) await send(r, 'follow_up', ch)
  }
  // Then approved first emails, Resend and Zoho in turn.
  const want = Math.max(0, room.resend) + Math.max(0, room.zoho)
  if (want > 0) {
    const { data: approved } = await db.from('link_prospects').select(LINK_SELECT).eq('status', 'approved').order('approved_at').limit(want)
    for (const r of (approved ?? []) as Loose[]) {
      const ch: LinkChannel | null = room.zoho > 0 && (room.resend <= 0 || sent.length % 4 === 3) ? 'zoho' : room.resend > 0 ? 'resend' : null
      if (!ch) break
      await send(r, 'first', ch)
    }
  }
  return NextResponse.json({ success: true, dry, used, room, sent, failed })
}

export const GET = withJobRun('link-send', handleGet)
