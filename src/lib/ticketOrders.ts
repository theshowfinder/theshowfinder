// Server side of tickets through TheShowFinder: load an order, email the tickets, check people in.
import { createAdminClient } from '@/lib/supabase/admin'
import { resend, FROM_EMAIL } from '@/lib/resend'
import { formatShareWhen } from '@/lib/shareText'
import { formatTicketCode, gbpFromPence, vatInside } from '@/lib/tickets'

export const SITE = 'https://www.theshowfinder.com'

type Db = ReturnType<typeof createAdminClient>
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const loose = (db: Db) => db as any

export type LoadedOrder = {
  id: string; buyer_name: string; buyer_email: string; quantity: number; status: string; access_token: string; created_at: string
  ticketPricePence: number; feePence: number; totalPence: number; organiserName: string | null
  event: { id: string; title: string; slug: string; start_date: string; status: string; venue: { name: string; city: string; postcode: string | null } | null }
  ticketType: { name: string }
  tickets: { code: string; checked_in_at: string | null }[]
}

export function orderLink(orderId: string, token: string): string {
  return `${SITE}/tickets/${orderId}?t=${token}`
}

/** An order and its tickets, only with the matching private token (from the email link). */
export async function loadOrder(db: Db, orderId: string, token: string): Promise<LoadedOrder | null> {
  if (!/^[0-9a-f-]{36}$/i.test(orderId) || !/^[0-9a-f]{32}$/i.test(token)) return null
  const { data } = await loose(db).from('ticket_orders')
    .select('id, buyer_name, buyer_email, quantity, status, access_token, created_at, ticket_price_pence, fee_pence, total_pence, ticket_types(name), events(id, title, slug, start_date, status, venues(name, city, postcode), organisers(name)), tickets(code, checked_in_at, created_at)')
    .eq('id', orderId).eq('access_token', token).maybeSingle()
  if (!data || !data.events) return null
  const ev = data.events
  return {
    id: data.id, buyer_name: data.buyer_name, buyer_email: data.buyer_email, quantity: data.quantity, status: data.status, access_token: data.access_token, created_at: data.created_at,
    ticketPricePence: data.ticket_price_pence ?? 0, feePence: data.fee_pence ?? 0, totalPence: data.total_pence ?? 0, organiserName: ev.organisers?.name ?? null,
    event: { id: ev.id, title: ev.title, slug: ev.slug, start_date: ev.start_date, status: ev.status, venue: ev.venues ?? null },
    ticketType: { name: data.ticket_types?.name ?? 'Ticket' },
    tickets: [...(data.tickets ?? [])].sort((a: { created_at: string; code: string }, b: { created_at: string; code: string }) => a.created_at.localeCompare(b.created_at) || a.code.localeCompare(b.code)),
  }
}

/** "Paid £32.78: 2 × £15.00 tickets (sold by X) + £2.78 TheShowFinder booking fee (incl. £0.46 VAT)." */
export function paidSummary(o: Pick<LoadedOrder, 'quantity' | 'ticketPricePence' | 'feePence' | 'totalPence' | 'organiserName'>): string {
  return `Paid ${gbpFromPence(o.totalPence)}: ${o.quantity} × ${gbpFromPence(o.ticketPricePence)} ticket${o.quantity === 1 ? '' : 's'} (sold by ${o.organiserName ?? 'the organiser'}) + ${gbpFromPence(o.feePence)} TheShowFinder booking fee (incl. ${gbpFromPence(vatInside(o.feePence))} VAT).`
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** The tickets email: every QR code in the email itself, plus a link to open them on the phone. */
export async function emailTickets(o: LoadedOrder): Promise<void> {
  const when = formatShareWhen(o.event.start_date) ?? ''
  const where = o.event.venue ? `${o.event.venue.name}, ${o.event.venue.city}${o.event.venue.postcode ? ` ${o.event.venue.postcode}` : ''}` : ''
  const link = orderLink(o.id, o.access_token)
  const n = o.tickets.length
  const subject = `Your ${n === 1 ? 'ticket' : `${n} tickets`}: ${o.event.title}`
  const text = [
    `Hi ${o.buyer_name},`,
    `Here ${n === 1 ? 'is your ticket' : `are your ${n} tickets`} for ${o.event.title}.`,
    [when, where].filter(Boolean).join(' · '),
    `Open your tickets on your phone and show the QR code at the door: ${link}`,
    ...o.tickets.map((t, i) => `Ticket ${i + 1}: ${formatTicketCode(t.code)}`),
    ...(o.totalPence > 0 ? [paidSummary(o)] : []),
    `Event details: ${SITE}/events/${o.event.slug}`,
    'Can’t go any more? Just reply to this email and we’ll let the organiser know, so someone else can have your place.',
    'TheShowFinder',
  ].join('\n')
  const ticketsHtml = o.tickets.map((t, i) => `
    <div style="border:2px dashed #CBD5E1;border-radius:16px;padding:16px;margin:0 0 12px;text-align:center">
      <p style="margin:0 0 8px;font-size:12px;font-weight:bold;letter-spacing:1px;text-transform:uppercase;color:#64748B">${esc(o.ticketType.name)} · ${i + 1} of ${n}</p>
      <img src="${SITE}/api/tickets/qr/${t.code}" width="200" height="200" alt="Ticket QR code ${formatTicketCode(t.code)}" style="display:block;margin:0 auto" />
      <p style="margin:8px 0 0;font-family:monospace;font-size:18px;font-weight:bold;letter-spacing:2px">${formatTicketCode(t.code)}</p>
    </div>`).join('')
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#1A1A2E;max-width:560px">
    <p style="margin:0 0 12px">Hi ${esc(o.buyer_name)},</p>
    <h1 style="margin:0 0 4px;font-size:22px">${esc(o.event.title)}</h1>
    <p style="margin:0 0 16px;color:#475569">${esc([when, where].filter(Boolean).join(' · '))}</p>
    <p style="margin:0 0 16px"><a href="${link}" style="display:inline-block;background:#E8003D;color:#fff;font-weight:bold;text-decoration:none;padding:12px 20px;border-radius:12px">Open my ${n === 1 ? 'ticket' : 'tickets'}</a></p>
    ${ticketsHtml}
    ${o.totalPence > 0 ? `<p style="margin:16px 0 12px;color:#475569;font-size:13px">${esc(paidSummary(o))}</p>` : ''}
    <p style="margin:16px 0 12px;color:#475569">Show the QR code at the door, on your phone or printed. Each code works once.</p>
    <p style="margin:0 0 12px;color:#475569">Can’t go any more? Just reply to this email and we’ll let the organiser know, so someone else can have your place.</p>
    <p style="margin:0;color:#94A3B8;font-size:12px">${o.totalPence > 0 ? `Sold by ${esc(o.organiserName ?? 'the organiser')} through TheShowFinder` : 'Free tickets through TheShowFinder'} · <a href="${SITE}/events/${o.event.slug}">Event details</a></p>
  </div>`
  const { error } = await resend.emails.send({ from: FROM_EMAIL, to: o.buyer_email, subject, text, html })
  if (error) console.error('[tickets] email failed', error)
}

/** The organiser's listing behind a door link, only with its private manage token. */
export async function loadDoorAccess(db: Db, submissionId: string, token: string): Promise<{ eventId: string; title: string; startDate: string; slug: string } | null> {
  if (!/^[0-9a-f-]{36}$/i.test(submissionId) || !/^[0-9a-f]{32}$/i.test(token)) return null
  const { data } = await loose(db).from('event_submissions').select('event_id, events(title, start_date, slug)').eq('id', submissionId).eq('manage_token', token).maybeSingle()
  if (!data?.event_id || !data.events) return null
  return { eventId: data.event_id, title: data.events.title, startDate: data.events.start_date, slug: data.events.slug }
}

export type CheckInResult =
  | { result: 'ok'; name: string; ticket: string }
  | { result: 'already'; name: string; ticket: string; at: string }
  | { result: 'cancelled'; name: string }
  | { result: 'not_found' }

/** Scan at the door: marks the ticket used exactly once (the update only succeeds if it wasn't already). */
export async function checkIn(db: Db, eventId: string, code: string): Promise<CheckInResult> {
  const sel = 'code, checked_in_at, ticket_types(name), ticket_orders(buyer_name, status)'
  const { data: found } = await loose(db).from('tickets').select(sel).eq('event_id', eventId).eq('code', code).maybeSingle()
  if (!found) return { result: 'not_found' }
  const name = found.ticket_orders?.buyer_name ?? ''
  const ticket = found.ticket_types?.name ?? 'Ticket'
  if (found.ticket_orders?.status !== 'confirmed') return { result: 'cancelled', name }
  const { data: updated } = await loose(db).from('tickets').update({ checked_in_at: new Date().toISOString() })
    .eq('event_id', eventId).eq('code', code).is('checked_in_at', null).select('code').maybeSingle()
  if (updated) return { result: 'ok', name, ticket }
  const { data: again } = await loose(db).from('tickets').select('checked_in_at').eq('event_id', eventId).eq('code', code).maybeSingle()
  return { result: 'already', name, ticket, at: again?.checked_in_at ?? found.checked_in_at ?? '' }
}

/** Door counts: tickets issued and people in. */
export async function doorCounts(db: Db, eventId: string): Promise<{ issued: number; in: number }> {
  const [{ count: issued }, { count: inside }] = await Promise.all([
    loose(db).from('tickets').select('id, ticket_orders!inner(status)', { count: 'exact', head: true }).eq('event_id', eventId).eq('ticket_orders.status', 'confirmed'),
    loose(db).from('tickets').select('id', { count: 'exact', head: true }).eq('event_id', eventId).not('checked_in_at', 'is', null),
  ])
  return { issued: issued ?? 0, in: inside ?? 0 }
}
