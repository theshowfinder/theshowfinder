import { fetchAllArtists } from '@/lib/allArtists'
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
  digestMarkerSubject, limitDigestContent, groupRecipientsByCity, resolveCityName, hasEnoughCityEvents,
  type DigestContent, type DigestEventItem,
} from '@/lib/weeklyDigest'
import { CITIES } from '@/lib/cities'
import WeeklyDigestEmail from '@/emails/WeeklyDigestEmail'
import { withJobRun } from '@/lib/jobRuns'

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
//
// Subscribers who signed up with a city (subscribers.city) receive a city-first
// digest: local on-sale opportunities and events happening in that city. If a
// city has no matching content that week, the national digest is used as a
// graceful fallback. Subscribers without a city receive the national version.
// Preview mode: add ?city=Manchester to preview a city's version.
async function handleGet(request: Request) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
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
    fetchAllArtists(supabase).then(data => ({ data })),
    fetchEventsThisWeek(supabase, { limit: 6 }),
    fetchWestEndShows(supabase),
  ])
  const groups = await fetchOnSaleThisWeek(supabase, artists ?? [], { limit: 6 })

  const toItems = (rows: typeof events): DigestEventItem[] => rows.map(e => ({
    title: e.title, slug: e.slug, startDate: e.start_date,
    venueName: e.venue_name, venueCity: e.venue_city,
  }))

  const nationalContent = limitDigestContent({
    onSale: groups.map(g => ({
      name: g.artistName,
      slug: g.slug,
      dateCount: g.events.length,
      whenLabel: fmtOnSaleLabel(g.onsale_date),
      saleType: g.saleType,
    })),
    events: toItems(events),
    // Shows with the most upcoming performances are the ones a reader can
    // actually book, so they lead.
    shows: [...shows].sort((a, b) => b.dateCount - a.dateCount).map(s => ({
      title: s.title, venueName: s.venueName, slug: s.slug, nextDate: s.nextDate,
    })),
  } satisfies DigestContent)

  if (!hasEnoughContent(nationalContent)) {
    return NextResponse.json({ success: true, skipped: 'not enough content this week', weekKey })
  }

  // One city's version: its own shows when there are enough, else the national list.
  const cityNames = CITIES.map(c => c.name)
  const cityContentCache = new Map<string, DigestContent>()
  async function contentFor(city: string | null): Promise<DigestContent> {
    if (!city) return nationalContent
    const cached = cityContentCache.get(city)
    if (cached) return cached
    const [cityGroups, cityRows] = await Promise.all([
      fetchOnSaleThisWeek(supabase, artists ?? [], { city, limit: 6 }),
      fetchEventsThisWeek(supabase, { city, limit: 6 }),
    ])
    const cityEvents = toItems(cityRows)
    const cityContent = limitDigestContent({
      onSale: cityGroups.map(g => ({
        name: g.artistName,
        slug: g.slug,
        dateCount: g.events.length,
        whenLabel: fmtOnSaleLabel(g.onsale_date),
        saleType: g.saleType,
      })),
      events: cityEvents,
      shows: [],
      cityName: city,
    } satisfies DigestContent)
    // Keep the email city-relevant whenever there is anything local to say;
    // only fall back to the national digest when the city has no content at all.
    const content = cityContent.onSale.length + cityContent.events.length > 0
      ? cityContent
      : nationalContent
    cityContentCache.set(city, content)
    return content
  }

  // ── Recipients ──────────────────────────────────────────────────────────
  interface SendGroup { city: string | null; emails: string[] }
  let sendGroups: SendGroup[]
  if (mode === 'live') {
    const { data: rows } = await admin.from('subscribers').select('email, city').is('unsubscribed_at', null)
    sendGroups = groupRecipientsByCity(
      (rows ?? []).map(r => ({ email: r.email as string, city: (r.city as string | null) ?? null })),
      cityNames,
    )
  } else {
    const previewCity = resolveCityName(new URL(request.url).searchParams.get('city'), cityNames)
    sendGroups = [{ city: previewCity, emails: [resolvePreviewRecipient(process.env.DIGEST_PREVIEW_EMAIL)] }]
  }
  const totalRecipients = sendGroups.reduce((n, g) => n + g.emails.length, 0)
  if (totalRecipients === 0) {
    return NextResponse.json({ success: true, skipped: 'no recipients', weekKey, mode })
  }

  const subject = digestSubject(nationalContent)

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
  const cityVersions: string[] = []
  for (const group of sendGroups) {
    const content = await contentFor(group.city)
    if (content.cityName) cityVersions.push(content.cityName)
    for (const batch of chunkRecipients(group.emails)) {
      const messages = batch.map(email => ({
        from: FROM_EMAIL,
        to: email,
        subject: mode === 'preview'   ? `[PREVIEW] ${digestSubject(content)}`   : digestSubject(content),
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
  }

  if (markerId) {
    if (sent === 0) {
      // Nothing went out — drop the lock so the next run can retry.
      await admin.from('newsletters').delete().eq('id', markerId)
    } else {
      await admin.from('newsletters').update({ sent_at: new Date().toISOString(), sent_count: sent }).eq('id', markerId)
    }
  }

  console.log(`[digest] ${mode} ${weekKey}: sent ${sent}/${totalRecipients} — "${subject}" (city versions: ${cityVersions.join(', ') || 'none'})`)
  return NextResponse.json({ success: true, mode, weekKey, subject, recipients: totalRecipients, sent, cityVersions, sections: {
    onSale: nationalContent.onSale.length, events: nationalContent.events.length, shows: nationalContent.shows.length,
  } })
}

export const GET = withJobRun('weekly-digest', handleGet)
