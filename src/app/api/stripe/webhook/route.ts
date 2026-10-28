import { createHmac, timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function validSignature(payload: string, signature: string, secret: string) {
  const parts = Object.fromEntries(signature.split(',').map(item => {
    const [key, value] = item.split('=')
    return [key, value]
  }))
  const timestamp = Number(parts.t)
  const signatures = signature.split(',').filter(item => item.startsWith('v1=')).map(item => item.slice(3))
  if (!Number.isFinite(timestamp) || Math.abs(Date.now() / 1000 - timestamp) > 300 || signatures.length === 0) return false
  const expected = createHmac('sha256', secret).update(`${timestamp}.${payload}`).digest('hex')
  return signatures.some(value => {
    try { return timingSafeEqual(Buffer.from(expected), Buffer.from(value)) } catch { return false }
  })
}

export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET
  const signature = request.headers.get('stripe-signature')
  if (!secret || !signature) return NextResponse.json({ error: 'Webhook is not configured.' }, { status: 400 })
  const payload = await request.text()
  if (!validSignature(payload, signature, secret)) return NextResponse.json({ error: 'Invalid webhook signature.' }, { status: 400 })

  const event = JSON.parse(payload) as { type: string; data?: { object?: Record<string, unknown> } }
  const object = event.data?.object ?? {}
  const metadata = (object.metadata ?? {}) as Record<string, string>
  const applicationId = metadata.application_id || (typeof object.client_reference_id === 'string' ? object.client_reference_id : '')
  if (!applicationId) return NextResponse.json({ received: true })

  const db = createAdminClient()
  if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
    await db.from('advertiser_applications').update({
      payment_status: 'paid',
      stripe_customer_id: typeof object.customer === 'string' ? object.customer : null,
      stripe_subscription_id: typeof object.subscription === 'string' ? object.subscription : null,
      updated_at: new Date().toISOString(),
    }).eq('id', applicationId)
  } else if (event.type === 'invoice.payment_failed') {
    await db.from('advertiser_applications').update({ payment_status: 'pending', updated_at: new Date().toISOString() }).eq('id', applicationId)
  } else if (event.type === 'customer.subscription.deleted') {
    await db.from('advertiser_applications').update({ payment_status: 'pending', updated_at: new Date().toISOString() }).eq('id', applicationId)
  }
  return NextResponse.json({ received: true })
}
