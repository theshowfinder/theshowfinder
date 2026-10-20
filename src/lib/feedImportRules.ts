// Rules for the automatic import of shows that Gigsberg / See Tickets list but we do not have.
// Pure module (relative imports only) so it runs under `node --test`. The point of every rule is
// the same: never create a second page for a show we already have, and never publish a package,
// a past show or a row with no real venue.
import { isPackageOrClassTitle } from './eventTitles.ts'

export interface FeedRow {
  id: string | number
  name: string
  event_date: string | null
  venue: string | null
  city: string | null
  url: string | null
}

/** An event already on the site, reduced to what duplicate detection needs. */
export interface KnownEvent { title: string; date: string; city: string; venue: string }

export function normalize(value: string | null | undefined): string {
  return (value ?? '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()
}

export function comparableVenue(value: string | null | undefined): string {
  return normalize(value)
    .replace(/\b(the|o2|ao|live|venue|music|entertainment|centre|center|arena|hall|theatre|theater|formerly|sse)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function overlap(left: string | null | undefined, right: string | null | undefined): number {
  const a = new Set(normalize(left).split(' ').filter(t => t.length > 2))
  const b = new Set(normalize(right).split(' ').filter(t => t.length > 2))
  if (!a.size || !b.size) return 0
  let shared = 0
  for (const t of a) if (b.has(t)) shared++
  return shared / Math.max(a.size, b.size)
}

export type SkipReason = 'no_venue_or_city' | 'no_link' | 'package' | 'not_in_future' | 'duplicate' | 'bad_name'

/**
 * Why this feed row must NOT become a new event, or null if it may.
 * `sameDay` = events already on the site on the row's date (including ones created earlier in this run).
 */
export function skipReason(row: FeedRow, sameDay: KnownEvent[], today: string): SkipReason | null {
  if (!row.name || normalize(row.name).length < 3) return 'bad_name'
  if (!row.venue?.trim() || !row.city?.trim()) return 'no_venue_or_city'
  if (!row.url) return 'no_link'
  if (isPackageOrClassTitle(row.name)) return 'package'
  if (!row.event_date || row.event_date <= today) return 'not_in_future'
  const city = normalize(row.city)
  for (const e of sameDay) {
    const sameCity = normalize(e.city) === city
    const titleHit = (() => {
      const a = normalize(row.name), b = normalize(e.title)
      return Boolean(a && b && (a === b || a.includes(b) || b.includes(a))) || overlap(row.name, e.title) >= 0.35
    })()
    const venueHit = comparableVenue(row.venue) !== '' && (comparableVenue(row.venue) === comparableVenue(e.venue) || overlap(row.venue, e.venue) >= 0.5)
    // Same title anywhere on that day in that city, or the same venue with any title overlap, is the same show.
    if (sameCity && (titleHit || (venueHit && overlap(row.name, e.title) > 0))) return 'duplicate'
    // Same venue on the same day but a different-looking title: a second show in one room, allowed.
  }
  return null
}

/** Local London wall-clock date + time -> UTC ISO string (handles BST). */
export function londonToUtcIso(date: string, time: string | null | undefined): string {
  const t = /^\d{2}:\d{2}(:\d{2})?$/.test(time ?? '') ? (time as string) : '19:00:00'
  const full = t.length === 5 ? `${t}:00` : t
  const guess = Date.parse(`${date}T${full}Z`)
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(guess))
  const get = (type: string) => Number(parts.find(p => p.type === type)?.value)
  const asLondon = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'))
  const offset = asLondon - Date.UTC(new Date(guess).getUTCFullYear(), new Date(guess).getUTCMonth(), new Date(guess).getUTCDate(), new Date(guess).getUTCHours(), new Date(guess).getUTCMinutes())
  return new Date(guess - offset).toISOString()
}

export function slugify(value: string): string {
  return value.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 90)
}
