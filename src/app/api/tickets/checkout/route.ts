import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { validateClaim, claimErrorMessage } from '@/lib/tickets'
import { createTicketCheckout, ticketsStripeReady } from '@/lib/ticketPayments'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

type Loose = any // eslint-disable-line @typescript-eslint/no-explicit-any

// Paid tickets: hold them (reserve_paid_tickets, 35 minutes) and open Stripe's payment page on the organiser's account.
export async function POST(request: Request) {
  const db = createAdminClient() as Loose
  let held: { order_id: string; access_token: string } | null = null
  try {
    if (!ticketsStripeReady()) return NextResponse.json({ error: 'Ticket sales aren’t open yet.' }, { status: 503 })
    const body = await request.json().catch(() => ({})) as Record<string, unknown>
    if (typeof body.website === 'string' && body.website) return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 400 })
    const checked = validateClaim({ ticketTypeId: String(body.ticketTypeId ?? ''), name: String(body.name ?? ''), email: String(body.email ?? ''), quantity: String(body.quantity ?? '') })
    if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 400 })
    const c = checked.value
    const { data, error } = await db.rpc('reserve_paid_tickets', { p_type: c.ticketTypeId, p_name: c.name, p_email: c.email, p_qty: c.quantity })
    if (error) return NextResponse.json({ error: claimErrorMessage(error.message) }, { status: 409 })
    const row = (Array.isArray(data) ? data[0] : data) as { order_id: string; access_token: string; unit_price: number; unit_fee: number; stripe_account: string } | undefined
    if (!row) throw new Error('no order returned')
    held = row
    const { data: tt } = await db.from('ticket_types').select('name, events(title, slug)').eq('id', c.ticketTypeId).maybeSingle()
    const session = await createTicketCheckout({
      orderId: row.order_id, token: row.access_token, account: row.stripe_account, eventTitle: tt?.events?.title ?? 'Event', eventSlug: tt?.events?.slug ?? '',
      ticketName: tt?.name ?? 'Ticket', quantity: c.quantity, unitPrice: row.unit_price, unitFee: row.unit_fee, email: c.email,
    })
    await db.from('ticket_orders').update({ stripe_session_id: session.id }).eq('id', row.order_id)
    return NextResponse.json({ ok: true, url: session.url })
  } catch (err) {
    console.error('[tickets/checkout] failed', err)
    if (held) await db.rpc('release_ticket_order', { p_order: held.order_id }).then(() => null, () => null)
    return NextResponse.json({ error: 'The payment page could not be opened. Please try again.' }, { status: 500 })
  }
}
