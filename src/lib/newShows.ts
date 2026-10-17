// Pure logic for the "new shows" detector — turns the events that were first
// added to our database recently into news items:
//
//   • one "New shows added in {city} this week" roundup per city (local)
//   • one "{artist} adds {n} UK dates" item per artist touring several cities
//
// Everything here is deterministic and built only from our own event rows
// (which come from the official ticket feeds) — no AI, no scraped text — so an
// item only ever states facts we hold. Items that clear a higher bar are marked
// `autoPublish`; the rest stay pending for a person to approve.
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
  venue_capacity: number | null
  public_onsale_start: string | null
  artist_id: string | null
  artist_name: string | null
  artist_slug: string | null
  artist_created_at: string | null
}

export const NEW_SHOWS_WINDOW_DAYS = 7
export const SITE_URL = 'https://www.theshowfinder.com'

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
/** A city roundup is published without review from this many distinct shows. */
export const CITY_ROUNDUP_AUTO_PUBLISH_MIN = 6
export const ARTIST_MIN_SHOW_DAYS = 3
export const ARTIST_MIN_CITIES = 2
export const MAX_CITY_ROUNDUPS = 12
export const MAX_ARTIST_ITEMS = 12
/** At most this many artist items are published without review per run. */
export const MAX_AUTO_PUBLISH_ARTISTS = 4

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

/** Calendar day (YYYY-MM-DD) in UK time. */
export function ukDay(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date(iso))
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`
}

function joinNatural(items: string[]): string {
  if (items.length <= 1) return items.join('')
  if (items.length === 2) return `${items[0]} and ${items[1]}`
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`
}

function normaliseTitle(t: string): string {
  return t.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

/**
 * Ticketing feeds list one show several times (presale/venue-premium variants,
 * early and late slots). Collapse to one row per show: same act (or title) at the
 * same venue on the same UK day.
 */
export function dedupeShows(rows: NewShowRow[]): NewShowRow[] {
  const seen = new Set<string>()
  const out: NewShowRow[] = []
  for (const r of rows) {
    const who = r.artist_id ?? normaliseTitle(r.title)
    const key = `${who}|${(r.venue_name ?? '').toLowerCase()}|${ukDay(r.start_date)}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(r)
  }
  return out
}

export interface DraftNewsItem {
  scope: 'city' | 'national'
  cityName: string | null
  citySlug: string | null
  headline: string
  summary: string
  url: string
  storyType: 'tour_announcement' | 'new_dates' | 'presale'
  priority: 'normal' | 'high'
  artistId: string | null
  artistName: string | null
  /** True when the item clears the bar to publish without a person approving it. */
  autoPublish: boolean
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
  for (const r of dedupeShows(rows)) {
    if (!r.venue_city) continue
    const city = byCityLower.get(r.venue_city.trim().toLowerCase())
    if (!city) continue
    const list = groups.get(city) ?? []
    list.push(r)
    groups.set(city, list)
  }

  const items: { item: DraftNewsItem; n: number }[] = []
  for (const [city, shows] of groups) {
    if (shows.length < minShows) continue
    const slug = citySlugOf(city)

    // Highlights: distinct headliners from non-sport events, biggest venue first.
    const highlightable = shows
      .filter(s => isNewsworthyArtistName(s.artist_name) && !NON_NEWSWORTHY_CATEGORIES.has(s.category ?? ''))
      .sort((a, b) => (b.venue_capacity ?? 0) - (a.venue_capacity ?? 0) || a.start_date.localeCompare(b.start_date))
    const seenArtists = new Set<string>()
    const highlights: NewShowRow[] = []
    for (const s of highlightable) {
      const key = (s.artist_id ?? s.artist_name ?? '').toLowerCase()
      if (seenArtists.has(key)) continue
      seenArtists.add(key)
      highlights.push(s)
      if (highlights.length === 4) break
    }
    highlights.sort((a, b) => a.start_date.localeCompare(b.start_date))

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
      n: shows.length,
      item: {
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
        autoPublish: shows.length >= CITY_ROUNDUP_AUTO_PUBLISH_MIN && highlights.length >= 2,
        dedupeKey: `city:${slug}:${weekKey}`,
      },
    })
  }

  items.sort((a, b) => b.n - a.n)
  return items.slice(0, max).map(x => x.item)
}

// ── Artist additions ─────────────────────────────────────────────────────────

export function buildArtistAdditions(
  rows: NewShowRow[],
  weekKey: string,
  now: number,
  opts: {
    minShowDays?: number
    minCities?: number
    max?: number
    maxAutoPublish?: number
    skipArtistSlugs?: Set<string>
  } = {},
): DraftNewsItem[] {
  const minShowDays = opts.minShowDays ?? ARTIST_MIN_SHOW_DAYS
  const minCities = opts.minCities ?? ARTIST_MIN_CITIES
  const max = opts.max ?? MAX_ARTIST_ITEMS
  const maxAuto = opts.maxAutoPublish ?? MAX_AUTO_PUBLISH_ARTISTS
  const skip = opts.skipArtistSlugs ?? new Set<string>()

  const groups = new Map<string, NewShowRow[]>()
  for (const r of rows) {
    if (!r.artist_id || !r.artist_name || !r.artist_slug) continue
    if (NON_NEWSWORTHY_CATEGORIES.has(r.category ?? '')) continue
    if (!isNewsworthyArtistName(r.artist_name)) continue
    const list = groups.get(r.artist_id) ?? []
    list.push(r)
    groups.set(r.artist_id, list)
  }

  const items: { item: DraftNewsItem; n: number }[] = []
  for (const all of groups.values()) {
    // One entry per city per day: listings repeat for presale and premium variants.
    const seen = new Set<string>()
    const shows = all.filter(s => {
      const key = `${(s.venue_city ?? '').toLowerCase()}|${ukDay(s.start_date)}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    const cities = [...new Set(shows.map(s => s.venue_city).filter(Boolean) as string[])]
    // A run of nights in one city is a local story (it lands in that city's
    // roundup), not a national announcement.
    if (shows.length < minShowDays || cities.length < minCities) continue

    const first = shows[0]
    const name = first.artist_name as string
    const slug = first.artist_slug as string
    if (skip.has(slug)) continue

    const sorted = [...shows].sort((a, b) => a.start_date.localeCompare(b.start_date))
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
      n: shows.length,
      item: {
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
        autoPublish: false,
        dedupeKey: `artist:${slug}:${weekKey}`,
      },
    })
  }

  items.sort((a, b) => b.n - a.n)
  const top = items.slice(0, max).map(x => x.item)
  // The biggest few are published without review; the rest wait for approval.
  top.forEach((item, i) => { item.autoPublish = i < maxAuto })
  return top
}

// ── Per-city "coming to" and "on sale" items ─────────────────────────────────
//
// Beyond the weekly roundup, a city's news also gets individual headlines for the
// biggest new shows and for tickets about to go on sale there. They link to the
// artist page (which lists the dates) and carry `in=<city>` so the same act can
// appear in several cities' news without clashing.

export const CITY_ITEM_MIN_CAPACITY = 800
export const CITY_ITEMS_PER_CITY_PER_RUN = 2
/** Most per-city items (coming-to + on-sale) a city can get in any 7 days. */
export const CITY_ITEMS_PER_CITY_PER_WEEK = 4
/** A "coming to" item needs an on-sale date this recent (or still ahead). */
export const RECENT_ANNOUNCEMENT_DAYS = 30
export const ONSALE_LOOKAHEAD_DAYS = 7

/** A usable on-sale instant: feeds contain placeholders such as 1900-01-01. */
function validOnsale(iso: string | null): number | null {
  if (!iso) return null
  const t = new Date(iso).getTime()
  return Number.isFinite(t) && t >= Date.UTC(2020, 0, 1) ? t : null
}

/** 12pm, 10:30am — UK time. */
export function ukTimeLabel(iso: string): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Europe/London',
  }).formatToParts(new Date(iso))
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? ''
  const mins = get('minute')
  return `${get('hour')}${mins === '00' ? '' : ':' + mins}${get('dayPeriod').toLowerCase()}`
}

/** `slug|city-slug` of a per-city item URL we created, for skip lists. */
export function cityItemKeyFromUrl(url: string): string | null {
  const slug = /\/artists\/([^/?#]+)/.exec(url)?.[1]
  const city = /[?&]in=([^&#]+)/.exec(url)?.[1]
  return slug && city ? `${slug}|${city}` : null
}

interface CityActGroup { city: string; artistName: string; slug: string; artistId: string; shows: NewShowRow[]; capacity: number }

function groupActsByCity(rows: NewShowRow[], cityNames: string[], keep: (r: NewShowRow) => boolean, minCapacity: number): CityActGroup[] {
  const byCityLower = new Map(cityNames.map(c => [c.toLowerCase(), c]))
  const groups = new Map<string, CityActGroup>()
  for (const r of dedupeShows(rows)) {
    if (!r.artist_id || !r.artist_name || !r.artist_slug || !r.venue_city) continue
    if (!isNewsworthyArtistName(r.artist_name)) continue
    if ((r.venue_capacity ?? 0) < minCapacity) continue
    if (!keep(r)) continue
    const city = byCityLower.get(r.venue_city.trim().toLowerCase())
    if (!city) continue
    const key = `${city}|${r.artist_id}`
    const g = groups.get(key) ?? { city, artistName: r.artist_name, slug: r.artist_slug, artistId: r.artist_id, shows: [], capacity: 0 }
    g.shows.push(r)
    g.capacity = Math.max(g.capacity, r.venue_capacity ?? 0)
    groups.set(key, g)
  }
  return [...groups.values()]
}

function takePerCity(groups: CityActGroup[], perCity: number, skipKeys: Set<string>): CityActGroup[] {
  const sorted = [...groups].sort((a, b) => b.capacity - a.capacity || b.shows.length - a.shows.length)
  const count = new Map<string, number>()
  const out: CityActGroup[] = []
  for (const g of sorted) {
    if (skipKeys.has(`${g.slug}|${citySlugOf(g.city)}`)) continue
    const c = count.get(g.city) ?? 0
    if (c >= perCity) continue
    count.set(g.city, c + 1)
    out.push(g)
  }
  return out
}

/** "{Artist} coming to {Venue}, {City} on {date}" for the biggest recent announcements. */
export function buildCityShowItems(
  rows: NewShowRow[],
  cityNames: string[],
  weekKey: string,
  nowMs: number,
  opts: { perCity?: number; minCapacity?: number; skipKeys?: Set<string> } = {},
): DraftNewsItem[] {
  const recentCutoff = nowMs - RECENT_ANNOUNCEMENT_DAYS * 86_400_000
  const groups = groupActsByCity(
    rows,
    cityNames,
    r => {
      if (NON_NEWSWORTHY_CATEGORIES.has(r.category ?? '')) return false
      const onsale = validOnsale(r.public_onsale_start)
      // No usable on-sale date means we cannot say it is a recent announcement.
      return onsale !== null && onsale >= recentCutoff
    },
    opts.minCapacity ?? CITY_ITEM_MIN_CAPACITY,
  )
  return takePerCity(groups, opts.perCity ?? CITY_ITEMS_PER_CITY_PER_RUN, opts.skipKeys ?? new Set()).map(g => {
    const shows = [...g.shows].sort((a, b) => a.start_date.localeCompare(b.start_date))
    const first = shows[0]
    const venue = first.venue_name ?? g.city
    const headline = shows.length > 1
      ? `${g.artistName} coming to ${venue}, ${g.city}: ${shows.length} dates from ${shortUkDate(first.start_date)}`
      : `${g.artistName} coming to ${venue}, ${g.city} on ${shortUkDate(first.start_date)}`
    const citySlug = citySlugOf(g.city)
    return {
      scope: 'city' as const,
      cityName: g.city,
      citySlug,
      headline,
      summary: `${headline}. Dates come from the official ticket listings.`,
      url: `${SITE_URL}/artists/${g.slug}?added=${weekKey}&in=${citySlug}`,
      storyType: 'new_dates' as const,
      priority: g.capacity >= 5000 ? 'high' as const : 'normal' as const,
      artistId: g.artistId,
      artistName: g.artistName,
      autoPublish: true,
      dedupeKey: `show:${g.slug}:${citySlug}:${weekKey}`,
    }
  })
}

/** "{Artist} at {Venue}: tickets on sale {day}, {time}" for on-sales in the next week. */
export function buildCityOnSaleItems(
  rows: NewShowRow[],
  cityNames: string[],
  nowMs: number,
  opts: { perCity?: number; minCapacity?: number; skipKeys?: Set<string> } = {},
): DraftNewsItem[] {
  const horizon = nowMs + ONSALE_LOOKAHEAD_DAYS * 86_400_000
  const groups = groupActsByCity(
    rows,
    cityNames,
    r => {
      const onsale = validOnsale(r.public_onsale_start)
      return onsale !== null && onsale > nowMs && onsale <= horizon
    },
    opts.minCapacity ?? CITY_ITEM_MIN_CAPACITY,
  )
  return takePerCity(groups, opts.perCity ?? CITY_ITEMS_PER_CITY_PER_RUN, opts.skipKeys ?? new Set()).map(g => {
    // Earliest on-sale among this act's shows in the city.
    const onsaleISO = g.shows
      .map(s => s.public_onsale_start as string)
      .sort((a, b) => new Date(a).getTime() - new Date(b).getTime())[0]
    const venue = g.shows[0].venue_name ?? g.city
    const headline = `${g.artistName} at ${venue}: tickets go on sale ${shortUkDate(onsaleISO)}, ${ukTimeLabel(onsaleISO)}`
    const citySlug = citySlugOf(g.city)
    return {
      scope: 'city' as const,
      cityName: g.city,
      citySlug,
      headline,
      summary: `${headline}. Check the event page for presale details and the latest availability.`,
      url: `${SITE_URL}/artists/${g.slug}?onsale=${ukDay(onsaleISO)}&in=${citySlug}`,
      storyType: 'presale' as const,
      priority: g.capacity >= 5000 ? 'high' as const : 'normal' as const,
      artistId: g.artistId,
      artistName: g.artistName,
      autoPublish: true,
      dedupeKey: `onsale:${g.slug}:${citySlug}:${ukDay(onsaleISO)}`,
    }
  })
}

/** Pull the artist slug back out of a draft URL we created (for skip lists). */
export function artistSlugFromDraftUrl(url: string): string | null {
  const m = /\/artists\/([^/?#]+)/.exec(url)
  return m ? m[1] : null
}
