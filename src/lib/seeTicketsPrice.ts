// "From £x" for events Ticketmaster gives no price for. See Tickets' own feed
// carries a face-value minimum/maximum per listing, and the matcher has already
// linked listings to our events (see_tickets_catalogue_events.matched_event_id).
// Pure logic (no '@/' imports) so it runs under `node --test`.

// Feed minimums below this are usually add-on or concession products (a £1
// booking-fee line, a child ticket) rather than a real starting price, and
// "From £1" on a gig page would mislead — so they are ignored.
export const MIN_PLAUSIBLE_FROM_PRICE = 5

export interface CatalogueRowPrice {
  min_price: number | string | null
  max_price: number | string | null
}

export interface SeeTicketsPrice {
  from: number
  to: number | null
}

function num(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : null
}

// Lowest plausible minimum across an event's matched listings; `to` is the
// highest maximum that is above it (else null). Returns null when nothing usable.
export function pickSeeTicketsPrice(rows: CatalogueRowPrice[] | null | undefined): SeeTicketsPrice | null {
  let from: number | null = null
  let top: number | null = null
  for (const row of rows ?? []) {
    const min = num(row.min_price)
    if (min === null || min < MIN_PLAUSIBLE_FROM_PRICE) continue
    if (from === null || min < from) from = min
    const max = num(row.max_price)
    if (max !== null && (top === null || max > top)) top = max
  }
  if (from === null) return null
  return { from, to: top !== null && top > from ? top : null }
}
