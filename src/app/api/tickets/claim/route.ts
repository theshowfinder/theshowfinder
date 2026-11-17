import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { validateClaim, claimErrorMessage } from '@/lib/tickets'
import { loadOrder, emailTickets, orderLink } from '@/lib/ticketOrders'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 20

// Free tickets: claim_free_tickets() checks what's left and the per-person limit in one locked step,
// then the QR tickets are emailed and the person goes straight to them.
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({})) as Record<string, unknown>
    if (typeof body.website === 'string' && body.website) return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 400 })
    const checked = validateClaim({ ticketTypeId: String(body.ticketTypeId ?? ''), name: String(body.name ?? ''), email: String(body.email ?? ''), quantity: String(body.quantity ?? '') })
    if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 400 })
    const c = checked.value
    const db = createAdminClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (db as any).rpc('claim_free_tickets', { p_type: c.ticketTypeId, p_name: c.name, p_email: c.email, p_qty: c.quantity })
    if (error) return NextResponse.json({ error: claimErrorMessage(error.message) }, { status: 409 })
    const row = (Array.isArray(data) ? data[0] : data) as { order_id: string; access_token: string } | undefined
    if (!row) throw new Error('no order returned')
    const order = await loadOrder(db, row.order_id, row.access_token)
    if (order) await emailTickets(order)
    return NextResponse.json({ ok: true, url: orderLink(row.order_id, row.access_token).replace('https://www.theshowfinder.com', '') + '&new=1' })
  } catch (err) {
    console.error('[tickets/claim] failed', err)
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}
