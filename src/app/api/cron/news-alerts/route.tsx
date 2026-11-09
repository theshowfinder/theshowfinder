import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resend, FROM_EMAIL, listUnsubscribeHeaders } from '@/lib/resend'
import { buildUnsubscribeLink } from '@/lib/newsletterContent'
import { resolveDigestMode, resolvePreviewRecipient } from '@/lib/weeklyDigest'
import { storyImage, type NewsStory } from '@/lib/newsStoriesData'
import { saleChip } from '@/components/StoryCard'
import NewsAlertEmail, { type AlertStory } from '@/emails/NewsAlertEmail'
import { planAlert, capReason, type AlertHistory, type AlertSubscriber, type PlannedStory } from '@/lib/newsAlertTargeting'
import { withJobRun } from '@/lib/jobRuns'

export const maxDuration = 120
export const dynamic = 'force-dynamic'

// "Just announced" alerts, 20 minutes after each new-show detection (05:00 / 17:00 UTC). Each subscriber gets the
// new stories that are about them (src/lib/newsAlertTargeting.ts): an act they follow or signed up from, a tour
// coming to their city or nearby, else only the biggest announcements. One a day, three a week, none on Mondays,
// and never the same story twice (subscriber_alerts, migration 112).
// Until NEWS_ALERTS_AUTO_SEND=true is set in Vercel this sends nothing to subscribers: it works out who would get
// what (in the run summary) and emails one [PREVIEW] copy to DIGEST_PREVIEW_EMAIL (default hello@theshowfinder.com).
const STORY_POOL = 40
const FRESH_HOURS = 26

type Row = NewsStory & { id: string; score: number }

function toAlertStory(p: PlannedStory<Row>): AlertStory {
  const s = p.story
  return { slug: s.slug, headline: s.headline, standfirst: s.standfirst, image: storyImage(s, true), saleLabel: saleChip(s)?.text ?? null, reason: p.reason === 'big' ? null : p.label }
}

function subjectFor(plan: PlannedStory<Row>[]): string {
  const lead = plan[0]
  const head = lead.reason === 'city' ? `${lead.label}: ${lead.story.headline}` : lead.story.headline
  return plan.length > 1 ? `${head} (+${plan.length - 1} more)` : head
}

const mask = (email: string) => email.replace(/^(.{2}).*(@.*)$/, '$1***$2')

async function handleGet(request: Request) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const mode = resolveDigestMode(process.env.NEWS_ALERTS_AUTO_SEND)
  const db = createAdminClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const loose = db as unknown as { from: (t: string) => any }
  const now = new Date()

  const since = new Date(now.getTime() - FRESH_HOURS * 3_600_000).toISOString()
  const { data, error } = await db
    .from('news_stories')
    .select('id,slug,artist_name,story_type,headline,standfirst,image_url,image_url_large,facts,score,published_at,alert_preview_at')
    .eq('status', 'published').eq('is_headline', true).gte('published_at', since)
    .order('score', { ascending: false }).limit(STORY_POOL)
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  const stories = ((data ?? []) as unknown as Array<Row & { alert_preview_at: string | null }>).map(s => ({ ...s, score: Number(s.score) || 0 }))
  if (!stories.length) return NextResponse.json({ success: true, mode, skipped: 'no new headline stories' })

  // Subscribers and what they told us.
  const { data: subRows } = await db.from('subscribers').select('email, city, interest').is('unsubscribed_at', null)
  const { data: followRows } = await loose.from('follows').select('email, target_id').eq('kind', 'artist').is('unsubscribed_at', null)
  const artistIds = [...new Set(((followRows ?? []) as Array<{ target_id: string }>).map(f => f.target_id))]
  const artistById = new Map<string, { slug: string; name: string }>()
  if (artistIds.length) {
    const { data: arts } = await db.from('artists').select('id, slug, name').in('id', artistIds)
    for (const a of (arts ?? []) as Array<{ id: string; slug: string; name: string }>) artistById.set(a.id, a)
  }
  const subs = new Map<string, AlertSubscriber>()
  const add = (email: string) => {
    const key = email.trim().toLowerCase()
    if (!subs.has(key)) subs.set(key, { email: key, city: null, actNames: [], artistSlugs: [] })
    return subs.get(key)!
  }
  for (const r of (subRows ?? []) as Array<{ email: string; city: string | null; interest: string | null }>) {
    const s = add(r.email)
    if (r.city) s.city = r.city
    if (r.interest) s.actNames.push(r.interest)
  }
  // Follows only count for people still on the list.
  for (const f of (followRows ?? []) as Array<{ email: string; target_id: string }>) {
    const s = subs.get(f.email.trim().toLowerCase())
    const a = artistById.get(f.target_id)
    if (s && a) { s.artistSlugs.push(a.slug); s.actNames.push(a.name) }
  }

  // What each person has had in the last week.
  const { data: histRows } = await loose.from('subscriber_alerts').select('email, story_ids, sent_at').gte('sent_at', new Date(now.getTime() - 8 * 86_400_000).toISOString())
  const history = new Map<string, AlertHistory>()
  for (const h of (histRows ?? []) as Array<{ email: string; story_ids: string[]; sent_at: string }>) {
    const e = history.get(h.email) ?? { sentAt: [], storyIds: new Set<string>() }
    e.sentAt.push(h.sent_at); for (const id of h.story_ids) e.storyIds.add(id)
    history.set(h.email, e)
  }

  const plans: Array<{ sub: AlertSubscriber; plan: PlannedStory<Row>[] }> = []
  const held: Record<string, number> = {}
  for (const sub of subs.values()) {
    const h = history.get(sub.email) ?? { sentAt: [], storyIds: new Set<string>() }
    const cap = capReason(h, now)
    if (cap) { held[cap] = (held[cap] ?? 0) + 1; continue }
    const plan = planAlert(sub, stories, h, now)
    if (plan.length) plans.push({ sub, plan })
  }
  const reasonCounts = plans.reduce<Record<string, number>>((acc, p) => { for (const x of p.plan) acc[x.reason] = (acc[x.reason] ?? 0) + 1; return acc }, {})
  const examples = plans.slice(0, 12).map(p => `${mask(p.sub.email)}${p.sub.city ? ` (${p.sub.city})` : ''}: ${p.plan.map(x => `${x.story.artist_name} [${x.reason}]`).join(', ')}`)

  if (mode === 'preview') {
    // One copy to the preview address: the richest personal email this run would send, else the big-news one.
    const fresh = stories.filter(s => !s.alert_preview_at)
    if (!fresh.length) return NextResponse.json({ success: true, mode, skipped: 'preview already sent for these stories', wouldEmail: plans.length, reasonCounts, held, examples })
    const best = [...plans].sort((a, b) => b.plan.filter(x => x.reason !== 'big').length - a.plan.filter(x => x.reason !== 'big').length)[0]
    const plan: PlannedStory<Row>[] = best?.plan ?? fresh.slice(0, 3).map(story => ({ story, reason: 'big' as const, label: 'Big announcement' }))
    if (!plan.length) return NextResponse.json({ success: true, mode, skipped: 'nothing anyone would get', wouldEmail: 0, held })
    const to = resolvePreviewRecipient(process.env.DIGEST_PREVIEW_EMAIL)
    const { error: sendErr } = await resend.emails.send({
      from: FROM_EMAIL, to, headers: listUnsubscribeHeaders(to),
      subject: `[PREVIEW${best ? ` as ${mask(best.sub.email)}` : ''}] ${subjectFor(plan)}`,
      react: <NewsAlertEmail stories={plan.map(toAlertStory)} unsubscribeUrl={buildUnsubscribeLink(to)} />,
    })
    if (!sendErr) await db.from('news_stories').update({ alert_preview_at: now.toISOString() }).in('id', fresh.map(s => s.id))
    return NextResponse.json({ success: !sendErr, mode, previewTo: to, wouldEmail: plans.length, reasonCounts, held, examples })
  }

  // Live: one personal email each.
  let sent = 0, failed = 0
  const sentStoryIds = new Set<string>()
  for (const { sub, plan } of plans) {
    try {
      const { error: sendErr } = await resend.emails.send({
        from: FROM_EMAIL, to: sub.email, headers: listUnsubscribeHeaders(sub.email),
        subject: subjectFor(plan),
        react: <NewsAlertEmail stories={plan.map(toAlertStory)} unsubscribeUrl={buildUnsubscribeLink(sub.email)} />,
      })
      if (sendErr) { failed++; console.error('[news-alerts] send error:', JSON.stringify(sendErr)); continue }
      sent++
      for (const p of plan) sentStoryIds.add(p.story.id)
      await loose.from('subscriber_alerts').insert({ email: sub.email, story_ids: plan.map(p => p.story.id), reasons: plan.map(p => p.reason) })
    } catch (err) {
      failed++; console.error('[news-alerts] send threw:', err)
    }
  }
  if (sentStoryIds.size) await db.from('news_stories').update({ alerted_at: now.toISOString() }).in('id', [...sentStoryIds]).is('alerted_at', null)
  console.log(`[news-alerts] live: ${sent} sent, ${failed} failed`)
  return NextResponse.json({ success: failed === 0 || sent > 0, mode, sent, failed, reasonCounts, held, examples })
}

export const GET = withJobRun('news-alerts', handleGet)
