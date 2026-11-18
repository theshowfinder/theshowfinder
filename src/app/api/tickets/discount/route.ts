import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { bookingFeePence } from '@/lib/tickets'
import { discountedPence } from '@/lib/ticketPlan'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Loose = any // eslint-disable-line @typescript-eslint/no-explicit-any

// Checks a discount code for a ticket type and returns the new price, so the buyer sees it before paying.
// The real check happens again when the tickets are held (reserve_paid_tickets). Codes are never listed.
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as Record<string, unknown>
  const typeId = String(body.ticketTypeId ?? '')
  const code = String(body.code ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 20)
  if (!/^[0-9a-f-]{36}$/i.test(typeId) || code.length < 3) return NextResponse.json({ error: 'Please type the code.' }, { status: 400 })
  const db = createAdminClient() as Loose
  const { data: t } = await db.from('ticket_types').select('event_id, price_pence').eq('id', typeId).maybeSingle()
  if (!t || t.price_pence <= 0) return NextResponse.json({ error: 'That ticket isn’t available.' }, { status: 404 })
  const { data: d } = await db.from('discount_codes').select('id, percent_off, amount_off_pence, max_uses, expires_at, active').eq('event_id', t.event_id).eq('code', code).maybeSingle()
  if (!d || !d.active || (d.expires_at && Date.parse(d.expires_at) < Date.now())) {
    return NextResponse.json({ error: 'That discount code isn’t valid for this event, or it has ended.' }, { status: 404 })
  }
  if (d.max_uses) {
    const { data: rows } = await db.from('ticket_orders').select('quantity, status, expires_at').eq('discount_code_id', d.id).in('status', ['confirmed', 'pending'])
    const used = ((rows ?? []) as { quantity: number; status: string; expires_at: string | null }[])
      .filter(r => r.status === 'confirmed' || (r.expires_at && Date.parse(r.expires_at) > Date.now())).reduce((n, r) => n + r.quantity, 0)
    if (used >= d.max_uses) return NextResponse.json({ error: 'That discount code has been used up.' }, { status: 409 })
  }
  const price = discountedPence(t.price_pence, d)
  return NextResponse.json({ ok: true, code, pricePence: price, feePence: bookingFeePence(price) }, { headers: { 'Cache-Control': 'no-store' } })
}
