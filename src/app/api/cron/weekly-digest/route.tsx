import { NextResponse } from 'next/server'
import { createPublicClient } from '@/lib/supabase/public'
import { createAdminClient } from '@/lib/supabase/admin'
import { resend, FROM_EMAIL } from '@/lib/resend'
import { fetchOnSaleThisWeek, fetchEventsThisWeek } from '@/lib/eventPools'
import { fetchWestEndShows } from '@/lib/showPool'
import { fmtOnSaleLabel } from '@/lib/on-sale'
import { chunkRecipients, buildUnsubscribeLink } from '@/lib/newsletterContent'
import {
  digestWeekKey, digestSubject, hasEnoughContent, resolveDigestMode, resolvePreviewRecipient,
  digestMarkerSubject, limitDigestContent, type DigestContent,
} from '@/lib/weeklyDigest'
import WeeklyDigestEmail from '@/emails/WeeklyDigestEmail'
import type { Artist } from '@/lib/types/database'

export const maxDuration = 120
export const dynamic = 'force-dynamic'

// Weekly digest (Mondays 07:00 UTC — see vercel.json).
//
// SAFE BY DEFAULT: unless the DIGEST_AUTO_SEND env var is exactly "true" this
// only emails ONE preview address (DIGEST_PREVIEW_EMAIL, default
// hello@theshowfinder.com) and never touches the subscriber list. In live mode
// it requires CRON_SECRET to be set, skips weeks with too little content, and
// records a row in `newsletters` so a second run in the same week can't send
// twice (pass ?force=1 to override, e.g. after a failed run).
export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const mode = resolveDigestMode(process.env.DIGEST_AUTO_SEND)
  if (mode === 'live' && !cronSecret) {
    return NextResponse.json({ error: 'Refusing to send to subscribers: CRON_SECRET is not set' }, { status: 500 })
  }
  const force = new URL(request.url).searchParams.get('force') === '1'

  const weekKey = digestWeekKey()
  const marker = digestMarkerSubject(weekKey)
  const admin = createAdminClient()

  if (mode === 'live' && !force) {
    const { data: already } = await admin
      .from('newsletters').select('id').eq('subject', marker).eq('status', 'sent').limit(1)
    if (already && already.length > 0) {
      return NextResponse.json({ success: true, skipped: 'already sent this week', weekKey })
    }
  }

  // ── Content ─────────────────────────────────────────────────────────────
  const supabase = createPublicClient()
  const [{ data: artists }, events, shows] = await Promise.all([
    supabase.from('artists').select('*') as unknown as Promise<{ data: Artist[] | null }>,
    fetchEventsThisWeek(supabase, { limit: 6 }),
    fetchWestEndShows(supabase),
  ])
  const groups = await fetchOnSaleThisWeek(supabase, artists ?? [], { limit: 6 })

  const content = limitDigestContent({
    onSale: groups.map(g => ({
      name: g.artistName,
      slug: g.slug,
      dateCount: g.events.length,
      whenLabel: fmtOnSaleLabel(g.onsale_date),
      saleType: g.saleType,
    })),
    events: events.map(e => ({
      title: e.title, slug: e.slug, startDate: e.start_date,
      venueName: e.venue_name, venueCity: e.venue_city,
    })),
    // Shows with the most upcoming performances are the ones a reader can
    // actually book, so they lead.
    shows: [...shows].sort((a, b) => b.dateCount - a.dateCount).map(s => ({
      title: s.title, venueName: s.venueName, slug: s.slug, nextDate: s.nextDate,
    })),
  } satisfies DigestContent)

  if (!hasEnoughContent(content)) {
    return NextResponse.json({ success: true, skipped: 'not enough content this week', weekKey })
  }

  const subject = digestSubject(content)

  // ── Recipients ──────────────────────────────────────────────────────────
  let recipients: string[]
  if (mode === 'live') {
    const { data: rows } = await admin.from('subscribers').select('email').is('unsubscribed_at', null)
    recipients = (rows ?? []).map(r => r.email as string)
  } else {
    recipients = [resolvePreviewRecipient(process.env.DIGEST_PREVIEW_EMAIL)]
  }
  if (recipients.length === 0) {
    return NextResponse.json({ success: true, skipped: 'no recipients', weekKey, mode })
  }

  // Lock first (live mode) so an overlapping second run can't double-send.
  let markerId: string | null = null
  if (mode === 'live') {
    const { data: row } = await admin
      .from('newsletters')
      .insert({ subject: marker, intro: subject, status: 'sent' })
      .select('id').single()
    markerId = (row as { id: string } | null)?.id ?? null
  }

  let sent = 0
  for (const batch of chunkRecipients(recipients)) {
    const messages = batch.map(email => ({
      from: FROM_EMAIL,
      to: email,
      subject: mode === 'preview' ? `[PREVIEW] ${subject}` : subject,
      react: <WeeklyDigestEmail content={content} weekKey={weekKey} unsubscribeUrl={buildUnsubscribeLink(email)} />,
    }))
    try {
      const { data, error } = await resend.batch.send(messages)
      if (error) console.error('[digest] batch send error:', JSON.stringify(error))
      else sent += data?.data?.length ?? 0
    } catch (err) {
      console.error('[digest] batch send threw:', err)
    }
  }

  if (markerId) {
    if (sent === 0) {
      // Nothing went out — drop the lock so the next run can retry.
      await admin.from('newsletters').delete().eq('id', markerId)
    } else {
      await admin.from('newsletters').update({ sent_at: new Date().toISOString(), sent_count: sent }).eq('id', markerId)
    }
  }

  console.log(`[digest] ${mode} ${weekKey}: sent ${sent}/${recipients.length} — "${subject}"`)
  return NextResponse.json({ success: true, mode, weekKey, subject, recipients: recipients.length, sent, sections: {
    onSale: content.onSale.length, events: content.events.length, shows: content.shows.length,
  } })
}
