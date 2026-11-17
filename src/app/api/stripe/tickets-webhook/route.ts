import { createHmac, timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { confirmFromSession, refreshStripeAccount } from '@/lib/ticketPayments'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Loose = any // eslint-disable-line @typescript-eslint/no-explicit-any

function validSignature(payload: string, signature: string, secret: string) {
  const parts = Object.fromEntries(signature.split(',').map(item => item.split('=') as [string, string]))
  const timestamp = Number(parts.t)
  const signatures = signature.split(',').filter(item => item.startsWith('v1=')).map(item => item.slice(3))
  if (!Number.isFinite(timestamp) || Math.abs(Date.now() / 1000 - timestamp) > 300 || signatures.length === 0) return false
  const expected = createHmac('sha256', secret).update(`${timestamp}.${payload}`).digest('hex')
  return signatures.some(v => { try { return timingSafeEqual(Buffer.from(expected), Buffer.from(v)) } catch { return false } })
}

// Stripe Connect events from organisers' accounts (Stripe: Developers > Webhooks, "Events on connected accounts"):
// a ticket payment completed or timed out, an organiser's account became able to take payments, a refund.
export async function POST(request: Request) {
  const secret = process.env.STRIPE_TICKETS_WEBHOOK_SECRET
  const signature = request.headers.get('stripe-signature')
  if (!secret || !signature) return NextResponse.json({ error: 'Webhook is not configured.' }, { status: 400 })
  const payload = await request.text()
  if (!validSignature(payload, signature, secret)) return NextResponse.json({ error: 'Invalid webhook signature.' }, { status: 400 })
  const event = JSON.parse(payload) as { type: string; account?: string; data?: { object?: Loose } }
  const obj = event.data?.object ?? {}
  const db = createAdminClient() as Loose
  try {
    if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
      if (obj.metadata?.kind === 'ticket_order') await confirmFromSession(db, obj)
    } else if (event.type === 'checkout.session.expired') {
      const orderId = obj.metadata?.order_id
      if (orderId) await db.rpc('release_ticket_order', { p_order: orderId })
    } else if (event.type === 'account.updated' && obj.id) {
      await refreshStripeAccount(db, obj.id, obj)
    } else if (event.type === 'charge.refunded' && obj.payment_intent && obj.refunded) {
      // Refunded in full from the Stripe dashboard: the tickets stop working.
      const { data: o } = await db.from('ticket_orders').select('id').eq('stripe_payment_intent', obj.payment_intent).eq('status', 'confirmed').maybeSingle()
      if (o) await db.rpc('void_ticket_order', { p_order: o.id, p_status: 'refunded' })
    }
  } catch (err) {
    console.error('[tickets-webhook] failed', event.type, err)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })   // Stripe retries
  }
  return NextResponse.json({ received: true })
}
