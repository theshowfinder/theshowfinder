import type { EventWithVenue, Artist } from './types/database'

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
}

// Strip tour/venue suffix from Ticketmaster-style titles:
// "Taylor Swift | The Eras Tour"               → "Taylor Swift"
// "Coldplay: Music of the Spheres"             → "Coldplay"
// "Lewis Capaldi - Broken By Desire"           → "Lewis Capaldi"
// "Theory of a Deadman "The Barricade Tour""   → "Theory of a Deadman"
// "Harry Styles"                               → "Harry Styles"
export function extractArtistName(title: string): string {
  return title.split(/\s+\|\s+|\s*:\s+|\s+[-–—]\s+|\s+"[^"]+"/)[0].trim()
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
function earliestSale(event: EventWithVenue): { date: string; type: SaleType } | null {
  const publicDate = event.public_onsale_start ?? event.onsale_date ?? null
  const presaleDate = event.presale_start ?? null

  if (presaleDate && publicDate) {
    return presaleDate <= publicDate
      ? { date: presaleDate, type: 'presale' }
      : { date: publicDate, type: 'onsale' }
  }
  if (presaleDate) return { date: presaleDate, type: 'presale' }
  if (publicDate)  return { date: publicDate,  type: 'onsale' }
  return null
}

export function groupEventsByArtist(
  events:  EventWithVenue[],
  artists: Artist[],
): OnSaleGroup[] {
  const artistByName = new Map(artists.map(a => [a.name.toLowerCase(), a]))
  const groupMap     = new Map<string, OnSaleGroup>()

  for (const event of events) {
    const artistName = extractArtistName(event.title)
    const slug       = toSlug(artistName)
    const dbArtist   = artistByName.get(artistName.toLowerCase()) ?? null
    const sale       = earliestSale(event)

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

  return [...groupMap.values()].sort((a, b) =>
    a.onsale_date.localeCompare(b.onsale_date)
  )
}

export function fmtOnSaleLabel(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short',
    hour: '2-digit', minute: '2-digit',
  }).replace(',', '') + ' GMT'
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

// "On Sale This Week": public on-sale OR presale window that opened within
// the last 3 days (an event stays visible for a few days after going on
// sale, rather than vanishing from the section the instant "now" passes
// it) through 7 days ahead.
export function onSaleThisWeekWindow(now: Date = new Date()): DateWindow {
  return {
    floorISO: new Date(now.getTime() - 3 * DAY_MS).toISOString(),
    ceilISO:  new Date(now.getTime() + 7 * DAY_MS).toISOString(),
  }
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
