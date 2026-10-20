import type { EventWithVenue, Artist } from './types/database'
import { londonCalendarWeekWindow } from './intelligence.ts'
import { cleanSeriesName, seriesKey, isPackageOrClassTitle } from './eventTitles.ts'

export type SaleType = 'presale' | 'onsale'

export type OnSaleGroup = {
  artistName: string
  slug:        string
  image_url:   string | null
  onsale_date: string    // earliest actionable sale date for the group — a presale
                          // start if one exists and is sooner, otherwise the public
                          // on-sale start. See saleType for which kind it is.
  saleType:    SaleType
  events:      EventWithVenue[]
  dbArtist:    Artist | null
  /** Whole-tour date count, same rule as the click-through page (see attachTourDateCounts). Cards show this. */
  dateCount?:  number
}

/** The number a card should show: the whole tour when known, else the dates in the pool. */
export function groupDateCount(g: Pick<OnSaleGroup, 'events' | 'dateCount'>): number {
  return g.dateCount ?? g.events.length
}

// Strip tour/venue suffix from Ticketmaster-style titles:
// "Taylor Swift | The Eras Tour"               → "Taylor Swift"
// "Coldplay: Music of the Spheres"             → "Coldplay"
// "Lewis Capaldi - Broken By Desire"           → "Lewis Capaldi"
// "Theory of a Deadman "The Barricade Tour""   → "Theory of a Deadman"
// "Harry Styles"                               → "Harry Styles"
export function extractArtistName(title: string): string {
  // Feeds also write the tour part with a tight hyphen ("Jimmy Carr- Killing Jokes",
  // "Lighthouse Family-CELEBRATING THE ICONIC ALBUM") and add "plus special guests".
  // Split those too, so one artist is one tile; real hyphenated names (Blink-182,
  // Jay-Z, Wu-Tang Clan) have neither a space after the hyphen nor a run of capitals after it.
  return title
    .replace(/\s+plus\s+(?:special\s+)?(?:guests?|support)\b.*$/i, '')
    .split(/\s+\|\s+|\s*:\s+|\s+[-–—]\s+|(?<=\w)-\s+|(?<=[a-z])-(?=[A-Z]{3,})|\s+"[^"]+"/)[0]
    .trim()
}

// The slug an On Sale card lives under. Variants of one series (sponsor / edition year
// differences) share it, so they become one card.
export function onSaleSlugOf(title: string): string {
  return seriesKey(extractArtistName(title))
}

export function toSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim()
}

// An event can go "on sale" in two ways: a presale window (fan club, venue,
// card member, etc.) or the general public on-sale. Whichever comes first is
// the one that actually matters to someone trying to catch tickets early, so
// this picks the earliest of the two and tags which kind it is.
function earliestSale(event: EventWithVenue, now?: Date): { date: string; type: SaleType } | null {
  const publicDate = event.public_onsale_start ?? event.onsale_date ?? null
  let presaleDate = event.presale_start ?? null

  // When a clock is given (the live "On Sale This Week" cards), a presale that has
  // already started is no longer what a visitor can act on first: show the public
  // on-sale that is still ahead instead of a presale date from days ago.
  if (now && presaleDate && publicDate && presaleDate <= now.toISOString() && publicDate > now.toISOString()) {
    return { date: publicDate, type: 'onsale' }
  }
  if (now && presaleDate && presaleDate <= now.toISOString() && publicDate && publicDate <= now.toISOString()) {
    // Both already open: the earlier presale date is history; report the public sale.
    presaleDate = null
  }

  if (presaleDate && publicDate) {
    return presaleDate <= publicDate
      ? { date: presaleDate, type: 'presale' }
      : { date: publicDate, type: 'onsale' }
  }
  if (presaleDate) return { date: presaleDate, type: 'presale' }
  if (publicDate)  return { date: publicDate,  type: 'onsale' }
  return null
}

// How long after its sale opens a show still counts as "just released". Anything
// older than this has simply gone on sale and drops off the On Sale This Week cards
// by itself (no manual clean-up, no waiting for Monday).
export const JUST_RELEASED_GRACE_HOURS = 24

// Keep an event only while one of its sale moments (presale start or public
// on-sale) is still ahead or opened within the grace window. Events with no sale
// date at all are left alone (the pool query already requires an on-sale date).
export function dropPastSales<T extends Pick<EventWithVenue, 'presale_start' | 'public_onsale_start' | 'onsale_date'>>(
  events: T[],
  now: Date = new Date(),
  graceHours: number = JUST_RELEASED_GRACE_HOURS,
): T[] {
  const cutoff = new Date(now.getTime() - graceHours * 60 * 60 * 1000).toISOString()
  return events.filter(e => {
    const dates = [e.presale_start, e.public_onsale_start ?? e.onsale_date].filter((d): d is string => !!d)
    if (dates.length === 0) return true
    return dates.some(d => d >= cutoff)
  })
}

// The line under an On Sale This Week card: the date while the sale is ahead,
// "now" once it has opened (still inside the grace window).
export function saleBadgeText(saleType: SaleType, isoDate: string, now: Date = new Date()): string {
  const open = isoDate <= now.toISOString()
  if (open) return saleType === 'presale' ? 'Presale open now' : 'On sale now'
  return `${saleType === 'presale' ? 'Presale opens' : 'On sale'} ${fmtOnSaleLabel(isoDate)}`
}

// VIP / "Venue Premium Tickets" packages and classes ("Fishies Week 7") are products
// or sessions, not shows going on sale: keep them out of the On Sale cards. The normal
// ticket row for the same show is untouched, and the ticket type is chosen on its page.
export function dropPackageListings<T extends { title: string }>(events: T[]): T[] {
  return events.filter(e => !isPackageOrClassTitle(e.title))
}

export function groupEventsByArtist(
  events:  EventWithVenue[],
  artists: Artist[],
  now?:    Date,
): OnSaleGroup[] {
  const artistByName = new Map(artists.map(a => [a.name.toLowerCase(), a]))
  const groupMap     = new Map<string, OnSaleGroup>()

  for (const event of events) {
    const rawName    = extractArtistName(event.title)
    const artistName = cleanSeriesName(rawName)
    const slug       = seriesKey(artistName)
    const dbArtist   = artistByName.get(artistName.toLowerCase()) ?? artistByName.get(rawName.toLowerCase()) ?? null
    const sale       = earliestSale(event, now)

    const existing = groupMap.get(slug)
    if (!existing) {
      groupMap.set(slug, {
        artistName,
        slug,
        image_url:   dbArtist?.image_url ?? event.image_url,
        onsale_date: sale?.date ?? new Date().toISOString(),
        saleType:    sale?.type ?? 'onsale',
        events:      [event],
        dbArtist,
      })
    } else {
      existing.events.push(event)
      if (sale && sale.date < existing.onsale_date) {
        existing.onsale_date = sale.date
        existing.saleType    = sale.type
      }
      if (!existing.image_url) {
        existing.image_url = dbArtist?.image_url ?? event.image_url
      }
    }
  }

  return mergeSameActGroups([...groupMap.values()]).sort((a, b) =>
    a.onsale_date.localeCompare(b.onsale_date)
  )
}

// ── Same act, differently named listings ──────────────────────────────────
//
// Some feeds name one run's dates differently with no delimiter ("The Wiggles",
// "The Wiggles' Sparkle! BIG SHOW", "Pete Tong" / "Pete Tong Classical"), which makes a
// second tile. The title alone can't say whether that is the same act or a different
// one, so we also require the dates to agree: the name must START with the other
// group's name as whole words, AND they go on sale at the same moment (same presale +
// public start), AND some dates fall within 10 days of each other (one continuous
// run). Short single-word names are never merged this way ("Kane" / "Kane Brown"), nor
// are tribute / "music of" / "vs" listings.
const SAME_ACT_MAX_GAP_DAYS = 10
const NOT_THE_SAME_ACT = /\b(tribute|tributes|the\s+(?:music|songs|story)\s+of|vs?\.?|versus|presents)\b/i

function saleMoment(e: EventWithVenue): string {
  return `${e.presale_start ?? ''}|${e.public_onsale_start ?? e.onsale_date ?? ''}`
}

function datesWithinGap(a: EventWithVenue[], b: EventWithVenue[]): boolean {
  const gap = SAME_ACT_MAX_GAP_DAYS * 24 * 60 * 60 * 1000
  return a.some(x => b.some(y => Math.abs(new Date(x.start_date).getTime() - new Date(y.start_date).getTime()) <= gap))
}

export function isSameActRun(base: OnSaleGroup, other: OnSaleGroup): boolean {
  const a = base.artistName.toLowerCase().trim()
  const b = other.artistName.toLowerCase().trim()
  if (a === b || b.length <= a.length || !b.startsWith(a)) return false
  if (!/[^a-z0-9]/.test(b[a.length])) return false                  // whole-word prefix only
  if (a.split(/\s+/).length < 2 && a.length < 8) return false         // too ambiguous on its own
  if (NOT_THE_SAME_ACT.test(b.slice(a.length))) return false
  const moments = new Set(base.events.map(saleMoment))
  if (!other.events.some(e => moments.has(saleMoment(e)))) return false
  return datesWithinGap(base.events, other.events)
}

export function mergeSameActGroups(groups: OnSaleGroup[]): OnSaleGroup[] {
  // Shortest names first, so "Pete Tong Classical" folds into "Pete Tong".
  const sorted = [...groups].sort((x, y) => x.artistName.length - y.artistName.length)
  const kept: OnSaleGroup[] = []
  for (const g of sorted) {
    const base = kept.find(k => isSameActRun(k, g))
    if (!base) { kept.push({ ...g, events: [...g.events] }); continue }
    base.events.push(...g.events)
    if (g.onsale_date < base.onsale_date) { base.onsale_date = g.onsale_date; base.saleType = g.saleType }
    if (!base.image_url) base.image_url = g.image_url
    if (!base.dbArtist) base.dbArtist = g.dbArtist
  }
  return kept
}

// ── Series diversity (Manchester-pilot requirement: don't let one team/
// artist/tour flood "On Sale This Week") ───────────────────────────────
//
// groupEventsByArtist already gives each genuinely distinct fixture its
// own OnSaleGroup/card — "Manchester Storm v Cardiff Devils" and
// "...v Belfast Giants" don't share a pipe/colon/dash delimiter, so
// extractArtistName leaves each fixture's full title intact and they
// never collapse into one group (correct — they're separate events, see
// requirement 14). But that also means a team whose whole home-fixture
// batch happens to go on sale in the same window can fill every slot in
// a limited card list with nothing but that one team. extractSeriesKey
// additionally strips a " v " / " vs" / " versus " opponent suffix,
// purely so capGroupsBySeries (below) has a stable "same team" key to
// cap against — it is never used for grouping/card identity itself.

export function extractSeriesKey(artistOrTitle: string): string {
  const base = extractArtistName(artistOrTitle)
  const vsMatch = base.match(/^(.*?)\s+(?:v|vs\.?|versus)\s+.+$/i)
  return seriesKey(vsMatch ? vsMatch[1].trim() : base)
}

// How many cards from the same series key are allowed into a capped
// "On Sale This Week" list — 2, so a team/tour's existence is still
// visible without being able to flood the whole section. Exported so
// the rule is transparent and the exact number is visible to anyone
// reading the code, not a magic literal buried in a slice() call.
export const ON_SALE_MAX_PER_SERIES = 2

// Deterministic: walks `groups` in whatever order they're already
// sorted in (onsale_date ascending, from groupEventsByArtist) and keeps
// the first `maxPerSeries` encountered per series key, dropping the
// rest. Never merges or deletes a group from the underlying data — a
// dropped fixture is simply not promoted into this particular capped
// display; it's still its own resolvable group everywhere else (e.g.
// the /on-sale-this-week/[slug] detail page, which resolves against the
// full merged pool, not this capped list).
export function capGroupsBySeries(groups: OnSaleGroup[], maxPerSeries: number = ON_SALE_MAX_PER_SERIES): OnSaleGroup[] {
  const counts = new Map<string, number>()
  const kept: OnSaleGroup[] = []
  for (const group of groups) {
    const key = extractSeriesKey(group.artistName)
    const count = counts.get(key) ?? 0
    if (count >= maxPerSeries) continue
    counts.set(key, count + 1)
    kept.push(group)
  }
  return kept
}

// ── On-sale date reliability (requirement: never infer from start_date) ──
//
// States the rule as a plain, testable predicate. The actual exclusion
// of an event with no genuine on-sale date happens for free in the DB
// query itself (events.ts/eventPools.ts filter with .gte/.lte against
// the onsale_date column — a null column value never satisfies a range
// comparison in Postgres), so this isn't called from that query path,
// but it documents and tests the rule explicitly rather than leaving it
// as an implicit side effect of how Postgres nulls behave.
export function hasReliableOnSaleDate(event: Pick<EventWithVenue, 'onsale_date'>): boolean {
  return Boolean(event.onsale_date)
}

export function fmtOnSaleLabel(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { timeZone: 'Europe/London',
    weekday: 'short', day: 'numeric', month: 'short',
    hour: '2-digit', minute: '2-digit', timeZoneName: 'short',
  }).replace(',', '')
}

// ── Shared date windows ──────────────────────────────────────────────────
//
// Root-cause fix for a broken-internal-link bug: the "On Sale This Week"
// family of cards (homepage, /on-sale-this-week listing, city pages) and
// the separate "Presales Open Now" cards both link to
// /on-sale-this-week/[slug], but used to be resolved there by a THIRD,
// independently hand-rolled query with a narrower lookback window — so a
// presale that opened, say, 10 days ago (well within "Presales Open Now"'s
// 21-day lookback, so still shown as a live card) fell outside the detail
// page's 3-day lookback entirely and 404'd on click, even though nothing
// was deleted or malformed — the card and its destination simply disagreed
// about which events were "in window." These two functions are the single
// source of truth for each window's bounds, used by both the card-producing
// queries (src/lib/eventPools.ts) and the detail page, so they can never
// drift apart again.

const DAY_MS = 24 * 60 * 60 * 1000

export interface DateWindow {
  floorISO: string
  ceilISO:  string
}

// "On Sale This Week": the literal Monday-Sunday UK calendar week
// containing `now` — not a rolling lookback. An event that genuinely
// went on public sale last Saturday drops out of "this week" the moment
// Monday turns over, same as a person would read the phrase. Delegates
// to intelligence.ts's londonCalendarWeekWindow (the Europe/London-
// correct Mon-Sun calculation, shared with the admin dashboard) rather
// than re-deriving calendar-week arithmetic a second time here; this
// function's own {floorISO, ceilISO} shape is kept stable since it's
// the public contract every caller (eventPools.ts, linkHealth.ts, the
// city page, every page/test importing it) already depends on.
export function onSaleThisWeekWindow(now: Date = new Date()): DateWindow {
  const { startISO, endISO } = londonCalendarWeekWindow(now)
  return { floorISO: startISO, ceilISO: endISO }
}

// "Presales Open Now": presale_start any time in the last 21 days through
// right now. Real presale windows run days, not months, so 21 days catches
// any genuinely still-running presale while also guarding against a
// corrupted presale_end far in the future (see fetchPresalesOpenNow in
// eventPools.ts, which applies that presale_end condition separately —
// this function models only the presale_start bound).
export function presaleOpenNowWindow(now: Date = new Date()): DateWindow {
  return {
    floorISO: new Date(now.getTime() - 21 * DAY_MS).toISOString(),
    ceilISO:  now.toISOString(),
  }
}

// Merge any number of event pools into one, deduplicating by id (the same
// event can legitimately appear in more than one pool — e.g. a presale
// that's both "open now" and within the on-sale-this-week lookback) and
// sorting by start_date. This is what lets the detail page check a single
// combined candidate pool against every family of card that could have
// linked to it, instead of resolving against just one of them.
export function mergeEventsById(...pools: EventWithVenue[][]): EventWithVenue[] {
  const map = new Map<string, EventWithVenue>()
  for (const pool of pools) {
    for (const event of pool) map.set(event.id, event)
  }
  return [...map.values()].sort((a, b) => a.start_date.localeCompare(b.start_date))
}

// ── Whole-tour view for /on-sale-this-week/[slug] ─────────────────────────
// The on-sale pools only contain dates whose sale starts inside the window, so
// an artist announcing a tour used to show 1-2 dates even when 20 were booked.
// This merges the artist's other upcoming events in, marking which ones are the
// newly on-sale dates so the page can still say what just opened.

// Separate products sold against the same show (VIP/hospitality bundles) are
// not extra tour dates.
const NOT_A_TOUR_DATE = /\b(vip|hospitality|ticket experiences?|packages?|meet\s*(?:&|and)?\s*greets?)\b/i

export function mergeTourDates(
  windowEvents: EventWithVenue[],
  otherEvents:  EventWithVenue[],
): { events: EventWithVenue[]; newIds: Set<string> } {
  const newIds = new Set(windowEvents.map(e => e.id))
  const dayKey = (e: EventWithVenue) => `${(e as { venue_id?: string | null }).venue_id ?? e.venue_name}|${e.start_date.slice(0, 10)}`
  const taken  = new Set(windowEvents.map(dayKey))
  const all    = new Map(windowEvents.map(e => [e.id, e]))

  for (const e of otherEvents) {
    if (all.has(e.id)) continue
    if (NOT_A_TOUR_DATE.test(e.title)) continue
    const key = dayKey(e)
    if (taken.has(key)) continue      // same venue + day already listed
    taken.add(key)
    all.set(e.id, e)
  }

  const events = [...all.values()].sort((a, b) => a.start_date.localeCompare(b.start_date))
  return { events, newIds }
}
