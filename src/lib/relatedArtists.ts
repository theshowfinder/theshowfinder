// "Other artists" suggestions for event, artist, venue and on-sale pages.
// Pure helpers only (no '@/' imports) so they run under plain `node --test`;
// the database queries live in components/RelatedArtists.tsx.

export interface RelatedArtist {
  id: string
  name: string
  slug: string
  image_url: string | null
  upcoming_count: number
  next_date: string | null
  /** Optional line shown instead of the default "N UK dates · next ...". */
  subtitle?: string
}

// Tally headliner links into per-artist show counts for one city, busiest first.
// `links` is one row per (event, artist) pair already restricted to that city.
export function tallyCityArtists(links: { artist_id: string; event_id: string }[], excludeIds: Iterable<string>): { artistId: string; shows: number }[] {
  const skip = new Set(excludeIds)
  const events = new Map<string, Set<string>>()
  for (const l of links) {
    if (skip.has(l.artist_id)) continue
    if (!events.has(l.artist_id)) events.set(l.artist_id, new Set())
    events.get(l.artist_id)!.add(l.event_id)
  }
  return [...events.entries()]
    .map(([artistId, set]) => ({ artistId, shows: set.size }))
    .sort((a, b) => b.shows - a.shows || a.artistId.localeCompare(b.artistId))
}

// Same-genre artists first; if there are fewer than `limit`, top up with the
// busiest artists overall so the strip is never half empty. De-duplicated, never
// includes an excluded artist.
export function pickSimilar<T extends { id: string }>(sameGenre: T[], popular: T[], excludeIds: Iterable<string>, limit: number): T[] {
  const skip = new Set(excludeIds)
  const out: T[] = []
  for (const row of [...sameGenre, ...popular]) {
    if (skip.has(row.id)) continue
    skip.add(row.id)
    out.push(row)
    if (out.length >= limit) break
  }
  return out
}

export function cityShowsLabel(shows: number, city: string): string {
  return `${shows} show${shows === 1 ? '' : 's'} in ${city}`
}
