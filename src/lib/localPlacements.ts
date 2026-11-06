// Paid local business placements (migration 091). Featured businesses appear in a
// "Before the show" box on every show page in their city; standard ones only in the
// city's local guide. Pure helpers here, so the rotation rules are testable.

export interface Placement {
  id: string
  city: string
  name: string
  category: string
  description: string | null
  website_url: string | null
  logo_url: string | null
  address: string | null
  postcode: string | null
  package: 'standard' | 'featured'
  /** The advertiser's offer ("10% off with your show ticket"); claimed as a QR voucher (migration 095). */
  offer_text: string | null
  booking_url: string | null
  lat: number | null
  lng: number | null
}

export const PLACEMENT_COLUMNS = 'id, city, name, category, description, website_url, logo_url, address, postcode, package, offer_text, booking_url, lat, lng'

/** How many featured businesses one show page shows. */
export const PER_PAGE = 3

const CATEGORY_LABEL: Record<string, string> = {
  restaurant: 'Restaurant', bar: 'Bar', cafe: 'Café', hotel: 'Hotel', transport: 'Transport',
  parking: 'Parking', beauty: 'Beauty', shop: 'Shop', attraction: 'Things to do', other: 'Local business',
}
export const categoryLabel = (category: string) => CATEGORY_LABEL[category] ?? 'Local business'

function hash(value: string): number {
  let h = 2166136261
  for (let i = 0; i < value.length; i++) { h ^= value.charCodeAt(i); h = Math.imul(h, 16777619) }
  return h >>> 0
}

/**
 * Picks up to `max` featured businesses for one show page. Each page gets a stable starting
 * point from its own id, so with more featured businesses than slots they all get an even
 * share of pages, and a page never reshuffles between visits.
 */
export function pickForPage<T extends { id: string }>(featured: readonly T[], pageKey: string, max = PER_PAGE): T[] {
  const list = [...featured].sort((a, b) => a.id.localeCompare(b.id))
  if (list.length <= max) return list
  const start = hash(pageKey) % list.length
  return Array.from({ length: max }, (_, i) => list[(start + i) % list.length])
}

/** A website link we can safely show (http/https only). */
export function safeWebsite(url: string | null): string | null {
  if (!url) return null
  try {
    const u = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`)
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : null
  } catch { return null }
}

// ── Areas (6 Nov 2026) ────────────────────────────────────────────────────────────────────────────────────────────
// Big cities (London, Glasgow, Manchester…) are too spread out for one city-wide list: a Camden bar is no use to
// someone going to The O2. A partner's "area" is everything within walking distance of them (AREA_RADIUS_M, about a
// mile). Show pages show the nearest Featured partners within that distance; sign-up allows at most three Featured
// (and six Standard) partners within the same distance of each other. Partners without a map position (no postcode)
// are treated as city-wide and only fill spare slots.
export const AREA_RADIUS_M = 1600
export const FEATURED_PER_AREA = 3
export const STANDARD_PER_AREA = 6
// Hotels, parking and transport are places people travel to rather than walk to: shown on shows up to ~3 miles away.
// The sign-up cap still counts partners within AREA_RADIUS_M of each other.
export const TRAVEL_RADIUS_M = 4800
const TRAVEL_CATEGORIES = new Set(['hotel', 'parking', 'transport'])
/** How far from a venue a partner of this category is still shown. */
export const reachFor = (category: string | null | undefined) => (category && TRAVEL_CATEGORIES.has(category) ? TRAVEL_RADIUS_M : AREA_RADIUS_M)

interface Point { lat: number | null; lng: number | null }
// (0, 0) is a placeholder some imports write for "no position", not a real place in the UK.
const hasPoint = (p: Point): p is { lat: number; lng: number } => typeof p.lat === 'number' && typeof p.lng === 'number' && !(p.lat === 0 && p.lng === 0)

/** Straight-line distance in metres (haversine). */
export function metresApart(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6_371_000, rad = Math.PI / 180
  const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

/**
 * The Featured partners for one show page: the nearest ones within walking distance of the venue (closest first),
 * then city-wide partners (no map position) in the spare slots. A venue with no map position only gets city-wide
 * partners, or, in a city with no more than three Featured partners in total, all of them.
 */
export function pickNearbyForPage(featured: readonly Placement[], venue: Point, pageKey: string, max = PER_PAGE): Placement[] {
  const cityWide = featured.filter(p => !hasPoint(p))
  if (!hasPoint(venue)) {
    return featured.length <= max ? pickForPage(featured, pageKey, max) : pickForPage(cityWide, pageKey, max)
  }
  const nearby = featured
    .filter(p => hasPoint(p))
    .map(p => ({ p, d: metresApart(venue, { lat: p.lat as number, lng: p.lng as number }) }))
    .filter(x => x.d <= reachFor(x.p.category))
    .sort((a, b) => a.d - b.d || a.p.id.localeCompare(b.p.id))
    .map(x => x.p)
    .slice(0, max)
  return [...nearby, ...pickForPage(cityWide, pageKey, max - nearby.length)].slice(0, max)
}

/** How many of `others` sit within walking distance of `point` (the sign-up cap check). */
export function countWithinArea(point: { lat: number; lng: number }, others: readonly Point[]): number {
  return others.filter(o => hasPoint(o) && metresApart(point, o) <= AREA_RADIUS_M).length
}

export interface AreaVenue { name: string; lat: number | null; lng: number | null }

/**
 * The area heading for a partner on the city page: "Near <venue>" for the first (biggest) venue in `venues` within
 * walking distance, else "Around <city>". `venues` should be ordered biggest first.
 */
export function areaLabel(point: Point, venues: readonly AreaVenue[], city: string): string {
  if (hasPoint(point)) {
    const near = venues.find(v => hasPoint(v) && metresApart(point, v) <= AREA_RADIUS_M)
    if (near) return `Near ${near.name}`
  }
  return `Around ${city}`
}

/** Groups partners by area heading, keeping the order they came in; "Around <city>" goes last. */
export function groupByArea<T extends Point>(items: readonly T[], venues: readonly AreaVenue[], city: string): { label: string; items: T[] }[] {
  const groups = new Map<string, T[]>()
  for (const item of items) {
    const label = areaLabel(item, venues, city)
    const list = groups.get(label) ?? []
    list.push(item)
    groups.set(label, list)
  }
  const fallback = `Around ${city}`
  return [...groups.entries()]
    .sort(([a], [b]) => (a === fallback ? 1 : 0) - (b === fallback ? 1 : 0))
    .map(([label, list]) => ({ label, items: list }))
}

/** The first (biggest) venue within reach of a partner, with the distance: for "2 min walk from The O2" labels. */
export function nearestAreaVenue(point: Point & { category?: string | null }, venues: readonly AreaVenue[]): { name: string; metres: number } | null {
  if (!hasPoint(point)) return null
  for (const v of venues) {
    if (!hasPoint(v)) continue
    const metres = metresApart(point, v)
    if (metres <= AREA_RADIUS_M) return { name: v.name, metres }
  }
  return null
}

/** UK date key (YYYY-MM-DD): the city-page Featured strip rotates once a day, the same for everyone that day. */
export const dayKey = (now = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
