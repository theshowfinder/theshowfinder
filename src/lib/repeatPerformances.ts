// Long-running shows (West End runs, attractions, dining experiences) are listed
// once per performance: ~10,000 of our ~22,000 upcoming event URLs belong to
// about 200 such shows. Pages that differ only by date waste Google's crawl on
// a young site and make our best pages harder to find, so only the soonest few
// performances of each show are indexed. The rest stay live for visitors
// (and link on to the show page) but are kept out of the index and sitemap.
//
// No imports so `node --test` runs it directly.

export const REPEAT_KEEP = 5

export interface PerformanceRow {
  slug: string
  title: string
  venue_id: string | null
  start_date: string
}

export function repeatKey(title: string, venueId: string | null): string {
  return `${title.trim().toLowerCase()}|${venueId ?? ''}`
}

/** Slugs of performances beyond the first `keep` of their show, soonest first. */
export function repeatPerformanceSlugs(rows: PerformanceRow[], keep = REPEAT_KEEP): Set<string> {
  const groups = new Map<string, PerformanceRow[]>()
  for (const r of rows) {
    if (!r.venue_id) continue
    const k = repeatKey(r.title, r.venue_id)
    const list = groups.get(k) ?? []
    list.push(r)
    groups.set(k, list)
  }
  const drop = new Set<string>()
  for (const list of groups.values()) {
    if (list.length <= keep) continue
    list.sort((a, b) => a.start_date.localeCompare(b.start_date))
    for (const r of list.slice(keep)) drop.add(r.slug)
  }
  return drop
}

/** True when this many earlier performances of the same show are still to come. */
export function isRepeatPerformance(earlierPerformances: number, keep = REPEAT_KEEP): boolean {
  return earlierPerformances >= keep
}
