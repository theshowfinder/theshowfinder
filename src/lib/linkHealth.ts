// Shared core of the read-only on-sale/presale internal link-health check
// — used by both scripts/check-on-sale-links.ts (CLI, anon key, full
// 36-city sweep, run by hand or from CI) and the admin Daily Intelligence
// Dashboard's Quality Checks section (src/app/admin/intelligence/page.tsx,
// service-role key via createAdminClient). One definition of "broken" for
// both callers, so a future fix to one can never quietly leave the other
// checking something different. See scripts/check-on-sale-links.ts's own
// header comment for the full history of the bug class this guards
// against (the "InPop card → 404" incident).
//
// Makes no writes, ever — this only reads events/artists and reports what
// it finds.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Artist } from './types/database'
import {
  fetchEventsThisWeek, fetchTopEvents,
  fetchPresalesOpenNow, fetchPresalesOpenNowEvents,
  fetchOnSaleThisWeek, fetchOnSaleThisWeekEvents,
} from './eventPools'
import { groupEventsByArtist, mergeEventsById } from './on-sale'

export interface BrokenLink {
  surface: string
  slug:    string
  url:     string
}

export interface LinkHealthReport {
  checked:             number
  broken:              BrokenLink[]
  resolvableSlugCount: number
  emptyEventSlugs:     number
  emptyArtistSlugs:    number
}

// `artists` and `cities` are supplied by the caller (rather than fetched
// in here) so a connectivity failure fetching them is the caller's own
// concern to detect and react to appropriately — exit 1 for the CLI
// script, an error state for the dashboard card — rather than this
// function silently treating "couldn't reach the DB" the same as
// "everything's fine, zero events".
export async function checkOnSaleLinkHealth(
  supabase: SupabaseClient,
  artists: Artist[],
  cities: string[],
): Promise<LinkHealthReport> {
  const broken: BrokenLink[] = []
  let checked = 0

  // ── 1. The resolving pool: exactly what the /on-sale-this-week/[slug]
  //    detail page checks a slug against. ────────────────────────────────
  const [onSaleEvents, presaleEvents] = await Promise.all([
    fetchOnSaleThisWeekEvents(supabase, { fetchLimit: 1000 }),
    fetchPresalesOpenNowEvents(supabase, { fetchLimit: 1000 }),
  ])
  const resolvableSlugs = new Set(
    groupEventsByArtist(mergeEventsById(onSaleEvents, presaleEvents), artists).map(g => g.slug)
  )

  function checkOnSaleSlugs(surface: string, slugs: string[]) {
    for (const slug of slugs) {
      checked++
      if (!resolvableSlugs.has(slug)) {
        broken.push({ surface, slug, url: `/on-sale-this-week/${slug}` })
      }
    }
  }

  // ── 2. Every surface that renders an on-sale-this-week / presale card ──

  checkOnSaleSlugs(
    'Homepage — On Sale This Week',
    (await fetchOnSaleThisWeek(supabase, artists, { limit: 500 })).map(g => g.slug),
  )
  checkOnSaleSlugs(
    'On Sale This Week listing page',
    (await fetchOnSaleThisWeek(supabase, artists, { limit: 500 })).map(g => g.slug),
  )
  checkOnSaleSlugs(
    'Homepage — Presales Open Now',
    (await fetchPresalesOpenNow(supabase, artists, { limit: 500 })).map(g => g.slug),
  )

  // Checked concurrently (N cities x 2 queries) rather than one at a time
  // — this is a read-only report, not a page render for an end user, so
  // there's no benefit to serializing it. The city page now renders its
  // On Sale This Week section through fetchOnSaleThisWeek directly (it
  // used to run its own hand-rolled replica of this query, which this
  // function had to separately duplicate to stay accurate — routing both
  // through the same shared helper removes that duplication entirely).
  await Promise.all(cities.map(async city => {
    const presaleSlugs = (await fetchPresalesOpenNow(supabase, artists, { city, limit: 500 })).map(g => g.slug)
    const citySlugs = (await fetchOnSaleThisWeek(supabase, artists, { city, limit: 500 })).map(g => g.slug)

    checkOnSaleSlugs(`City page — ${city} — Presales Open Now`, presaleSlugs)
    checkOnSaleSlugs(`City page — ${city} — On Sale This Week`, citySlugs)
  }))

  // ── 3. Lightweight sanity check on /events/[slug] and /artists/[slug] ──
  //    these resolve by a DB-stored slug column rather than a derived
  //    one, so the only failure mode here is a null/empty slug on a row
  //    that's otherwise being surfaced in a card.
  const sampleEvents = mergeEventsById(
    await fetchEventsThisWeek(supabase, { limit: 100 }),
    await fetchTopEvents(supabase, { limit: 100 }),
  )
  let emptyEventSlugs = 0
  for (const event of sampleEvents) {
    checked++
    if (!event.slug || event.slug.trim() === '') {
      emptyEventSlugs++
      broken.push({ surface: 'Event card (homepage pools)', slug: event.id, url: '/events/(missing slug)' })
    }
  }

  let emptyArtistSlugs = 0
  for (const artist of artists) {
    checked++
    if (!artist.slug || artist.slug.trim() === '') {
      emptyArtistSlugs++
      broken.push({ surface: 'Artist row', slug: artist.name, url: '/artists/(missing slug)' })
    }
  }

  return { checked, broken, resolvableSlugCount: resolvableSlugs.size, emptyEventSlugs, emptyArtistSlugs }
}
