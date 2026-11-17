// Tickets sold (or given away) through TheShowFinder. Free tickets first; paid tickets reuse the same tables.
// Pure module (no '@/' imports) so it runs under node --test.

export const MAX_FREE_CAPACITY = 5000
export const DEFAULT_MAX_PER_ORDER = 6

export interface ClaimInput { ticketTypeId: string; name: string; email: string; quantity: string | number }
export interface CleanClaim { ticketTypeId: string; name: string; email: string; quantity: number }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function validateClaim(input: ClaimInput, maxPerOrder = 20): { ok: true; value: CleanClaim } | { ok: false; error: string } {
  const name = String(input.name ?? '').replace(/\s+/g, ' ').trim().slice(0, 80)
  const email = String(input.email ?? '').trim().toLowerCase()
  const quantity = Number(input.quantity)
  if (!UUID.test(String(input.ticketTypeId ?? ''))) return { ok: false, error: 'That ticket isn’t available.' }
  if (name.length < 2) return { ok: false, error: 'Please add your name.' }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: 'Please add a valid email address, so we can send your tickets.' }
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > maxPerOrder) return { ok: false, error: `Please choose between 1 and ${maxPerOrder} tickets.` }
  return { ok: true, value: { ticketTypeId: String(input.ticketTypeId), name, email, quantity } }
}

/** The database raises short codes; this is what the person sees. */
export function claimErrorMessage(raw: string | null | undefined): string {
  const m = String(raw ?? '')
  if (m.includes('sold_out')) return 'Sorry, there aren’t enough tickets left for that many. Try fewer.'
  if (m.includes('already_have')) return 'You already have the most tickets one person can get for this event. Check your email for them.'
  if (m.includes('too_many')) return 'That’s more tickets than one person can get for this event.'
  if (m.includes('not_on_sale')) return 'Tickets for this event aren’t available right now.'
  if (m.includes('not_free') || m.includes('not_found')) return 'That ticket isn’t available.'
  return 'Something went wrong. Please try again.'
}

/** What the QR code holds. A prefix so the door scanner can tell our tickets from any other QR code. */
export function ticketQrPayload(code: string): string {
  return `TSF:${code}`
}

/** Reads a scanned QR or a typed code: "TSF:AB12CD34EF", "ab12 cd34 ef" -> "AB12CD34EF". */
export function parseTicketCode(raw: string): string | null {
  const s = String(raw ?? '').trim().toUpperCase().replace(/^TSF:/, '').replace(/[\s-]/g, '')
  return /^[0-9A-F]{10}$/.test(s) ? s : null
}

/** "AB12CD34EF" -> "AB12 CD34 EF", easier to read out at the door. */
export function formatTicketCode(code: string): string {
  return code.replace(/(.{4})(.{4})(.{2})/, '$1 $2 $3')
}

export function ticketsLeft(t: { capacity: number; sold: number }): number {
  return Math.max(0, t.capacity - t.sold)
}

/** CSV for the organiser's attendee list. Quotes every cell; neutralises spreadsheet formulas. */
export function attendeesCsv(rows: { name: string; email: string; ticket: string; code: string; ordered: string; checkedIn: string | null }[]): string {
  const cell = (v: string) => {
    const s = /^[=+\-@]/.test(v) ? `'${v}` : v
    return `"${s.replace(/"/g, '""')}"`
  }
  const head = ['Name', 'Email', 'Ticket', 'Code', 'Ordered', 'Checked in'].map(cell).join(',')
  return [head, ...rows.map(r => [r.name, r.email, r.ticket, formatTicketCode(r.code), r.ordered, r.checkedIn ?? ''].map(cell).join(','))].join('\r\n') + '\r\n'
}
