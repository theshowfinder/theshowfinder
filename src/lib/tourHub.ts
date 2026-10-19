// Pure logic for the /new-tours hub: which artists have announced (or added)
// a run of UK dates recently. Reuses the news system's row shape, filters and
// de-duplication so the hub and the news items agree on what a "tour" is.
// Relative imports only so `node --test` runs it directly.
import {
  NON_NEWSWORTHY_CATEGORIES,
  dedupeShows,
  isNewsworthyArtistName,
  ukDay,
  type NewShowRow,
} from './newShows.ts'
import { cleanSeriesName, isDartsTitle, isPackageOrClassTitle, seriesKey } from './eventTitles.ts'

export const HUB_WINDOW_DAYS = 14
export const HUB_MIN_SHOWS = 3
export const HUB_MIN_CITIES = 2
export const HUB_MAX_TOURS = 60

export interface TourAnnouncement {
  artistName: string
  artistSlug: string
  showCount: number
  /** Cities in date order, no repeats. */
  cities: string[]
  firstDate: string
  lastDate: string
  /** When the most recent of these dates reached our listings. */
  announcedAt: string
  /** The artist itself first appeared on the site inside the window. */
  isBrandNew: boolean
  /** Biggest venue on the run, used as the "plays {venue}" hook. */
  biggestVenue: string | null
}

export function buildTourAnnouncements(
  rows: NewShowRow[],
  now: Date,
  opts: { windowDays?: number; minShows?: number; minCities?: number; max?: number } = {},
): TourAnnouncement[] {
  const windowDays = opts.windowDays ?? HUB_WINDOW_DAYS
  const minShows = opts.minShows ?? HUB_MIN_SHOWS
  const minCities = opts.minCities ?? HUB_MIN_CITIES
  const max = opts.max ?? HUB_MAX_TOURS
  const cutoff = now.getTime() - windowDays * 86_400_000

  const groups = new Map<string, NewShowRow[]>()
  for (const r of dedupeShows(rows)) {
    if (!r.artist_id || !r.artist_name || !r.artist_slug) continue
    if (NON_NEWSWORTHY_CATEGORIES.has(r.category ?? '')) continue
    if (!isNewsworthyArtistName(r.artist_name)) continue
    // Packages ("Venue Premium Tickets"), weekly class slots ("Fishies Week 7") and darts
    // (a sport, whatever genre the feed gave it) are not tour announcements.
    if (isPackageOrClassTitle(r.title) || isPackageOrClassTitle(r.artist_name)) continue
    if (isDartsTitle(r.title) || isDartsTitle(r.artist_name)) continue
    if (new Date(r.start_date).getTime() <= now.getTime()) continue
    if (new Date(r.created_at).getTime() < cutoff) continue
    // One act can exist as several artist records (sponsor / year variants): key on the series.
    const key = seriesKey(r.artist_name)
    const list = groups.get(key) ?? []
    list.push(r)
    groups.set(key, list)
  }

  const out: TourAnnouncement[] = []
  for (const all of groups.values()) {
    // One entry per city per day: presale and premium variants repeat a show.
    const seen = new Set<string>()
    const shows = all.filter(s => {
      const key = `${(s.venue_city ?? '').toLowerCase()}|${ukDay(s.start_date)}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    const sorted = [...shows].sort((a, b) => a.start_date.localeCompare(b.start_date))
    const cities = [...new Set(sorted.map(s => s.venue_city).filter((c): c is string => !!c))]
    if (sorted.length < minShows || cities.length < minCities) continue

    const first = sorted[0]
    const biggest = [...sorted].sort((a, b) => (b.venue_capacity ?? 0) - (a.venue_capacity ?? 0))[0]
    const announcedAt = sorted.reduce((m, s) => (s.created_at > m ? s.created_at : m), sorted[0].created_at)
    out.push({
      artistName: cleanSeriesName(first.artist_name as string),
      artistSlug: first.artist_slug as string,
      showCount: sorted.length,
      cities,
      firstDate: first.start_date,
      lastDate: sorted[sorted.length - 1].start_date,
      announcedAt,
      isBrandNew:
        !!first.artist_created_at && new Date(first.artist_created_at).getTime() >= cutoff,
      biggestVenue: biggest.venue_capacity ? biggest.venue_name : null,
    })
  }

  // Newest announcement first; bigger runs win ties.
  out.sort((a, b) => b.announcedAt.localeCompare(a.announcedAt) || b.showCount - a.showCount || a.artistName.localeCompare(b.artistName))
  return out.slice(0, max)
}

/** "Manchester, Leeds and Glasgow", or "Manchester, Leeds and 4 more cities". */
export function citiesPhrase(cities: string[], show = 3): string {
  if (cities.length === 0) return ''
  if (cities.length === 1) return cities[0]
  if (cities.length <= show) return `${cities.slice(0, -1).join(', ')} and ${cities[cities.length - 1]}`
  const rest = cities.length - show + 1
  return `${cities.slice(0, show - 1).join(', ')} and ${rest} more cities`
}

/** Whole days between `iso` and `now`, never negative. */
export function daysAgo(iso: string, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - new Date(iso).getTime()) / 86_400_000))
}

/** "today", "yesterday", "3 days ago". */
export function announcedLabel(iso: string, now: Date): string {
  const d = daysAgo(iso, now)
  if (d === 0) return 'today'
  if (d === 1) return 'yesterday'
  return `${d} days ago`
}
