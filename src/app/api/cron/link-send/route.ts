import { NextResponse } from 'next/server'
import { withJobRun } from '@/lib/jobRuns'
import { LINK_DAILY_LIMIT, LINK_FOLLOW_UP_DAYS, inSendingHours } from '@/lib/linkOutreach'
import { LINK_SELECT, linkDb, sendLinkEmail } from '@/lib/linkOutreachSend'

export const maxDuration = 60
export const dynamic = 'force-dynamic'

// Backlink outreach, sending side (vercel.json: every 20 minutes). Only emails Chris approved in /admin/backlinks go,
// on weekdays 09:00-17:00 UK, a few per run and at most LINK_DAILY_LIMIT a day (first emails + follow-ups). One
// follow-up goes LINK_FOLLOW_UP_DAYS after the first email if nobody replied (part of what was approved).
// ?dry=1 lists only; ?anytime=1 ignores the hours.
const PER_RUN = 3
type Loose = any // eslint-disable-line @typescript-eslint/no-explicit-any

async function handleGet(request: Request) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || request.headers.get('authorization') !== `Bearer ${cronSecret}`) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const params = new URL(request.url).searchParams
  const dry = params.get('dry') === '1'
  if (params.get('anytime') !== '1' && !inSendingHours()) return NextResponse.json({ success: true, dry, sent: [], note: 'outside sending hours (weekdays 09:00-17:00 UK)' })
  const db = linkDb()
  const today = new Date(new Date().toISOString().slice(0, 10)).toISOString()
  const [{ count: firsts }, { count: follows }] = await Promise.all([
    db.from('link_prospects').select('id', { count: 'exact', head: true }).gte('sent_at', today),
    db.from('link_prospects').select('id', { count: 'exact', head: true }).gte('followed_up_at', today),
  ])
  let room = Math.min(PER_RUN, LINK_DAILY_LIMIT - (firsts ?? 0) - (follows ?? 0))
  const sent: Loose[] = [], failed: Loose[] = []
  if (room <= 0) return NextResponse.json({ success: true, dry, sent, note: 'daily limit reached' })

  const due = new Date(Date.now() - LINK_FOLLOW_UP_DAYS * 86_400_000).toISOString()
  const { data: followUps } = await db.from('link_prospects').select(LINK_SELECT).eq('status', 'sent').lt('sent_at', due).is('followed_up_at', null).order('sent_at').limit(room)
  for (const r of (followUps ?? []) as Loose[]) {
    if (room <= 0) break
    if (dry) { sent.push({ name: r.name, step: 'follow_up' }); room--; continue }
    const res = await sendLinkEmail(r, 'follow_up')
    const now = new Date().toISOString()
    if (res.ok) { await db.from('link_prospects').update({ status: 'followed_up', followed_up_at: now, updated_at: now }).eq('id', r.id); sent.push({ name: r.name, step: 'follow_up' }); room-- }
    else { await db.from('link_prospects').update({ last_error: res.error, updated_at: now }).eq('id', r.id); failed.push({ name: r.name, error: res.error }) }
  }
  const { data: approved } = await db.from('link_prospects').select(LINK_SELECT).eq('status', 'approved').order('approved_at').limit(Math.max(room, 0))
  for (const r of (approved ?? []) as Loose[]) {
    if (room <= 0) break
    if (dry) { sent.push({ name: r.name, step: 'first' }); room--; continue }
    const res = await sendLinkEmail(r, 'first')
    const now = new Date().toISOString()
    if (res.ok) { await db.from('link_prospects').update({ status: 'sent', sent_at: now, updated_at: now }).eq('id', r.id); sent.push({ name: r.name, step: 'first' }); room-- }
    else { await db.from('link_prospects').update({ status: 'failed', last_error: res.error, updated_at: now }).eq('id', r.id); failed.push({ name: r.name, error: res.error }) }
  }
  return NextResponse.json({ success: true, dry, sent, failed })
}

export const GET = withJobRun('link-send', handleGet)
