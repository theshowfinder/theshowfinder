// Pure logic for a city's headline edition: the image-led block at the top of a city page. It leads
// with what is on sale this week (the freshest, most actionable thing), then live presales, then the
// city's top events. It is deliberately NOT a "what's happening this week" list. Built only from our
// own event data, so it is as fresh as the sync. No '@/' imports so it runs under `node --test`.
import { isPackageOrClassTitle, seriesKey } from './eventTitles.ts'
import { isAttraction } from './eventMix.ts'

export type EditionKind = 'onsale_today' | 'onsale_week' | 'presale_live' | 'top'

export interface EditionEvent {
  id: string
  title: string
  slug: string
  start_date: string
  end_date?: string | null
  status: string
  image_url: string | null
  category: string
  venue_name: string | null
  venue_capacity?: number | null
  venue_slug?: string | null
  presale_end?: string | null
  presale_name?: string | null
  onsale_date?: string | null
}

export interface EditionTile<T extends EditionEvent = EditionEvent> {
  event: T
  kind: EditionKind
  label: string
  when: string
}

export interface EditionInput<T extends EditionEvent = EditionEvent> {
  now: Date
  onSaleToday: T[]    // public on-sale date is today
  onSaleWeek: T[]     // public on-sale date falls in the current on-sale week
  presaleOpen: T[]    // presale window open now
  top: T[]            // the city's biggest upcoming shows, most prominent first
}

const LABELS: Record<EditionKind, string> = {
  onsale_today: 'On sale today',
  onsale_week: 'On sale this week',
  presale_live: 'Presale live',
  top: 'Top event',
}

const DAY_FMT = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', weekday: 'short', day: 'numeric', month: 'short' })
const TIME_FMT = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit', hour12: false })

export function londonTime(iso: string): string {
  return TIME_FMT.format(new Date(iso))
}

export function londonDay(iso: string): string {
  return DAY_FMT.format(new Date(iso))
}

const YEAR_FMT = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', year: 'numeric' })

/**
 * "Fri 29 Oct", or "Fri 29 Oct 2027" when the show is in a different calendar year from today. A tour
 * that goes on sale this week often plays a year ahead, and a bare "Fri 29 Oct" reads as this month.
 */
export function londonDayWithYear(iso: string, now: Date): string {
  const year = YEAR_FMT.format(new Date(iso))
  return year === YEAR_FMT.format(now) ? londonDay(iso) : `${londonDay(iso)} ${year}`
}

function whenLabel(event: EditionEvent, now: Date): string {
  return `${londonDayWithYear(event.start_date, now)} · ${londonTime(event.start_date)}`
}

const isLive = (e: EditionEvent) => e.status !== 'cancelled' && e.status !== 'postponed'

/**
 * Pick the tiles. Order: shows going on sale today, then this week's on-sales, then live presales, then
 * the city's top events fill the rest. Within each group the biggest show comes first, so the large lead
 * tile is the most prominent thing on sale. One tile per show: package/class listings and timed-entry
 * attractions (Sea Life, Tussauds, waterparks) are dropped, repeat dates of one series collapse to one,
 * and no venue supplies more than two top-event tiles.
 */
export function buildEdition<T extends EditionEvent>(input: EditionInput<T>, limit = 7): EditionTile<T>[] {
  const seenIds = new Set<string>()
  const seenSeries = new Set<string>()
  const topPerVenue = new Map<string, number>()
  const tiles: EditionTile<T>[] = []

  const take = (list: T[], kind: EditionKind, max: number) => {
    let added = 0
    for (const event of list) {
      if (tiles.length >= limit || added >= max) return
      if (seenIds.has(event.id) || !isLive(event) || isPackageOrClassTitle(event.title) || isAttraction(event)) continue
      const key = seriesKey(event.title)
      if (seenSeries.has(key)) continue
      if (kind === 'top') {
        const venue = event.venue_name ?? ''
        if ((topPerVenue.get(venue) ?? 0) >= 2) continue
        topPerVenue.set(venue, (topPerVenue.get(venue) ?? 0) + 1)
      }
      seenIds.add(event.id)
      seenSeries.add(key)
      tiles.push({ event, kind, label: LABELS[kind], when: whenLabel(event, input.now) })
      added++
    }
  }

  const byProminence = <E extends EditionEvent>(list: E[]) =>
    [...list].sort((a, b) => (b.venue_capacity ?? 0) - (a.venue_capacity ?? 0) || a.start_date.localeCompare(b.start_date))

  take(byProminence(input.onSaleToday), 'onsale_today', 2)
  take(byProminence(input.onSaleWeek), 'onsale_week', 4 - tiles.length)
  take(byProminence(input.presaleOpen), 'presale_live', 1)
  take(input.top, 'top', limit)
  return tiles
}

export interface HeadlineInput {
  cityName: string
  onSaleThisWeek: number
  presaleLive: number
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** One factual line for the top of the page, built only from counts we hold. */
export function editionHeadline(h: HeadlineInput): string {
  const parts: string[] = []
  if (h.onSaleThisWeek > 0) parts.push(`${plural(h.onSaleThisWeek, 'show', 'shows')} on sale this week`)
  if (h.presaleLive > 0) parts.push(`${plural(h.presaleLive, 'presale', 'presales')} open`)
  return parts.length > 0 ? `${h.cityName}: top events, ${parts.join(', ')}` : `Top events in ${h.cityName}`
}

export const FRESH_WINDOW_MS = 36 * 3_600_000

/**
 * "Updated 06:12 today" taken from the city's real latest refresh. Returns null when the data is not
 * fresh, so the page never claims a freshness it cannot back up.
 */
export function freshnessStamp(lastSyncedISO: string | null | undefined, now: Date): string | null {
  if (!lastSyncedISO) return null
  const at = new Date(lastSyncedISO).getTime()
  if (!Number.isFinite(at) || now.getTime() - at > FRESH_WINDOW_MS || at > now.getTime() + 60_000) return null
  const sameDay = londonDay(lastSyncedISO) === londonDay(now.toISOString())
  return `Updated ${sameDay ? '' : 'yesterday '}${londonTime(lastSyncedISO)}${sameDay ? ' today' : ''}`
}

/** Oldest refresh among the rows; null if any row has never been refreshed or there are none. */
export function stalestSync(rows: Array<{ last_synced_at: string | null }>): string | null {
  if (rows.length === 0) return null
  let oldest: string | null = null
  for (const r of rows) {
    if (!r.last_synced_at) return null
    if (oldest === null || r.last_synced_at < oldest) oldest = r.last_synced_at
  }
  return oldest
}
