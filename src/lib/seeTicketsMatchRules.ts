// Pure rules for matching See Tickets feed rows to site events (no '@/' imports, so it runs under `node --test`).
// src/lib/seeTicketsMatching.ts loads the data and writes the results.

export interface StRow {
  id: string
  name: string
  event_date: string | null
  /** Local start time from the feed, "19:30" (null when the feed has none). */
  event_time?: string | null
  venue: string | null
  city: string | null
  primary_artist: string | null
  second_artist: string | null
  url: string
}

export interface StEvent {
  id: string
  title: string
  start_date: string
  venue: { name: string; city: string } | null
}

const cache = new Map<string, string>()
export function normalize(value: string | null | undefined): string {
  const input = value ?? ''
  const hit = cache.get(input)
  if (hit !== undefined) return hit
  const out = input.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/ø/g, 'o').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()
  if (cache.size > 200_000) cache.clear()
  cache.set(input, out)
  return out
}

export function comparableVenue(value: string | null | undefined): string {
  return normalize(value)
    .replace(/\b(the|o2|ao|live|venue|music|entertainment|centre|center|arena|hall|theatre|theater)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// Words that say nothing about which act it is. Without this, "The Rosadocs" and "The Teenagers" shared half their
// words ("the") and landed in the review queue; so did every "... Live" / "... Tour" pair.
const STOP = new Set(['the', 'and', 'with', 'live', 'tour', 'show', 'shows', 'tickets', 'ticket', 'presents', 'present', 'night', 'evening', 'special', 'guests', 'guest', 'plus', 'feat', 'featuring', 'concert', 'comedy', 'club', 'party', 'from', 'for', 'over', 'only', 'early', 'late', 'matinee', 'part', 'anniversary', 'years', 'year', 'celebrating', 'uk', 'world', 'european', 'europe', 'new', 'all', 'you', 'your', 'our', 'his', 'her', 'their', 'one', 'two'])
const tokenCache = new Map<string, Set<string>>()
export function tokens(value: string | null | undefined): Set<string> {
  const input = value ?? ''
  const hit = tokenCache.get(input)
  if (hit) return hit
  const set = new Set(normalize(input).split(' ').filter(t => t.length > 2 && !STOP.has(t)))
  if (tokenCache.size > 200_000) tokenCache.clear()
  tokenCache.set(input, set)
  return set
}

export function overlap(left: string | null | undefined, right: string | null | undefined): number {
  const a = tokens(left), b = tokens(right)
  if (!a.size || !b.size) return 0
  let shared = 0
  for (const t of a) if (b.has(t)) shared++
  return shared / Math.max(a.size, b.size)
}

const LONDON = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
const partsCache = new Map<string, { day: string; minutes: number | null }>()
function london(iso: string) {
  const hit = partsCache.get(iso)
  if (hit) return hit
  const p = LONDON.formatToParts(new Date(iso))
  const g = (t: string) => p.find(x => x.type === t)?.value ?? ''
  const m = Number(g('hour')) * 60 + Number(g('minute'))
  const out = { day: `${g('year')}-${g('month')}-${g('day')}`, minutes: m === 0 ? null : m }   // midnight = time not announced
  if (partsCache.size > 100_000) partsCache.clear()
  partsCache.set(iso, out)
  return out
}
export function dateOnly(value: string | null): string {
  if (!value) return ''
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value
  return Number.isNaN(new Date(value).getTime()) ? value.slice(0, 10) : london(value).day
}
export function eventMinutes(startIso: string): number | null { return london(startIso).minutes }
export function feedMinutes(time: string | null | undefined): number | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(time ?? '')
  if (!m) return null
  const v = Number(m[1]) * 60 + Number(m[2])
  return v === 0 ? null : v
}

/** Start times further apart than this are another performance (early / late show, matinee). */
export const OTHER_PERFORMANCE_MINUTES = 90

const names = (r: StRow) => [r.primary_artist, r.second_artist, r.name].filter(Boolean) as string[]

/** The cheap test every candidate must pass before full scoring. */
export function hasTitleEvidence(row: StRow, event: StEvent): boolean {
  const title = normalize(event.title)
  for (const n of names(row)) {
    const c = normalize(n)
    if (c && title && (title === c || title.includes(c) || c.includes(title))) return true
  }
  for (const n of names(row)) if (overlap(n, event.title) >= 0.35) return true
  return false
}

export interface ScoreDetail {
  value: number
  titleMatch: boolean
  titleOverlap: number
  sameDate: boolean
  sameCity: boolean
  venueExact: boolean
  venueOverlap: number
  /** Minutes between the feed's start time and the event's, null when either is unknown. */
  timeGap: number | null
}

export function score(row: StRow, event: StEvent): ScoreDetail {
  const title = normalize(event.title)
  const titleMatch = names(row).some(n => {
    const c = normalize(n)
    return Boolean(c && title && (title === c || title.includes(c) || c.includes(title)))
  })
  const titleOverlap = Math.max(...names(row).map(n => overlap(n, event.title)), 0)
  const sameDate = dateOnly(row.event_date) === dateOnly(event.start_date)
  const sameCity = normalize(row.city) === normalize(event.venue?.city)
  const venueExact = Boolean(comparableVenue(row.venue) && comparableVenue(row.venue) === comparableVenue(event.venue?.name))
  const venueOverlap = Math.max(overlap(row.venue, event.venue?.name ?? null), overlap(comparableVenue(row.venue), comparableVenue(event.venue?.name)))
  const a = feedMinutes(row.event_time), b = eventMinutes(event.start_date)
  const timeGap = a !== null && b !== null ? Math.abs(a - b) : null
  let value = titleMatch ? 0.55 : titleOverlap * 0.55
  if (sameDate) value += 0.25
  if (sameCity) value += 0.1
  value += venueExact ? 0.1 : venueOverlap * 0.1
  // Same performance: a small lift, so the 19:45 late show beats the 17:00 early show of the same act and venue.
  if (timeGap !== null) value += timeGap <= 30 ? 0.05 : timeGap > OTHER_PERFORMANCE_MINUTES ? -0.1 : 0
  // The feed's full title is the event's title: wins a tie with another show by the same act ("Phil Wang: UH OH" over
  // "Phil Wang: Wang in There, Baby!", "Flo & Joan - With Feeling" over "Flo & Joan - The Tivoli Theatre").
  const bare = (s: string | null | undefined) => normalize(s).replace(/\band\b/g, ' ').replace(/\s+/g, '')
  if (bare(row.name) && bare(row.name) === bare(event.title)) value += 0.05
  return { value, titleMatch, titleOverlap, sameDate, sameCity, venueExact, venueOverlap, timeGap }
}

export interface Decision<E extends StEvent> {
  status: 'auto_matched' | 'review' | 'no_match'
  best: { event: E; detail: ScoreDetail } | null
}

/**
 * `candidates` must already be live, canonical (no premium / restaurant / duplicate copies) events on the row's date.
 * Auto-match: strong title, same date, same town or venue, and clearly ahead of the next candidate.
 */
export function decide<E extends StEvent>(row: StRow, candidates: E[]): Decision<E> {
  const ranked = candidates
    .filter(e => hasTitleEvidence(row, e))
    .map(event => ({ event, detail: score(row, event) }))
    .filter(c => c.detail.titleMatch || c.detail.titleOverlap >= 0.35)
    .sort((a, b) => b.detail.value - a.detail.value || a.event.id.localeCompare(b.event.id))
  const best = ranked[0] ?? null, second = ranked[1]
  if (!best) return { status: 'no_match', best: null }
  const d = best.detail
  const location = d.sameCity || d.venueExact || d.venueOverlap >= 0.5
  const strongTitle = d.titleMatch || d.titleOverlap >= 0.75
  const clear = !second || d.value - second.detail.value >= 0.05 - 1e-9
  if (strongTitle && d.sameDate && location && clear) return { status: 'auto_matched', best }
  if (d.sameDate && location && d.value >= 0.35) return { status: 'review', best }
  return { status: 'no_match', best }
}

export interface LinkedRow { id: string; url: string; event_time: string | null; manual: boolean }

/**
 * Which See Tickets link an event shows when several feed rows point at it (See Tickets often lists one show twice).
 * A manually linked row wins; otherwise the current link stays if it is still one of them (no churn); otherwise the
 * row whose start time is closest to the event's.
 */
export function chooseEventUrl(current: string | null, eventStartIso: string, rows: LinkedRow[]): string | null {
  if (!rows.length) return null
  const manual = rows.filter(r => r.manual)
  if (manual.length) return manual.some(r => r.url === current) ? current : [...manual].sort((a, b) => a.id.localeCompare(b.id))[0].url
  if (current && rows.some(r => r.url === current)) return current
  const at = eventMinutes(eventStartIso)
  const gap = (r: LinkedRow) => { const m = feedMinutes(r.event_time); return at === null || m === null ? 999 : Math.abs(at - m) }
  return [...rows].sort((a, b) => gap(a) - gap(b) || a.id.localeCompare(b.id))[0].url
}
