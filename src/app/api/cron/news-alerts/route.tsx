import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resend, FROM_EMAIL } from '@/lib/resend'
import { chunkRecipients, buildUnsubscribeLink } from '@/lib/newsletterContent'
import { resolveDigestMode, resolvePreviewRecipient } from '@/lib/weeklyDigest'
import { storyImage, type NewsStory } from '@/lib/newsStoriesData'
import { saleChip } from '@/components/StoryCard'
import NewsAlertEmail, { type AlertStory } from '@/emails/NewsAlertEmail'
import { withJobRun } from '@/lib/jobRuns'

export const maxDuration = 120
export const dynamic = 'force-dynamic'

// "Just announced" alerts: after each new-show detection (05:00 / 17:00 UTC, this runs 20 minutes later) the
// newest headline stories that have not been sent yet go to everyone on the list, biggest first, at most 5 per
// email. Until NEWS_ALERTS_AUTO_SEND=true is set in Vercel it only sends a [PREVIEW] copy to DIGEST_PREVIEW_EMAIL
// (default hello@theshowfinder.com), so the format can be checked before subscribers get it.
const MAX_STORIES = 5
const FRESH_HOURS = 26

async function handleGet(request: Request) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const mode = resolveDigestMode(process.env.NEWS_ALERTS_AUTO_SEND)
  const sentColumn = mode === 'live' ? 'alerted_at' : 'alert_preview_at'
  const db = createAdminClient()

  const since = new Date(Date.now() - FRESH_HOURS * 3_600_000).toISOString()
  const { data, error } = await db
    .from('news_stories')
    .select('id,slug,artist_name,story_type,headline,standfirst,image_url,image_url_large,facts,score,published_at')
    .eq('status', 'published')
    .eq('is_headline', true)
    .is(sentColumn, null)
    .gte('published_at', since)
    .order('score', { ascending: false })
    .limit(MAX_STORIES)
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  const stories = (data ?? []) as unknown as NewsStory[]
  if (!stories.length) return NextResponse.json({ success: true, mode, skipped: 'no new headline stories' })

  const items: AlertStory[] = stories.map(s => ({
    slug: s.slug,
    headline: s.headline,
    standfirst: s.standfirst,
    image: storyImage(s, true),
    saleLabel: saleChip(s)?.text ?? null,
  }))
  const subject = stories.length > 1 ? `${items[0].headline} (+${stories.length - 1} more)` : items[0].headline

  let recipients: string[]
  if (mode === 'live') {
    const { data: rows } = await db.from('subscribers').select('email').is('unsubscribed_at', null)
    recipients = [...new Set((rows ?? []).map(r => String(r.email)))]
  } else {
    recipients = [resolvePreviewRecipient(process.env.DIGEST_PREVIEW_EMAIL)]
  }
  if (!recipients.length) return NextResponse.json({ success: true, mode, skipped: 'no recipients' })

  let sent = 0
  for (const batch of chunkRecipients(recipients)) {
    const messages = batch.map(email => ({
      from: FROM_EMAIL,
      to: email,
      subject: mode === 'preview' ? `[PREVIEW] ${subject}` : subject,
      react: <NewsAlertEmail stories={items} unsubscribeUrl={buildUnsubscribeLink(email)} />,
    }))
    try {
      const { data: res, error: sendErr } = await resend.batch.send(messages)
      if (sendErr) console.error('[news-alerts] batch send error:', JSON.stringify(sendErr))
      else sent += res?.data?.length ?? 0
    } catch (err) {
      console.error('[news-alerts] batch send threw:', err)
    }
  }

  if (sent > 0) {
    await db.from('news_stories').update({ [sentColumn]: new Date().toISOString() }).in('id', stories.map(s => s.id))
  }
  console.log(`[news-alerts] ${mode}: sent ${sent}/${recipients.length} — "${subject}"`)
  return NextResponse.json({ success: true, mode, subject, stories: items.map(i => i.slug), recipients: recipients.length, sent })
}

export const GET = withJobRun('news-alerts', handleGet)
