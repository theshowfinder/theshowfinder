// Turns event rows into subscribable calendar entries:
//   • show feeds   — a city's, venue's or artist's upcoming shows
//   • on-sale feed — the moments tickets go on sale or presales open, each with a
//                    pop-up reminder, so people are alerted at the right minute
//
// Pure functions (relative '.ts' imports only) so `node --test` runs them.
import type { CalendarEvent } from './ics.ts'
import { isNewsworthyArtistName, ukDay } from './newShows.ts'

const BASE = 'https://www.theshowfinder.com'
const DAY = 86_400_000

/** "O2 Academy Oxford, Oxford": venue then city, without repeating a city the venue name already contains, and trimmed. */
export function placeLabel(venue: string | null | undefined, city: string | null | undefined): string {
  const v = (venue ?? '').trim()
  const c = (city ?? '').trim()
  if (!v) return c
  if (!c || v.toLowerCase().includes(c.toLowerCase())) return v
  return `${v}, ${c}`
}

export interface FeedRow {
  slug: string
  title: string
  start_date: string
  venue_name: string | null
  venue_city: string | null
  public_onsale_start: string | null
  presale_start: string | null
  presale_name: string | null
}

function norm(s: string): string { return s.trim().toLowerCase().replace(/\s+/g, ' ') }

/** Calendar entries for upcoming shows. Hospitality/parking listings and same-day duplicates are dropped. */
export function showFeedEvents(rows: FeedRow[], max = 500): CalendarEvent[] {
  const seen = new Set<string>()
  const out: CalendarEvent[] = []
  const sorted = [...rows].sort((a, b) => a.start_date.localeCompare(b.start_date))
  for (const r of sorted) {
    if (!isNewsworthyArtistName(r.title)) continue
    const key = `${norm(r.title)}|${norm(r.venue_name ?? '')}|${ukDay(r.start_date)}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({
      uid: `show-${r.slug}`,
      title: r.venue_name ? `${r.title} at ${r.venue_name}` : r.title,
      startISO: r.start_date,
      location: placeLabel(r.venue_name, r.venue_city) || null,
      description: `Compare tickets: ${BASE}/events/${r.slug}`,
      url: `${BASE}/events/${r.slug}`,
    })
    if (out.length >= max) break
  }
  return out
}

function usable(iso: string | null): number | null {
  if (!iso) return null
  const t = new Date(iso).getTime()
  return Number.isFinite(t) && t >= Date.UTC(2020, 0, 1) ? t : null
}

/**
 * One entry per (show, kind, moment): a tour going on sale at the same instant in
 * eight cities is one calendar entry, not eight.
 */
export function onSaleFeedEvents(rows: FeedRow[], nowMs: number, opts: { horizonDays?: number; max?: number } = {}): CalendarEvent[] {
  const horizon = nowMs + (opts.horizonDays ?? 45) * DAY
  const groups = new Map<string, { kind: 'general' | 'presale'; presaleName: string | null; title: string; instant: number; rows: FeedRow[] }>()
  for (const r of rows) {
    if (!isNewsworthyArtistName(r.title)) continue
    const moments: [number | null, 'general' | 'presale'][] = [
      [usable(r.public_onsale_start), 'general'],
      [usable(r.presale_start), 'presale'],
    ]
    for (const [t, kind] of moments) {
      if (t === null || t <= nowMs || t > horizon) continue
      // Tickets cannot go on sale at or after the show starts: bad data (door sales etc.).
      if (t >= new Date(r.start_date).getTime()) continue
      const name = kind === 'presale' ? (r.presale_name ?? '').trim() : ''
      const key = `${norm(r.title)}|${kind}|${norm(name)}|${t}`
      const g = groups.get(key) ?? { kind, presaleName: name || null, title: r.title, instant: t, rows: [] }
      g.rows.push(r)
      groups.set(key, g)
    }
  }
  const out: CalendarEvent[] = []
  for (const g of [...groups.values()].sort((a, b) => a.instant - b.instant)) {
    const slugs = g.rows.map(r => r.slug).sort()
    const where = [...new Set(g.rows.map(r => placeLabel(r.venue_name, r.venue_city)).filter(Boolean))]
    const label = g.kind === 'presale'
      ? `Presale${g.presaleName ? ` (${g.presaleName})` : ''}: ${g.title}`
      : `Tickets on sale: ${g.title}`
    const multi = where.length > 1
    out.push({
      uid: `onsale-${g.kind}-${slugs[0]}-${g.instant}`,
      title: multi ? `${label} (${where.length} UK dates)` : label,
      startISO: new Date(g.instant).toISOString(),
      durationHours: 0.5,
      alarmMinutesBefore: 15,
      location: multi ? null : (where[0] ?? null),
      description: `${where.slice(0, 8).join('; ')}${where.length > 8 ? `; and ${where.length - 8} more` : ''}. Compare ticket options: ${BASE}/events/${slugs[0]}`,
      url: multi ? `${BASE}/on-sale-this-week` : `${BASE}/events/${slugs[0]}`,
    })
    if (out.length >= (opts.max ?? 300)) break
  }
  return out
}

/** webcal:// address (what calendar apps open to subscribe) for a feed path. */
export function webcalUrl(path: string): string {
  return `webcal://www.theshowfinder.com${path}`
}

/** Google Calendar "add by URL" link for a feed path. */
export function googleSubscribeUrl(path: string): string {
  return `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcalUrl(path))}`
}

export function cityFeedPath(cityName: string): string {
  return `/calendar/cities/${encodeURIComponent(cityName)}.ics`
}
export const ONSALE_FEED_PATH = '/calendar/on-sale.ics'
