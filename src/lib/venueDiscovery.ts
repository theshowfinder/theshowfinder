// Pure helpers for the city page's venue section: rank a city's venues by how
// much is actually on (not just by room size), say what kind of shows each one
// puts on, and name its next show. Built only from data we already hold, so
// nothing here is invented.

export interface DiscoveryVenue {
  id: string
  name: string
  slug: string
  capacity: number | null
  address: string | null
  city?: string | null
}

export interface VenueEventRow {
  venue_id: string
  title: string
  start_date: string
  category: string | null
}

export interface RankedVenue extends DiscoveryVenue {
  count: number
  nextShow: { title: string; start_date: string } | null
  /** Up to two most common show types, e.g. ['concert', 'comedy']. */
  mix: string[]
}

const MIX_LABEL: Record<string, string> = {
  concert: 'concerts',
  theatre: 'theatre',
  comedy:  'comedy',
  sports:  'sport',
  family:  'family shows',
  local:   'local events',
}

// A venue with fewer upcoming shows than this goes in the compact "more venues"
// list rather than getting a full card.
export const POPULAR_MIN_SHOWS = 3
export const POPULAR_MAX = 8

export function rankVenues(
  venues: DiscoveryVenue[],
  counts: Record<string, number>,
  rows: VenueEventRow[],
): RankedVenue[] {
  const byVenue = new Map<string, VenueEventRow[]>()
  for (const r of rows) {
    const list = byVenue.get(r.venue_id)
    if (list) list.push(r)
    else byVenue.set(r.venue_id, [r])
  }

  return venues
    .map(v => {
      const list = (byVenue.get(v.id) ?? []).slice().sort((a, b) => a.start_date.localeCompare(b.start_date))
      const first = list[0]
      const tally = new Map<string, number>()
      for (const r of list) if (r.category) tally.set(r.category, (tally.get(r.category) ?? 0) + 1)
      const mix = [...tally.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 2).map(([c]) => c)
      return {
        ...v,
        count: counts[v.id] ?? 0,
        nextShow: first ? { title: first.title, start_date: first.start_date } : null,
        mix,
      }
    })
    .filter(v => v.count > 0)
    .sort((a, b) => b.count - a.count || (b.capacity ?? 0) - (a.capacity ?? 0) || a.name.localeCompare(b.name))
}

export function splitPopular(ranked: RankedVenue[]): { popular: RankedVenue[]; more: RankedVenue[] } {
  const popular = ranked.filter(v => v.count >= POPULAR_MIN_SHOWS).slice(0, POPULAR_MAX)
  // Always show at least the top venue as a full card, even in a quiet city.
  if (popular.length === 0 && ranked.length > 0) popular.push(ranked[0])
  const ids = new Set(popular.map(v => v.id))
  return { popular, more: ranked.filter(v => !ids.has(v.id)) }
}

// "Mostly concerts and comedy" — what the venue is mainly used for.
export function venueMixLabel(mix: string[]): string | null {
  const labels = mix.map(c => MIX_LABEL[c]).filter(Boolean)
  if (labels.length === 0) return null
  return `Mostly ${labels.join(' and ')}`
}

// "Fri 23 Oct" in UK time.
export function shortLondonDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Europe/London' })
}
