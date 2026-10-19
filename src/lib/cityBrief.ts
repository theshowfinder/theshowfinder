// Pure logic for a city's "morning edition": the image-led block at the top of a city page that
// says what is on tonight, what goes on sale today, which presales are live and what is new. It
// is built only from our own event data, so it is as fresh as the sync. No '@/' imports so it
// runs under `node --test`.
import { isTonightEvent, londonDayWindow } from './tonight.ts'
import { isPackageOrClassTitle, seriesKey } from './eventTitles.ts'

export type EditionKind = 'tonight' | 'onsale_today' | 'presale_live' | 'new' | 'soon' | 'next_up'

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
  today: T[]          // starts today (London day)
  soon: T[]           // starts in the following week
  onSaleToday: T[]    // public on-sale date is today
  presaleOpen: T[]    // presale window open now
  fresh: T[]          // newly listed
  upcoming: T[]       // next shows overall, used when the week is quiet
}

const LABELS: Record<EditionKind, string> = {
  tonight: 'Tonight',
  onsale_today: 'On sale today',
  presale_live: 'Presale live',
  new: 'New listing',
  soon: 'This week',
  next_up: 'Coming up',
}

const DAY_FMT = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', weekday: 'short', day: 'numeric', month: 'short' })
const TIME_FMT = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit', hour12: false })

export function londonTime(iso: string): string {
  return TIME_FMT.format(new Date(iso))
}

export function londonDay(iso: string): string {
  return DAY_FMT.format(new Date(iso))
}

function whenLabel(kind: EditionKind, event: EditionEvent): string {
  const time = londonTime(event.start_date)
  if (kind === 'tonight') return `Tonight · ${time}`
  return `${londonDay(event.start_date)} · ${time}`
}

const isLive = (e: EditionEvent) => e.status !== 'cancelled' && e.status !== 'postponed'

/**
 * Pick the tiles for the edition. Order is by urgency (tonight, then today's on-sales, live presales,
 * new listings, the rest of the week). One tile per show: package/class listings are dropped and
 * repeat dates of one series collapse to the earliest.
 */
export function buildEdition<T extends EditionEvent>(input: EditionInput<T>, limit = 7): EditionTile<T>[] {
  const { now } = input
  const window = londonDayWindow(now)
  const seenIds = new Set<string>()
  const seenSeries = new Set<string>()
  const tiles: EditionTile<T>[] = []

  const take = (list: T[], kind: EditionKind, max: number) => {
    let added = 0
    for (const event of list) {
      if (tiles.length >= limit || added >= max) return
      if (seenIds.has(event.id) || !isLive(event) || isPackageOrClassTitle(event.title)) continue
      const key = seriesKey(event.title)
      if (seenSeries.has(key)) continue
      seenIds.add(event.id)
      seenSeries.add(key)
      tiles.push({ event, kind, label: LABELS[kind], when: whenLabel(kind, event) })
      added++
    }
  }

  const byStart = <E extends EditionEvent>(list: E[]) => [...list].sort((a, b) => a.start_date.localeCompare(b.start_date))
  const tonight = byStart(input.today).filter(e => isTonightEvent({ start_date: e.start_date, end_date: e.end_date ?? null, status: e.status }, now.getTime(), window))

  take(tonight, 'tonight', 3)
  take(byStart(input.onSaleToday), 'onsale_today', 2)
  take(byStart(input.presaleOpen), 'presale_live', 2)
  take(byStart(input.fresh), 'new', 2)
  take(byStart(input.soon), 'soon', limit)
  // A quiet week still gets a page worth opening: show what is next.
  if (tiles.length < 4) take(byStart(input.upcoming), 'next_up', 4 - tiles.length + 2)
  return tiles
}

export interface HeadlineInput {
  cityName: string
  tonight: number
  onSaleToday: number
  presaleLive: number
  thisWeek: number
  next: { title: string; start_date: string } | null
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** One factual line for the top of the page, built only from counts we hold. */
export function editionHeadline(h: HeadlineInput): string {
  const parts: string[] = []
  if (h.tonight > 0) parts.push(`${plural(h.tonight, 'show', 'shows')} tonight`)
  if (h.onSaleToday > 0) parts.push(`${plural(h.onSaleToday, 'show', 'shows')} on sale today`)
  if (h.presaleLive > 0) parts.push(`${plural(h.presaleLive, 'presale', 'presales')} open`)
  if (parts.length === 0 && h.thisWeek > 0) parts.push(`${plural(h.thisWeek, 'show', 'shows')} in the next 7 days`)
  if (parts.length > 0) return `${h.cityName} today: ${parts.join(', ')}`
  if (h.next) return `Quiet week in ${h.cityName}. Next up: ${h.next.title}, ${londonDay(h.next.start_date)}`
  return `What's on in ${h.cityName}`
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
