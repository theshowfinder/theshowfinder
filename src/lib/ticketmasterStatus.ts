// How a Ticketmaster Discovery event maps to our event status.
//
// Ticketmaster's Discovery API has no "sold out" code. A show whose public sale has opened and
// which then reports `offsale` is, in practice, sold out (or its sales have closed): fans cannot
// buy it from Ticketmaster any more. Before this, every `offsale` show was stored as "upcoming",
// so a sold-out show kept a Ticketmaster "Get Tickets" button and the Gigsberg option stayed
// buried in "More Ticket Options". Marking it sold_out makes the event page lead with resale
// (Gigsberg first), which is where the affiliate money is.
//
// `offsale` BEFORE the public sale opens is just "not on sale yet" and stays "upcoming".
export type TmStatus = 'upcoming' | 'on_sale' | 'sold_out' | 'cancelled' | 'postponed'

export function mapTicketmasterStatus(
  code: string | null | undefined,
  hasPriceRanges: boolean,
  publicOnsaleStart: string | null | undefined,
  now: Date = new Date(),
): TmStatus {
  const c = (code ?? '').toLowerCase()
  if (c === 'cancelled') return 'cancelled'
  if (c === 'postponed') return 'postponed'
  if (c === 'offsale') {
    const opened = publicOnsaleStart ? Date.parse(publicOnsaleStart) : NaN
    return Number.isFinite(opened) && opened <= now.getTime() ? 'sold_out' : 'upcoming'
  }
  return hasPriceRanges ? 'on_sale' : 'upcoming'
}
