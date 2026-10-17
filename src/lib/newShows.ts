// Pure logic for the "new shows" detector — turns the events that were first
// added to our database recently into draft news items for the News Inbox:
//
//   • one "New shows added in {city} this week" roundup per city (local)
//   • one "{artist} adds {n} UK dates" item per artist (national)
//
// Everything here is deterministic and built only from our own event rows
// (which come from the official Ticketmaster feed) — no AI, no scraped text —
// so the drafts only ever state facts we hold. They land as `pending` rows
// and a person approves them; nothing auto-publishes.
//
// No imports and no '@/' aliases so `node --test` runs it directly.

export interface NewShowRow {
  event_id: string
  title: string
  category: string | null
  start_date: string
  created_at: string
  venue_name: string | null
  venue_city: string | null
  artist_id: string | null
  artist_name: string | null
  artist_slug: string | null
  artist_created_at: string | null
}

export const NEW_SHOWS_WINDOW_DAYS = 7
export const SITE_URL = 'https://theshowfinder.com'

// Categories whose "new dates" are not worth a news item of their own:
// football fixtures and the like are scheduled en masse each season.
const NON_NEWSWORTHY_CATEGORIES = new Set(['sports'])

// Listings that are not shows people would read a news item about: hospitality
// and premium-package products, parking, and football/club fixtures that slip
// past the category filter (seen in live data: "Utilita Arena Sheffield –
// Premium Packages", "Derby County FC").
const NOT_A_SHOW_NAME = /premium packages?|hospitality|\bparking\b|vip (package|upgrade|experience)|\b(a?fc)\b/i

export function isNewsworthyArtistName(name: string | null): boolean {
  return !!name && !NOT_A_SHOW_NAME.test(name)
}

export const CITY_ROUNDUP_MIN_SHOWS = 4
export const ARTIST_MIN_DATES = 3
export const MAX_CITY_ROUNDUPS = 12
export const MAX_ARTIST_ITEMS = 12

export function citySlugOf(cityName: string): string {
  return cityName.toLowerCase().replace(/\s+/g, '-')
}

/** ISO-8601 week label, e.g. 2026-W42 — the dedupe key for "this week" items. */
export function isoWeekKey(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7)
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}

export function shortUkDate(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Europe/London',
  }).format(new Date(iso))
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`
}

function joinNatural(items: string[]): string {
  if (items.length <= 1) return items.join('')
  if (items.length === 2) return `${items[0]} and ${items[1]}`
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`
}

export interface DraftNewsItem {
  scope: 'city' | 'national'
  cityName: string | null
  citySlug: string | null
  headline: string
  summary: string
  url: string
  storyType: 'tour_announcement' | 'new_dates'
  priority: 'normal' | 'high'
  artistId: string | null
  artistName: string | null
  /** Stable key, used to spot an item already drafted this period. */
  dedupeKey: string
}

// ── City roundups ────────────────────────────────────────────────────────────

export function buildCityRoundups(
  rows: NewShowRow[],
  cityNames: string[],
  weekKey: string,
  opts: { minShows?: number; max?: number } = {},
): DraftNewsItem[] {
  const minShows = opts.minShows ?? CITY_ROUNDUP_MIN_SHOWS
  const max = opts.max ?? MAX_CITY_ROUNDUPS
  const byCityLower = new Map(cityNames.map(c => [c.toLowerCase(), c]))

  const groups = new Map<string, NewShowRow[]>()
  const seenEvents = new Set<string>()
  for (const r of rows) {
    if (!r.venue_city || seenEvents.has(r.event_id)) continue
    const city = byCityLower.get(r.venue_city.trim().toLowerCase())
    if (!city) continue
    seenEvents.add(r.event_id)
    const list = groups.get(city) ?? []
    list.push(r)
    groups.set(city, list)
  }

  const items: DraftNewsItem[] = []
  for (const [city, shows] of groups) {
    if (shows.length < minShows) continue
    const slug = citySlugOf(city)

    // Highlights: distinct headliners from non-sport events, soonest first.
    const highlightable = shows
      .filter(s => isNewsworthyArtistName(s.artist_name) && !NON_NEWSWORTHY_CATEGORIES.has(s.category ?? ''))
      .sort((a, b) => a.start_date.localeCompare(b.start_date))
    const seenArtists = new Set<string>()
    const highlights: NewShowRow[] = []
    for (const s of highlightable) {
      const key = (s.artist_id ?? s.artist_name ?? '').toLowerCase()
      if (seenArtists.has(key)) continue
      seenArtists.add(key)
      highlights.push(s)
      if (highlights.length === 4) break
    }

    const venues = new Set(shows.map(s => s.venue_name).filter(Boolean) as string[])
    const parts = [
      `${plural(shows.length, 'new show')} ${shows.length === 1 ? 'has' : 'have'} been listed in ${city} in the last ${NEW_SHOWS_WINDOW_DAYS} days, across ${plural(venues.size, 'venue')}.`,
    ]
    if (highlights.length) {
      parts.push(
        `New listings include ${joinNatural(highlights.map(h => `${h.artist_name} at ${h.venue_name} (${shortUkDate(h.start_date)})`))}.`,
      )
    }
    parts.push('Dates come from the official ticket listings; availability and prices can change.')

    items.push({
      scope: 'city',
      cityName: city,
      citySlug: slug,
      headline: `New shows added in ${city} this week`,
      summary: parts.join(' '),
      url: `${SITE_URL}/cities/${slug}?new=${weekKey}`,
      storyType: 'new_dates',
      priority: shows.length >= 15 ? 'high' : 'normal',
      artistId: null,
      artistName: null,
      dedupeKey: `city:${slug}:${weekKey}`,
    })
  }

  return items.sort((a, b) => countFor(b, groups) - countFor(a, groups)).slice(0, max)
}

function countFor(item: DraftNewsItem, groups: Map<string, NewShowRow[]>): number {
  return item.cityName ? groups.get(item.cityName)?.length ?? 0 : 0
}

// ── Artist additions ─────────────────────────────────────────────────────────

export function buildArtistAdditions(
  rows: NewShowRow[],
  weekKey: string,
  now: number,
  opts: { minDates?: number; max?: number; skipArtistSlugs?: Set<string> } = {},
): DraftNewsItem[] {
  const minDates = opts.minDates ?? ARTIST_MIN_DATES
  const max = opts.max ?? MAX_ARTIST_ITEMS
  const skip = opts.skipArtistSlugs ?? new Set<string>()

  const groups = new Map<string, NewShowRow[]>()
  const seenEvents = new Set<string>()
  for (const r of rows) {
    if (!r.artist_id || !r.artist_name || !r.artist_slug) continue
    if (NON_NEWSWORTHY_CATEGORIES.has(r.category ?? '')) continue
    if (!isNewsworthyArtistName(r.artist_name)) continue
    if (seenEvents.has(r.event_id)) continue
    seenEvents.add(r.event_id)
    const list = groups.get(r.artist_id) ?? []
    list.push(r)
    groups.set(r.artist_id, list)
  }

  const items: (DraftNewsItem & { n: number })[] = []
  for (const shows of groups.values()) {
    if (shows.length < minDates) continue
    const first = shows[0]
    const name = first.artist_name as string
    const slug = first.artist_slug as string
    if (skip.has(slug)) continue

    const sorted = [...shows].sort((a, b) => a.start_date.localeCompare(b.start_date))
    const cities = [...new Set(sorted.map(s => s.venue_city).filter(Boolean) as string[])]
    const isBrandNew =
      !!first.artist_created_at &&
      now - new Date(first.artist_created_at).getTime() <= NEW_SHOWS_WINDOW_DAYS * 86_400_000

    const headline = isBrandNew
      ? `${name} announces UK dates`
      : `${name} adds ${plural(shows.length, 'new UK date')}`

    const itinerary = sorted
      .slice(0, 4)
      .map(s => `${s.venue_city ?? s.venue_name} (${shortUkDate(s.start_date)})`)
    const more = sorted.length > 4 ? `, plus ${sorted.length - 4} more` : ''
    const summary =
      `${name} now has ${plural(shows.length, 'new date')} listed across ${plural(cities.length, 'UK city', 'UK cities')}: ` +
      `${itinerary.join(', ')}${more}. ` +
      `Dates come from the official ticket listings; check each event page for the latest availability.`

    items.push({
      scope: 'national',
      cityName: null,
      citySlug: null,
      headline,
      summary,
      url: `${SITE_URL}/artists/${slug}?added=${weekKey}`,
      storyType: isBrandNew ? 'tour_announcement' : 'new_dates',
      priority: shows.length >= 8 || cities.length >= 5 ? 'high' : 'normal',
      artistId: first.artist_id,
      artistName: name,
      dedupeKey: `artist:${slug}:${weekKey}`,
      n: shows.length,
    })
  }

  items.sort((a, b) => b.n - a.n)
  return items.slice(0, max).map(item => {
    const draft: Partial<typeof item> = { ...item }
    delete draft.n
    return draft as DraftNewsItem
  })
}

/** Pull the artist slug back out of a draft URL we created (for skip lists). */
export function artistSlugFromDraftUrl(url: string): string | null {
  const m = /\/artists\/([^/?#]+)/.exec(url)
  return m ? m[1] : null
}
