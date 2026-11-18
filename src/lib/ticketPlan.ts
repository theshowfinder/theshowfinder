// Ticket types and discount codes an organiser sets up when they list (event_submissions.ticket_plan):
// e.g. Early bird £8 until 1 Dec, Standard £10, VIP £20, and a code FRIENDS for 20% off.
// discountedPence() mirrors reserve_paid_tickets() (migration 132) so the event page can show the price before paying.
// Pure module (no '@/' imports) so it runs under node --test.
import { parsePricePence } from './tickets.ts'

export const MAX_TICKET_TYPES = 6
export const MAX_DISCOUNT_CODES = 5
export const MIN_DISCOUNTED_PENCE = 100

export interface PlanTicketType { name: string; price_pence: number; capacity: number; sales_end: string | null }
export interface PlanDiscountCode { code: string; percent_off: number | null; amount_off_pence: number | null; max_uses: number | null; expires_at: string | null }
export interface TicketPlan { types: PlanTicketType[]; codes: PlanDiscountCode[] }

/** What the form sends (strings as typed). */
export interface RawTicketPlan {
  types?: Array<{ name?: string; price?: string; capacity?: string; salesEnd?: string }>
  codes?: Array<{ code?: string; kind?: string; amount?: string; maxUses?: string; expires?: string }>
}

const clip = (s: unknown, n: number) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n)
const whole = (s: unknown) => Number(String(s ?? '').replace(/[,\s]/g, ''))

/** "2026-12-01" -> end of that day, London (23:59), as UTC ISO. */
function endOfLondonDay(date: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null
  const noon = new Date(`${date}T12:00:00Z`)
  if (!Number.isFinite(noon.getTime())) return null
  const londonHour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', hourCycle: 'h23' }).format(noon))
  return new Date(Date.parse(`${date}T23:59:00Z`) - (londonHour - 12) * 3600_000).toISOString()
}

export function validateTicketPlan(raw: RawTicketPlan, eventStartIso: string, now: Date = new Date()): { ok: true; value: TicketPlan } | { ok: false; error: string } {
  const typesIn = (raw.types ?? []).filter(t => clip(t.name, 60) || clip(t.price, 12) || clip(t.capacity, 8))
  if (!typesIn.length) return { ok: false, error: 'Please add at least one ticket: a name, a price and how many.' }
  if (typesIn.length > MAX_TICKET_TYPES) return { ok: false, error: `You can have up to ${MAX_TICKET_TYPES} ticket types.` }
  const types: PlanTicketType[] = []
  for (const [i, t] of typesIn.entries()) {
    const label = typesIn.length > 1 ? `Ticket ${i + 1}: ` : ''
    const name = clip(t.name, 60) || (typesIn.length === 1 ? 'Ticket' : '')
    if (!name) return { ok: false, error: `${label}please give it a name, for example Standard or VIP.` }
    if (types.some(x => x.name.toLowerCase() === name.toLowerCase())) return { ok: false, error: `Two tickets are called “${name}”. Please give each a different name.` }
    const price = parsePricePence(t.price ?? '')
    if (!price) return { ok: false, error: `${label}please enter the price, between £1 and £1,000 (for example 12.50).` }
    const capacity = whole(t.capacity)
    if (!Number.isInteger(capacity) || capacity < 1 || capacity > 10000) return { ok: false, error: `${label}please say how many are for sale (1 to 10,000).` }
    let salesEnd: string | null = null
    if (clip(t.salesEnd, 10)) {
      salesEnd = endOfLondonDay(clip(t.salesEnd, 10))
      if (!salesEnd) return { ok: false, error: `${label}the “on sale until” date doesn’t look right.` }
      if (Date.parse(salesEnd) < now.getTime()) return { ok: false, error: `${label}the “on sale until” date has already passed.` }
      if (Date.parse(salesEnd) > Date.parse(eventStartIso)) salesEnd = null   // on sale until the event anyway
    }
    types.push({ name, price_pence: price, capacity, sales_end: salesEnd })
  }
  if (types.reduce((n, t) => n + t.capacity, 0) > 10000) return { ok: false, error: 'That’s more than 10,000 tickets in total. Email hello@theshowfinder.com for bigger events.' }

  const codesIn = (raw.codes ?? []).filter(c => clip(c.code, 30) || clip(c.amount, 12))
  if (codesIn.length > MAX_DISCOUNT_CODES) return { ok: false, error: `You can have up to ${MAX_DISCOUNT_CODES} discount codes.` }
  const codes: PlanDiscountCode[] = []
  for (const c of codesIn) {
    const code = clip(c.code, 30).toUpperCase().replace(/\s/g, '')
    if (!/^[A-Z0-9]{3,20}$/.test(code)) return { ok: false, error: 'Discount codes are 3 to 20 letters or numbers, with no spaces (for example FRIENDS20).' }
    if (codes.some(x => x.code === code)) return { ok: false, error: `The code ${code} is in twice.` }
    const percent = c.kind !== 'amount'
    let percentOff: number | null = null, amountOff: number | null = null
    if (percent) {
      percentOff = whole(String(c.amount ?? '').replace('%', ''))
      if (!Number.isInteger(percentOff) || percentOff < 1 || percentOff > 90) return { ok: false, error: `Code ${code}: the discount must be a whole percentage from 1 to 90.` }
    } else {
      const s = String(c.amount ?? '').replace(/[£,\s]/g, '')
      amountOff = /^\d+(\.\d{1,2})?$/.test(s) ? Math.round(Number(s) * 100) : NaN
      if (!Number.isFinite(amountOff) || amountOff < 10 || amountOff > 100000) return { ok: false, error: `Code ${code}: please enter how much off in pounds (for example 2.50).` }
    }
    let maxUses: number | null = null
    if (clip(c.maxUses, 8)) {
      maxUses = whole(c.maxUses)
      if (!Number.isInteger(maxUses) || maxUses < 1 || maxUses > 10000) return { ok: false, error: `Code ${code}: “how many tickets” must be a number from 1 to 10,000, or left blank for no limit.` }
    }
    let expiresAt: string | null = null
    if (clip(c.expires, 10)) {
      expiresAt = endOfLondonDay(clip(c.expires, 10))
      if (!expiresAt || Date.parse(expiresAt) < now.getTime()) return { ok: false, error: `Code ${code}: the end date doesn’t look right.` }
    }
    codes.push({ code, percent_off: percentOff, amount_off_pence: amountOff, max_uses: maxUses, expires_at: expiresAt })
  }
  return { ok: true, value: { types, codes } }
}

/** Ticket price after a code (same rule as the database: never below £1). */
export function discountedPence(pricePence: number, code: { percent_off: number | null; amount_off_pence: number | null } | null): number {
  if (!code) return pricePence
  const off = code.percent_off != null ? Math.round(pricePence * code.percent_off / 100) : (code.amount_off_pence ?? 0)
  return Math.max(pricePence - off, Math.min(pricePence, MIN_DISCOUNTED_PENCE))
}

export function cheapestPence(plan: TicketPlan): number {
  return Math.min(...plan.types.map(t => t.price_pence))
}
