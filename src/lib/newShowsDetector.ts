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

// Detect shows added to our database in the last week and queue them as
// PENDING drafts in the News Inbox (nothing auto-publishes). Safe to run
// repeatedly: city roundups are keyed by ISO week (a still-pending draft is
// refreshed with the latest counts; an approved/published/rejected one is left
// alone) and an artist already drafted in the last 7 days is skipped.

const AUTO_CREATED_BY = 'auto:new-shows'

interface EventRow {
  id: string
  title: string
  category: string | null
  start_date: string
  created_at: string
  venue: { name: string | null; city: string | null } | null
  event_artists: {
    is_headliner: boolean | null
    artist: { id: string; name: string; slug: string; created_at: string } | null
  }[] | null
}

export interface DetectResult {
  scannedEvents: number
  cityDrafts: number
  artistDrafts: number
  refreshed: number
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
      artist_id: head?.artist?.id ?? null,
      artist_name: head?.artist?.name ?? null,
      artist_slug: head?.artist?.slug ?? null,
      artist_created_at: head?.artist?.created_at ?? null,
    }
  })
}

export async function detectNewShows(now = new Date()): Promise<DetectResult> {
  const db = createAdminClient()
  const since = new Date(now.getTime() - NEW_SHOWS_WINDOW_DAYS * 86_400_000).toISOString()

  const { data, error } = await db
    .from('events')
    .select(
      'id,title,category,start_date,created_at,venue:venues(name,city),event_artists(is_headliner,artist:artists(id,name,slug,created_at))',
    )
    .gte('created_at', since)
    .gte('start_date', now.toISOString())
    .in('status', LIVE_EVENT_STATUSES)
    .order('created_at', { ascending: false })
    .limit(2000)
  if (error) throw new Error(error.message)

  const rows = flatten((data ?? []) as unknown as EventRow[])
  const weekKey = isoWeekKey(now)

  // Artists already drafted in the last week (any status) are skipped.
  const { data: recent } = await db
    .from('news_candidates')
    .select('url')
    .eq('created_by', AUTO_CREATED_BY)
    .eq('scope_type', 'national')
    .gte('created_at', since)
  const skip = new Set<string>()
  for (const r of (recent ?? []) as { url: string }[]) {
    const s = artistSlugFromDraftUrl(r.url)
    if (s) skip.add(s)
  }

  const cityItems = buildCityRoundups(rows, CITIES.map(c => c.name), weekKey)
  const artistItems = buildArtistAdditions(rows, weekKey, now.getTime(), { skipArtistSlugs: skip })

  const result: DetectResult = {
    scannedEvents: rows.length,
    cityDrafts: 0,
    artistDrafts: 0,
    refreshed: 0,
    skippedExisting: 0,
  }

  const all: DraftNewsItem[] = [...cityItems, ...artistItems]
  if (!all.length) return result

  const { data: existing } = await db
    .from('news_candidates')
    .select('id,url,review_status')
    .in('url', all.map(i => i.url))
  const existingByUrl = new Map(
    ((existing ?? []) as { id: string; url: string; review_status: string }[]).map(e => [e.url, e]),
  )

  for (const item of all) {
    const nowISO = new Date().toISOString()
    const found = existingByUrl.get(item.url)
    if (found) {
      if (found.review_status === 'pending') {
        const { error: upErr } = await db
          .from('news_candidates')
          .update({ headline: item.headline, summary: item.summary, priority: item.priority, updated_at: nowISO })
          .eq('id', found.id)
        if (!upErr) result.refreshed++
      } else {
        result.skippedExisting++
      }
      continue
    }

    const { data: inserted, error: insErr } = await db
      .from('news_candidates')
      .insert({
        scope_type: item.scope,
        city_slug: item.citySlug,
        city_name: item.cityName,
        publish_to_homepage: false,
        publish_to_news_page: false,
        headline: item.headline,
        source: 'TheShowFinder (auto-detected from ticket listings)',
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

    if (item.scope === 'city' && item.citySlug && item.cityName) {
      await db.from('news_candidate_cities').insert({
        candidate_id: (inserted as { id: string }).id,
        city_slug: item.citySlug,
        city_name: item.cityName,
      })
      result.cityDrafts++
    } else {
      result.artistDrafts++
    }
  }

  return result
}
