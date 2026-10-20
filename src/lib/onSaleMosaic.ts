// The homepage "On sale this week" mosaic: one big tile for the most prominent show going on sale, smaller tiles
// for the rest. Pure logic (no '@/' imports) so it runs under `node --test`. Only shows whose on-sale window falls
// in the current week are ever passed in, so nothing here can add a show that is not on sale this week.
import type { OnSaleGroup } from './on-sale.ts'

// Many venues have no capacity on record (OVO Hydro, Hyde Park, most theatres), and a missing capacity must not
// push a stadium show below a basement gig. When the capacity is unknown it is estimated from the venue's name.
const BIG_VENUE = /\b(stadium|arena|hyde park|park|hydro|wembley|twickenham|murrayfield|racecourse|showground|amphitheatre|castle|ground|fields?|the o2|co-op live|bp pulse live|vaillant live|connexin live)\b/i
const MID_VENUE = /\b(o2|academy|apollo|palladium|forum|hall|theatre|theater|opera|empire|symphony|corn exchange|guildhall|brixton|ritz|palace)\b/i

/** Seats/standing capacity if known, otherwise a rough size from the venue name (only ever used to rank). */
export function venueSize(name: string | null | undefined, capacity: number | null | undefined): number {
  if (capacity && capacity > 0) return capacity
  const n = name ?? ''
  if (BIG_VENUE.test(n)) return 8000
  if (MID_VENUE.test(n)) return 1800
  return 300
}

type RankableEvent = { venue_capacity?: number | null; venue_name?: string | null }

/** Biggest venue first (a show at a 10,000-seat arena leads a 300-seat room), then the earliest sale. */
export function rankOnSaleGroups<G extends Pick<OnSaleGroup, 'onsale_date'> & { events: RankableEvent[] }>(groups: G[]): G[] {
  const size = (g: G) => Math.max(0, ...g.events.map(e => venueSize(e.venue_name, e.venue_capacity)))
  return [...groups].sort((a, b) => size(b) - size(a) || a.onsale_date.localeCompare(b.onsale_date))
}

/**
 * How many tiles fill the grid with no gaps: one 2x2 tile plus a multiple of four small ones is a whole number
 * of rows (4 columns on desktop, and an odd total fills 2 columns on mobile). That means 9, 5 or 1; with fewer
 * than 5 shows every show is still shown.
 */
export function mosaicTileCount(available: number, max = 9): number {
  const n = Math.min(available, max)
  if (n >= 9) return 9
  if (n >= 5) return 5
  return n
}

export function pickOnSaleMosaic<G extends Pick<OnSaleGroup, 'onsale_date'> & { events: RankableEvent[] }>(groups: G[], max = 9): G[] {
  const ranked = rankOnSaleGroups(groups)
  return ranked.slice(0, mosaicTileCount(ranked.length, max))
}
