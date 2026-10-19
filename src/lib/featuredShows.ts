// Curation rules for the homepage "Featured Shows" strip.
//
// The strip used to be "whatever starts soonest", which filled it with timed-entry
// attractions (Sea Life, Thorpe Park, Cadbury World), VIP / premium packages and
// kids' class listings. These rules pick real, headline shows instead: no
// attractions, no packages, no class/series listings, one card per venue, a mix of
// categories, biggest rooms first. Pure module (no '@/' imports) so it runs under
// `node --test`.

import { isAttraction } from './eventMix.ts'
import { normalizeSlotTitle } from './timeSlotCap.ts'
import { PACKAGE_TITLE, NOT_A_HEADLINE } from './eventTitles.ts'

export interface FeaturedCandidate {
  title: string
  start_date: string
  category?: string | null
  venue_id?: string | null
  venue_name?: string | null
  venue_capacity?: number | null
  is_featured?: boolean | null
}

export function isFeaturedCandidate(e: Pick<FeaturedCandidate, 'title' | 'venue_name'>): boolean {
  if (isAttraction(e)) return false
  if (PACKAGE_TITLE.test(e.title)) return false
  if (NOT_A_HEADLINE.test(e.title)) return false
  return true
}

/** Max cards from one category, so the strip is not six of the same thing. */
export const FEATURED_MAX_PER_CATEGORY = 2

// Pick `limit` shows: featured-flagged first, then biggest venue first, at most one
// card per venue and show title and FEATURED_MAX_PER_CATEGORY per category; if that is
// too strict to fill the strip the category cap is relaxed (never the venue or title
// rule). The result is returned soonest first.
export function pickFeaturedShows<T extends FeaturedCandidate>(pool: T[], limit: number): T[] {
  const ranked = pool
    .filter(isFeaturedCandidate)
    .sort((a, b) =>
      Number(!!b.is_featured) - Number(!!a.is_featured)
      || (b.venue_capacity ?? 0) - (a.venue_capacity ?? 0)
      || a.start_date.localeCompare(b.start_date))

  const picked: T[] = []
  const titles = new Set<string>()
  const venues = new Set<string>()
  const perCategory = new Map<string, number>()

  const take = (e: T, enforceCategoryCap: boolean): void => {
    if (picked.length >= limit) return
    const titleKey = normalizeSlotTitle(e.title) || e.title
    const venueKey = e.venue_id ?? (e.venue_name ? e.venue_name.toLowerCase() : '')
    const cat = e.category ?? ''
    if (titles.has(titleKey)) return
    if (venueKey && venues.has(venueKey)) return
    if (enforceCategoryCap && (perCategory.get(cat) ?? 0) >= FEATURED_MAX_PER_CATEGORY) return
    picked.push(e)
    titles.add(titleKey)
    if (venueKey) venues.add(venueKey)
    perCategory.set(cat, (perCategory.get(cat) ?? 0) + 1)
  }

  for (const e of ranked) take(e, true)
  for (const e of ranked) take(e, false)
  return picked.sort((a, b) => a.start_date.localeCompare(b.start_date))
}
