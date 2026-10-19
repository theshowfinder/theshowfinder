import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resend, FROM_EMAIL } from '@/lib/resend'
import { buildFollowAlerts, LOOKBACK_DAYS, type FollowRow, type NewShow } from '@/lib/follows'
import { buildFollowAlertEmail } from '@/lib/followEmail'
import { buildUnsubscribeLink } from '@/lib/newsletterContent'

export const maxDuration = 60
export const dynamic = 'force-dynamic'

const MAX_EMAILS_PER_RUN = 150
const PAGE = 1000
const MAX_EVENT_PAGES = 5

interface FollowDbRow { id: string; email: string; kind: 'artist' | 'venue'; target_id: string; last_notified_at: string }
interface NameRow { id: string; name: string; slug: string }
interface EventDbRow {
  id: string
  slug: string
  title: string
  start_date: string
  created_at: string
  venue_id: string | null
  venue: { name: string | null; city: string | null } | null
  event_artists: { artist_id: string }[] | null
}

// Daily: for everyone following an artist or venue, email the shows added since
// we last looked (one email per address). A follower's clock only moves forward
// once their email went out, so a failed or deferred send is retried next run.
export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const runISO = new Date().toISOString()
  const db = createAdminClient()

  const { data: followData, error: followError } = await db
    .from('follows')
    .select('id, email, kind, target_id, last_notified_at')
    .is('unsubscribed_at', null)
    .limit(10000)
  if (followError) {
    console.error('[follow-alerts] query failed (has migration 051 been run?)', followError.message)
    return NextResponse.json({ error: followError.message }, { status: 500 })
  }
  const followRows = (followData ?? []) as FollowDbRow[]
  if (followRows.length === 0) return NextResponse.json({ follows: 0, emails: 0, sent: 0, failed: 0 })

  const artistIds = [...new Set(followRows.filter(f => f.kind === 'artist').map(f => f.target_id))]
  const venueIds = [...new Set(followRows.filter(f => f.kind === 'venue').map(f => f.target_id))]
  const names = new Map<string, NameRow>()
  for (let i = 0; i < artistIds.length; i += 200) {
    const { data } = await db.from('artists').select('id, name, slug').in('id', artistIds.slice(i, i + 200))
    for (const r of (data ?? []) as NameRow[]) names.set(`artist:${r.id}`, r)
  }
  for (let i = 0; i < venueIds.length; i += 200) {
    const { data } = await db.from('venues').select('id, name, slug').in('id', venueIds.slice(i, i + 200))
    for (const r of (data ?? []) as NameRow[]) names.set(`venue:${r.id}`, r)
  }

  const lookbackISO = new Date(Date.now() - LOOKBACK_DAYS * 86_400_000).toISOString()
  const follows: FollowRow[] = []
  for (const f of followRows) {
    const n = names.get(`${f.kind}:${f.target_id}`)
    if (!n) continue // artist or venue no longer exists
    follows.push({
      id: f.id, email: f.email, kind: f.kind, targetId: f.target_id, targetName: n.name, targetSlug: n.slug,
      floorISO: f.last_notified_at > lookbackISO ? f.last_notified_at : lookbackISO,
    })
  }

  // Recently added shows still to come (the daily sync creates them).
  const shows: NewShow[] = []
  for (let page = 0; page < MAX_EVENT_PAGES; page++) {
    const { data, error } = await db
      .from('events')
      .select('id, slug, title, start_date, created_at, venue_id, venue:venues(name, city), event_artists(artist_id)')
      .gt('created_at', lookbackISO)
      .lte('created_at', runISO)
      .gte('start_date', runISO)
      .in('status', ['upcoming', 'on_sale'])
      .order('created_at', { ascending: true })
      .range(page * PAGE, page * PAGE + PAGE - 1)
    if (error) {
      console.error('[follow-alerts] events query failed', error.message)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    const rows = (data ?? []) as unknown as EventDbRow[]
    for (const e of rows) {
      shows.push({
        id: e.id, slug: e.slug, title: e.title, startISO: e.start_date, createdISO: e.created_at,
        venueId: e.venue_id, venueName: e.venue?.name ?? null, city: e.venue?.city ?? null,
        artistIds: (e.event_artists ?? []).map(a => a.artist_id),
      })
    }
    if (rows.length < PAGE) break
  }

  const batches = buildFollowAlerts(follows, shows, runISO)
  const toSend = batches.slice(0, MAX_EMAILS_PER_RUN)
  const deferred = new Set(batches.slice(MAX_EMAILS_PER_RUN).map(b => b.email))

  let sent = 0
  let failed = 0
  const failedEmails = new Set<string>()
  for (const batch of toSend) {
    const mail = buildFollowAlertEmail(batch, buildUnsubscribeLink(batch.email))
    try {
      const { error: sendError } = await resend.emails.send({
        from: FROM_EMAIL, to: batch.email, subject: mail.subject, html: mail.html, text: mail.text,
      })
      if (sendError) throw new Error(JSON.stringify(sendError))
      sent++
    } catch (err) {
      failed++
      failedEmails.add(batch.email)
      console.error('[follow-alerts] send failed', err)
    }
  }

  // Move everyone's clock forward except addresses whose email failed or was
  // deferred to the next run.
  const advance = follows
    .filter(f => {
      const e = f.email.trim().toLowerCase()
      return !failedEmails.has(e) && !deferred.has(e)
    })
    .map(f => f.id)
  for (let i = 0; i < advance.length; i += 500) {
    const { error } = await db.from('follows').update({ last_notified_at: runISO }).in('id', advance.slice(i, i + 500))
    if (error) console.error('[follow-alerts] could not advance follows', error.message)
  }

  return NextResponse.json({ follows: follows.length, newShows: shows.length, emails: batches.length, sent, failed, deferred: deferred.size })
}
