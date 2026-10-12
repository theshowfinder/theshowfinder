// Grouping and classification for the West End and Attractions hubs.
//
// The events table holds one row per performance, so a long-running show
// (Hamilton, The Mousetrap) has a hundred-plus rows. The hubs present one card
// per SHOW instead — grouped by normalized title + venue — with the next date,
// number of upcoming dates and a "from" price.
//
// Pure module (no '@/' imports) so it runs under `node --test`.

import { normalizeSlotTitle } from './timeSlotCap.ts'
import { isAttraction } from './eventMix.ts'

export interface WestEndVenue {
  /** Canonical display name. */
  name: string
  /** Other spellings seen in feeds. */
  aliases?: string[]
}

// The West End theatres (London's commercial theatre district — the Society of
// London Theatre's "West End" houses). Extend this list as new venues turn up;
// anything not listed simply isn't treated as West End.
export const WEST_END_VENUES: WestEndVenue[] = [
  { name: 'Adelphi Theatre' },
  { name: 'Aldwych Theatre' },
  { name: 'Ambassadors Theatre' },
  { name: 'Apollo Theatre' },
  { name: 'Apollo Victoria Theatre' },
  { name: 'Arts Theatre' },
  { name: 'Bridge Theatre' },
  { name: 'Cambridge Theatre' },
  { name: 'Criterion Theatre' },
  { name: 'Dominion Theatre' },
  { name: 'Duchess Theatre' },
  { name: "Duke of York's Theatre", aliases: ['Duke of Yorks Theatre'] },
  { name: 'Fortune Theatre' },
  { name: 'Garrick Theatre' },
  { name: 'Gielgud Theatre' },
  { name: 'Gillian Lynne Theatre' },
  { name: 'Harold Pinter Theatre' },
  { name: "His Majesty's Theatre", aliases: ['His Majestys Theatre', "Her Majesty's Theatre"] },
  { name: 'London Coliseum' },
  { name: 'London Palladium', aliases: ['The London Palladium'] },
  { name: 'Lyceum Theatre' },
  { name: 'Lyric Theatre' },
  { name: 'Noël Coward Theatre', aliases: ['Noel Coward Theatre'] },
  { name: 'Novello Theatre' },
  { name: 'Palace Theatre' },
  { name: 'Phoenix Theatre' },
  { name: 'Piccadilly Theatre' },
  { name: 'Playhouse Theatre' },
  { name: 'Prince Edward Theatre' },
  { name: 'Prince of Wales Theatre' },
  { name: 'Savoy Theatre' },
  { name: 'Shaftesbury Theatre' },
  { name: 'Sondheim Theatre' },
  { name: "St Martin's Theatre", aliases: ['St Martins Theatre', "Saint Martin's Theatre"] },
  { name: 'The Other Palace', aliases: ['Other Palace'] },
  { name: 'The Theatre at the Hippodrome Casino', aliases: ['Hippodrome Casino', 'Hippodrome Theatre'] },
  { name: 'Theatre Royal Drury Lane', aliases: ['Theatre Royal, Drury Lane', 'Theatre Royal Drury Lane Theatre'] },
  { name: 'Theatre Royal Haymarket', aliases: ['Theatre Royal, Haymarket', 'Theatre Royal Haymarket Theatre'] },
  { name: 'Trafalgar Theatre', aliases: ['Trafalgar Studios'] },
  { name: 'Vaudeville Theatre' },
  { name: 'Victoria Palace Theatre' },
  { name: "Wyndham's Theatre", aliases: ['Wyndhams Theatre'] },
]

export function normalizeVenueName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/^the\s+/, '')
    .replace(/[^a-z0-9]+/g, '')
}

const WEST_END_KEYS = new Set(
  WEST_END_VENUES.flatMap(v => [v.name, ...(v.aliases ?? [])].map(normalizeVenueName)),
)

export function isWestEndVenue(venueName: string | null | undefined, city?: string | null): boolean {
  if (!venueName) return false
  if (city && city.trim().toLowerCase() !== 'london') return false
  return WEST_END_KEYS.has(normalizeVenueName(venueName))
}

// Substrings for a database ILIKE pre-filter (the JS check above is the real
// test). Every name and alias, without a leading "The".
export function westEndVenueSearchTerms(): string[] {
  const terms = WEST_END_VENUES.flatMap(v => [v.name, ...(v.aliases ?? [])])
  return [...new Set(terms.map(t => t.replace(/^the\s+/i, '').replace(/[,()*%]/g, ' ').replace(/\s+/g, ' ').trim()))]
}

export function slugifyShow(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export interface ShowEvent {
  id: string
  slug: string
  title: string
  start_date: string
  status: string
  category?: string | null
  image_url?: string | null
  price_from?: number | null
  price_to?: number | null
  currency?: string | null
  venue_name: string
  venue_slug?: string | null
  venue_city?: string | null
}

export interface ShowDate {
  id: string
  slug: string
  start_date: string
  status: string
  price_from: number | null
}

export interface Show {
  /** URL slug — title + venue. */
  slug: string
  title: string
  venueName: string
  venueSlug: string | null
  venueCity: string | null
  category: string | null
  imageUrl: string | null
  priceFrom: number | null
  currency: string
  status: string
  nextDate: string
  nextEventSlug: string
  dateCount: number
  /** Upcoming performances, soonest first. */
  dates: ShowDate[]
}

const DEAD_STATUSES = new Set(['cancelled', 'postponed'])

function mostCommon(values: string[]): string {
  const counts = new Map<string, number>()
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1)
  let best = values[0] ?? ''
  let bestCount = 0
  for (const [v, c] of counts) if (c > bestCount) { best = v; bestCount = c }
  return best
}

// One Show per normalized title + venue. Cancelled/postponed performances are
// ignored; performances before `now` are ignored. Shows are returned with the
// longest-running first (most upcoming dates), then by title.
export function groupShows(events: ShowEvent[], now: Date = new Date()): Show[] {
  const nowMs = now.getTime()
  const groups = new Map<string, ShowEvent[]>()
  for (const e of events) {
    if (DEAD_STATUSES.has(e.status)) continue
    if (new Date(e.start_date).getTime() < nowMs) continue
    const titleKey = normalizeSlotTitle(e.title)
    if (!titleKey) continue
    const key = `${titleKey}|${normalizeVenueName(e.venue_name)}`
    const g = groups.get(key)
    if (g) g.push(e)
    else groups.set(key, [e])
  }

  const shows: Show[] = []
  for (const g of groups.values()) {
    g.sort((a, b) => a.start_date.localeCompare(b.start_date))
    const first = g[0]
    const title = mostCommon(g.map(e => e.title))
    const prices = g.map(e => e.price_from).filter((p): p is number => typeof p === 'number' && p > 0)
    const liveStatuses = g.map(e => e.status)
    shows.push({
      slug: `${slugifyShow(title)}-${slugifyShow(first.venue_name)}`,
      title,
      venueName: first.venue_name,
      venueSlug: first.venue_slug ?? null,
      venueCity: first.venue_city ?? null,
      category: first.category ?? null,
      imageUrl: g.find(e => e.image_url)?.image_url ?? null,
      priceFrom: prices.length ? Math.min(...prices) : null,
      currency: first.currency ?? 'GBP',
      status: liveStatuses.every(s => s === 'sold_out') ? 'sold_out' : 'on_sale',
      nextDate: first.start_date,
      nextEventSlug: first.slug,
      dateCount: g.length,
      dates: g.map(e => ({
        id: e.id, slug: e.slug, start_date: e.start_date, status: e.status, price_from: e.price_from ?? null,
      })),
    })
  }

  return shows.sort((a, b) => b.dateCount - a.dateCount || a.title.localeCompare(b.title))
}

export function westEndShows(events: ShowEvent[], now?: Date): Show[] {
  return groupShows(events.filter(e => isWestEndVenue(e.venue_name, e.venue_city)), now)
}

export function attractionShows(events: ShowEvent[], now?: Date): Show[] {
  return groupShows(events.filter(e => isAttraction({ title: e.title, venue_name: e.venue_name })), now)
}

export interface VenueSummary { name: string; slug: string | null; shows: number }

// "Browse by theatre" — each venue with how many shows are on there.
export function summarizeVenues(shows: Show[]): VenueSummary[] {
  const map = new Map<string, VenueSummary>()
  for (const s of shows) {
    const key = normalizeVenueName(s.venueName)
    const v = map.get(key)
    if (v) v.shows++
    else map.set(key, { name: s.venueName, slug: s.venueSlug, shows: 1 })
  }
  return [...map.values()].sort((a, b) => b.shows - a.shows || a.name.localeCompare(b.name))
}
