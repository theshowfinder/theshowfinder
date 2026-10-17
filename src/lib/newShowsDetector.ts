import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { CITIES } from '@/lib/cities'
import { LIVE_EVENT_STATUSES } from '@/lib/eventPools'
import {
  type NewShowRow,
  type DraftNewsItem,
  NEW_SHOWS_WINDOW_DAYS,
  buildCityRoundups,
  buildArtistAdditions,
  artistSlugFromDraftUrl,
  isoWeekKey,
} from './newShows.ts'
import {
  NEWS_HUB_SLUG,
  NEWS_HUB_NAME,
  buildPublishUpsertRows,
  buildPublishCandidatePatch,
  type CandidateCityTarget,
} from './newsPublishing.ts'

// Detect shows added to our database in the last week and turn them into news.
// Items that clear a quality bar (a tour across several cities; a city with a
// real spread of new shows) are published straight away to the News page / that
// city's news section, so those pages stay fresh without anyone approving
// anything. The rest wait as PENDING drafts in the News Inbox. Everything is
// built from our own listings, and any published item can still be unpublished
// from /admin/news.
//
// Safe to run repeatedly: city roundups are keyed by ISO week and an artist
// already drafted in the last 7 days is skipped. Pending auto-drafts that no
// longer qualify are rejected so the inbox does not fill with stale items.

const AUTO_CREATED_BY = 'auto:new-shows'

interface EventRow {
  id: string
  title: string
  category: string | null
  start_date: string
  created_at: string
  venue: { name: string | null; city: string | null; capacity: number | null } | null
  event_artists: {
    is_headliner: boolean | null
    artist: { id: string; name: string; slug: string; created_at: string } | null
  }[] | null
}

export interface DetectResult {
  scannedEvents: number
  inserted: number
  published: number
  refreshed: number
  rejectedStale: number
  skippedExisting: number
}

function flatten(events: EventRow[]): NewShowRow[] {
  return events.map(e => {
    const eas = e.event_artists ?? []
    const head = eas.find(x => x.is_headliner && x.artist) ?? eas.find(x => x.artist)
    return {
      event_id: e.id,
      title: e.title,
      category: e.category,
      start_date: e.start_date,
      created_at: e.created_at,
      venue_name: e.venue?.name ?? null,
      venue_city: e.venue?.city ?? null,
      venue_capacity: e.venue?.capacity ?? null,
      artist_id: head?.artist?.id ?? null,
      artist_name: head?.artist?.name ?? null,
      artist_slug: head?.artist?.slug ?? null,
      artist_created_at: head?.artist?.created_at ?? null,
    }
  })
}

type Db = ReturnType<typeof createAdminClient>

function targetsFor(item: DraftNewsItem): CandidateCityTarget[] {
  return item.scope === 'city' && item.citySlug && item.cityName
    ? [{ city_slug: item.citySlug, city_name: item.cityName }]
    : [{ city_slug: NEWS_HUB_SLUG, city_name: NEWS_HUB_NAME }]
}

async function publishCandidate(db: Db, id: string, item: DraftNewsItem): Promise<boolean> {
  const now = new Date().toISOString()
  const targets = targetsFor(item)
  const rows = buildPublishUpsertRows(
    { headline: item.headline, url: item.url, source: 'TheShowFinder' } as Parameters<typeof buildPublishUpsertRows>[0],
    targets,
    now,
  )
  const { error: upsertError } = await db.from('city_news').upsert(rows, { onConflict: 'city_slug,url' })
  if (upsertError) return false
  const { error: updateError } = await db
    .from('news_candidates')
    .update({ ...buildPublishCandidatePatch(now), reviewed_at: now, reviewed_by: AUTO_CREATED_BY })
    .eq('id', id)
  if (updateError) return false
  for (const t of targets) {
    revalidatePath(t.city_slug === NEWS_HUB_SLUG ? '/news' : `/cities/${encodeURIComponent(t.city_name)}`)
  }
  return true
}

export async function detectNewShows(now = new Date()): Promise<DetectResult> {
  const db = createAdminClient()
  const since = new Date(now.getTime() - NEW_SHOWS_WINDOW_DAYS * 86_400_000).toISOString()

  const { data, error } = await db
    .from('events')
    .select(
      'id,title,category,start_date,created_at,venue:venues(name,city,capacity),event_artists(is_headliner,artist:artists(id,name,slug,created_at))',
    )
    .gte('created_at', since)
    .gte('start_date', now.toISOString())
    .in('status', LIVE_EVENT_STATUSES)
    .order('created_at', { ascending: false })
    .limit(2000)
  if (error) throw new Error(error.message)

  const rows = flatten((data ?? []) as unknown as EventRow[])
  const weekKey = isoWeekKey(now)

  // Artists already handled in the last week (published, approved or rejected)
  // are skipped. A still-pending draft is NOT skipped: it is rebuilt below so it
  // keeps being refreshed (and is not mistaken for a stale draft).
  const { data: recent } = await db
    .from('news_candidates')
    .select('url,review_status')
    .eq('created_by', AUTO_CREATED_BY)
    .eq('scope_type', 'national')
    .neq('review_status', 'pending')
    .gte('created_at', since)
  const skip = new Set<string>()
  for (const r of (recent ?? []) as { url: string }[]) {
    const s = artistSlugFromDraftUrl(r.url)
    if (s) skip.add(s)
  }

  const all: DraftNewsItem[] = [
    ...buildCityRoundups(rows, CITIES.map(c => c.name), weekKey),
    ...buildArtistAdditions(rows, weekKey, now.getTime(), { skipArtistSlugs: skip }),
  ]

  const result: DetectResult = {
    scannedEvents: rows.length,
    inserted: 0,
    published: 0,
    refreshed: 0,
    rejectedStale: 0,
    skippedExisting: 0,
  }

  const { data: existing } = all.length
    ? await db.from('news_candidates').select('id,url,review_status').in('url', all.map(i => i.url))
    : { data: [] }
  const existingByUrl = new Map(
    ((existing ?? []) as { id: string; url: string; review_status: string }[]).map(e => [e.url, e]),
  )

  for (const item of all) {
    const nowISO = new Date().toISOString()
    const found = existingByUrl.get(item.url)
    let candidateId: string | null = null
    let shouldPublish = false

    if (found) {
      if (found.review_status !== 'pending') { result.skippedExisting++; continue }
      const { error: upErr } = await db
        .from('news_candidates')
        .update({
          headline: item.headline, summary: item.summary, priority: item.priority,
          publish_to_news_page: item.scope === 'national' && item.autoPublish,
          updated_at: nowISO,
        })
        .eq('id', found.id)
      if (upErr) continue
      result.refreshed++
      candidateId = found.id
      shouldPublish = item.autoPublish
    } else {
      const { data: inserted, error: insErr } = await db
        .from('news_candidates')
        .insert({
          scope_type: item.scope,
          city_slug: item.citySlug,
          city_name: item.cityName,
          publish_to_homepage: false,
          publish_to_news_page: item.scope === 'national' && item.autoPublish,
          headline: item.headline,
          source: 'TheShowFinder',
          source_url: null,
          url: item.url,
          published_at: nowISO,
          story_type: item.storyType,
          artist_name: item.artistName,
          artist_id: item.artistId,
          summary: item.summary,
          priority: item.priority,
          review_status: 'pending',
          created_by: AUTO_CREATED_BY,
          intake_method: 'manual',
        })
        .select('id')
        .single()
      if (insErr || !inserted) continue
      candidateId = (inserted as { id: string }).id
      result.inserted++
      if (item.scope === 'city' && item.citySlug && item.cityName) {
        await db.from('news_candidate_cities').insert({
          candidate_id: candidateId, city_slug: item.citySlug, city_name: item.cityName,
        })
      }
      shouldPublish = item.autoPublish
    }

    if (candidateId && shouldPublish && (await publishCandidate(db, candidateId, item))) result.published++
  }

  // Tidy: auto-drafts still pending that this run did not produce (they no
  // longer qualify, or belong to an earlier week) are rejected, not left to pile up.
  const currentUrls = new Set(all.map(i => i.url))
  const { data: pending } = await db
    .from('news_candidates')
    .select('id,url')
    .eq('created_by', AUTO_CREATED_BY)
    .eq('review_status', 'pending')
  const stale = ((pending ?? []) as { id: string; url: string }[]).filter(p => !currentUrls.has(p.url))
  if (stale.length) {
    const nowISO = new Date().toISOString()
    const { error: rejErr } = await db
      .from('news_candidates')
      .update({ review_status: 'rejected', reviewed_at: nowISO, reviewed_by: AUTO_CREATED_BY, updated_at: nowISO })
      .in('id', stale.map(s => s.id))
    if (!rejErr) result.rejectedStale = stale.length
  }

  return result
}
