// Paid tickets through Stripe Connect. Each organiser has their own Stripe account (Stripe checks their identity and
// holds their bank details); every sale is a payment on that account ("direct charge"), so the organiser is the
// seller and TheShowFinder acts as their agent. Our booking fee comes to us as the application fee. Payouts to the
// organiser are manual: cron ticket-payouts pays out each event's takings the day after it has happened.
// Uses STRIPE_TICKETS_SECRET_KEY (the sandbox key until we go live), separate from the Boost / Promoter key.
import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { SITE, loadOrder, emailTickets, orderLink } from '@/lib/ticketOrders'
import { resend, FROM_EMAIL } from '@/lib/resend'
import { gbpFromPence } from '@/lib/tickets'

type Db = ReturnType<typeof createAdminClient>
type Loose = any // eslint-disable-line @typescript-eslint/no-explicit-any
const loose = (db: Db) => db as Loose

export const ticketsStripeReady = () => Boolean(process.env.STRIPE_TICKETS_SECRET_KEY)
export const ticketsTestMode = () => (process.env.STRIPE_TICKETS_SECRET_KEY ?? '').startsWith('sk_test_')

/** One call to the Stripe API with the ticketing key, optionally on an organiser's own account. */
export async function stripeTickets<T = Loose>(path: string, opts: { method?: 'GET' | 'POST'; params?: Record<string, string | number | boolean | undefined>; account?: string | null; idempotencyKey?: string } = {}): Promise<T> {
  const key = process.env.STRIPE_TICKETS_SECRET_KEY
  if (!key) throw new Error('Ticket payments are not set up yet.')
  const method = opts.method ?? (opts.params ? 'POST' : 'GET')
  const body = new URLSearchParams()
  for (const [k, v] of Object.entries(opts.params ?? {})) if (v !== undefined) body.set(k, String(v))
  const headers: Record<string, string> = { Authorization: `Bearer ${key}` }
  if (method === 'POST') headers['Content-Type'] = 'application/x-www-form-urlencoded'
  if (opts.account) headers['Stripe-Account'] = opts.account
  if (opts.idempotencyKey) headers['Idempotency-Key'] = opts.idempotencyKey
  const url = `https://api.stripe.com/v1${path}${method === 'GET' && opts.params ? `?${body.toString()}` : ''}`
  const res = await fetch(url, { method, headers, body: method === 'POST' ? body.toString() : undefined, signal: AbortSignal.timeout(20_000) })
  const json = await res.json() as Loose
  if (!res.ok) throw new Error(json?.error?.message ?? `Stripe ${res.status}`)
  return json as T
}

type OrganiserForStripe = { id: string; email: string; name: string; website: string | null; stripe_account_id: string | null }

/** The organiser's Stripe account, created the first time they set up payouts. */
export async function ensureStripeAccount(db: Db, org: OrganiserForStripe): Promise<string> {
  if (org.stripe_account_id) return org.stripe_account_id
  const acct = await stripeTickets<{ id: string }>('/accounts', {
    idempotencyKey: `tsf-organiser-${org.id}`,
    params: {
      country: 'GB',
      email: org.email,
      'business_profile[name]': org.name,
      'business_profile[url]': org.website ?? undefined,
      'business_profile[mcc]': '7922',   // theatrical producers and ticket agencies
      'business_profile[product_description]': 'Tickets for live events, sold through TheShowFinder',
      'controller[fees][payer]': 'application',
      'controller[losses][payments]': 'application',
      'controller[requirement_collection]': 'stripe',
      'controller[stripe_dashboard][type]': 'express',
      'capabilities[card_payments][requested]': true,
      'capabilities[transfers][requested]': true,
      'settings[payouts][schedule][interval]': 'manual',
      'metadata[organiser_id]': org.id,
    },
  })
  await loose(db).from('organisers').update({ stripe_account_id: acct.id }).eq('id', org.id)
  return acct.id
}

/** Stripe's own sign-up pages for the organiser (identity, bank details); they come back to returnUrl. */
export async function onboardingLink(accountId: string, returnUrl: string, refreshUrl: string): Promise<string> {
  const link = await stripeTickets<{ url: string }>('/account_links', { params: { account: accountId, type: 'account_onboarding', return_url: returnUrl, refresh_url: refreshUrl } })
  return link.url
}

/** Reads the account from Stripe and puts the organiser's paid tickets on sale once it can take payments. */
export async function refreshStripeAccount(db: Db, accountId: string, known?: Loose): Promise<{ chargesEnabled: boolean; payoutsEnabled: boolean }> {
  const a = known ?? await stripeTickets(`/accounts/${encodeURIComponent(accountId)}`)
  const chargesEnabled = Boolean(a?.charges_enabled), payoutsEnabled = Boolean(a?.payouts_enabled)
  const { data: org } = await loose(db).from('organisers').update({ stripe_charges_enabled: chargesEnabled, stripe_payouts_enabled: payoutsEnabled, stripe_details_submitted: Boolean(a?.details_submitted) })
    .eq('stripe_account_id', accountId).select('id').maybeSingle()
  if (org?.id) {
    const { data: evs } = await loose(db).from('events').select('id, slug').eq('organiser_id', org.id).gte('start_date', new Date(Date.now() - 2 * 3600_000).toISOString())
    const ids = ((evs ?? []) as Array<{ id: string }>).map(e => e.id)
    if (ids.length) {
      await loose(db).from('ticket_types').update({ active: chargesEnabled }).in('event_id', ids).gt('price_pence', 0)
      for (const e of (evs ?? []) as Array<{ slug: string }>) revalidatePath(`/events/${e.slug}`)
    }
  }
  return { chargesEnabled, payoutsEnabled }
}

/** The payment page for a held order, on the organiser's account, with our booking fee as the application fee. */
export async function createTicketCheckout(o: { orderId: string; token: string; account: string; eventTitle: string; eventSlug: string; ticketName: string; quantity: number; unitPrice: number; unitFee: number; email: string }): Promise<{ id: string; url: string }> {
  const session = await stripeTickets<{ id: string; url: string }>('/checkout/sessions', {
    account: o.account,
    idempotencyKey: `tsf-order-${o.orderId}`,
    params: {
      mode: 'payment',
      'line_items[0][quantity]': o.quantity,
      'line_items[0][price_data][currency]': 'gbp',
      'line_items[0][price_data][unit_amount]': o.unitPrice,
      'line_items[0][price_data][product_data][name]': `${o.ticketName}: ${o.eventTitle}`.slice(0, 250),
      'line_items[1][quantity]': o.quantity,
      'line_items[1][price_data][currency]': 'gbp',
      'line_items[1][price_data][unit_amount]': o.unitFee,
      'line_items[1][price_data][product_data][name]': 'Booking fee (TheShowFinder, incl. VAT)',
      'payment_intent_data[application_fee_amount]': o.unitFee * o.quantity,
      'payment_intent_data[description]': `${o.quantity} × ${o.ticketName}: ${o.eventTitle}`.slice(0, 250),
      'payment_intent_data[metadata][order_id]': o.orderId,
      'metadata[order_id]': o.orderId,
      'metadata[kind]': 'ticket_order',
      client_reference_id: o.orderId,
      customer_email: o.email,
      expires_at: Math.floor(Date.now() / 1000) + 31 * 60,
      success_url: `${orderLink(o.orderId, o.token)}&paid=1`,
      cancel_url: `${SITE}/api/tickets/release?o=${o.orderId}&t=${o.token}&e=${encodeURIComponent(o.eventSlug)}`,
      'custom_text[submit][message]': 'Tickets are sold by the event organiser. TheShowFinder sells them as the organiser’s agent. Terms: theshowfinder.com/terms#tickets',
    },
  })
  return session
}

/** Payment confirmed (webhook, or the buyer landing back on their tickets page): issue the tickets once and email them. */
export async function confirmFromSession(db: Db, session: Loose): Promise<boolean> {
  const orderId = String(session?.metadata?.order_id ?? session?.client_reference_id ?? '')
  if (!/^[0-9a-f-]{36}$/i.test(orderId) || session?.payment_status !== 'paid') return false
  const intent = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id ?? null
  const { data: fresh, error } = await loose(db).rpc('confirm_paid_order', { p_order: orderId, p_session: session.id, p_intent: intent })
  if (error) throw new Error(error.message)
  if (fresh) {
    const { data: o } = await loose(db).from('ticket_orders').select('id, access_token').eq('id', orderId).maybeSingle()
    const order = o ? await loadOrder(db, o.id, o.access_token) : null
    if (order) await emailTickets(order)
  }
  return Boolean(fresh)
}

/** For the tickets page: a pending order whose payment has gone through (if the webhook hasn't arrived yet). */
export async function syncPendingOrder(db: Db, orderId: string): Promise<void> {
  const { data: o } = await loose(db).from('ticket_orders').select('status, stripe_session_id, stripe_account_id').eq('id', orderId).maybeSingle()
  if (!o || !['pending', 'expired'].includes(o.status) || !o.stripe_session_id || !o.stripe_account_id) return
  try {
    const session = await stripeTickets(`/checkout/sessions/${encodeURIComponent(o.stripe_session_id)}`, { account: o.stripe_account_id })
    await confirmFromSession(db, session)
  } catch (err) { console.error('[tickets] sync failed', err) }
}

/** Full refund (ticket price and our fee) on the organiser's account; the tickets stop working and go back on sale. */
export async function refundOrder(db: Db, orderId: string, reason: string): Promise<void> {
  const { data: o } = await loose(db).from('ticket_orders').select('id, status, stripe_payment_intent, stripe_account_id, total_pence, buyer_email, buyer_name, events(title)').eq('id', orderId).maybeSingle()
  if (!o || o.status !== 'confirmed') throw new Error('Only confirmed orders can be refunded.')
  if (o.stripe_payment_intent && o.total_pence > 0) {
    await stripeTickets('/refunds', { account: o.stripe_account_id, idempotencyKey: `tsf-refund-${o.id}`, params: { payment_intent: o.stripe_payment_intent, refund_application_fee: true, 'metadata[order_id]': o.id } })
  }
  const { error } = await loose(db).rpc('void_ticket_order', { p_order: o.id, p_status: o.total_pence > 0 ? 'refunded' : 'cancelled' })
  if (error) throw new Error(error.message)
  const title = o.events?.title ?? 'your event'
  const lines = [
    `Hi ${o.buyer_name},`,
    o.total_pence > 0 ? `We've refunded your order for ${title}: ${gbpFromPence(o.total_pence)}, including the booking fee. It usually reaches your card in 5 to 10 working days.` : `Your free tickets for ${title} have been cancelled.`,
    reason ? `Reason: ${reason}` : '',
    'Your tickets no longer work. Any questions, just reply to this email.',
    'TheShowFinder',
  ].filter(Boolean)
  await resend.emails.send({ from: FROM_EMAIL, to: o.buyer_email, subject: `${o.total_pence > 0 ? 'Refund' : 'Cancelled'}: ${title}`, text: lines.join('\n') }).catch(err => console.error('[tickets] refund email failed', err))
}
