// Paid tickets through Stripe Connect. Each organiser has their own Stripe account (Stripe checks their identity and
// holds their bank details); every sale is a payment on that account ("direct charge"), so the organiser is the
// seller and TheShowFinder acts as their agent. Our booking fee comes to us as the application fee. Stripe carries the
// risk (Managed Risk: Stripe is the losses collector, Chris 17 Nov 2026), and pays organisers on its normal schedule;
// TheShowFinder never holds organisers' money or carries their losses.
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

export const STRIPE_V2_VERSION = '2026-10-28.endive'

/** Accounts v2 call (JSON body, versioned). */
async function stripeV2<T = Loose>(path: string, body: unknown, idempotencyKey?: string): Promise<T> {
  const key = process.env.STRIPE_TICKETS_SECRET_KEY
  if (!key) throw new Error('Ticket payments are not set up yet.')
  const headers: Record<string, string> = { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'Stripe-Version': STRIPE_V2_VERSION }
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey
  const res = await fetch(`https://api.stripe.com${path}`, { method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(20_000) })
  const json = await res.json() as Loose
  if (!res.ok) throw Object.assign(new Error(json?.error?.message ?? `Stripe ${res.status}`), { code: json?.error?.code })
  return json as T
}

/**
 * The organiser's own Stripe account (their own Stripe dashboard), created the first time they set up payouts.
 * Stripe carries the losses. We ask for TheShowFinder to pay the card fees (so the organiser keeps their full ticket
 * price and our booking fee covers the card fee); if Stripe won't allow that combination, Stripe takes its card fee
 * from the sale and our application fee is reduced by the same amount instead (see createTicketCheckout).
 */
export async function ensureStripeAccount(db: Db, org: OrganiserForStripe): Promise<string> {
  if (org.stripe_account_id) return org.stripe_account_id
  const body = (feesCollector: 'application' | 'stripe') => ({
    contact_email: org.email,
    display_name: org.name,
    dashboard: 'full',
    identity: { country: 'gb' },
    configuration: { merchant: { mcc: '7922', capabilities: { card_payments: { requested: true } } } },
    defaults: { currency: 'gbp', responsibilities: { fees_collector: feesCollector, losses_collector: 'stripe' } },
    metadata: { organiser_id: org.id },
    include: ['defaults'],
  })
  let feesCollector: 'application' | 'stripe' = 'application'
  let acct: { id: string }
  try {
    acct = await stripeV2<{ id: string }>('/v2/core/accounts', body('application'), `tsf-organiser-v2-${org.id}`)
  } catch (err) {
    console.error('[stripe] account with platform-paid fees refused, using Stripe-paid fees', err)
    feesCollector = 'stripe'
    acct = await stripeV2<{ id: string }>('/v2/core/accounts', body('stripe'), `tsf-organiser-v2s-${org.id}`)
  }
  await loose(db).from('organisers').update({ stripe_account_id: acct.id, stripe_fees_collector: feesCollector }).eq('id', org.id)
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
export async function createTicketCheckout(o: { orderId: string; token: string; account: string; eventTitle: string; eventSlug: string; ticketName: string; quantity: number; unitPrice: number; unitFee: number; email: string; stripeCollectsFees?: boolean }): Promise<{ id: string; url: string }> {
  // When Stripe takes its card fee from the organiser's sale, our application fee is cut by the standard UK card fee
  // (1.5% + 20p of the total), so the organiser still ends up with their ticket price.
  const total = (o.unitPrice + o.unitFee) * o.quantity
  const applicationFee = o.stripeCollectsFees ? Math.max(0, o.unitFee * o.quantity - (Math.round(total * 0.015) + 20)) : o.unitFee * o.quantity
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
      'payment_intent_data[application_fee_amount]': applicationFee,
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
    await topUpOrganiser(db, orderId, intent).catch(err => console.error('[tickets] fee top-up failed', err))
    const { data: o } = await loose(db).from('ticket_orders').select('id, access_token').eq('id', orderId).maybeSingle()
    const order = o ? await loadOrder(db, o.id, o.access_token) : null
    if (order) await emailTickets(order)
  }
  return Boolean(fresh)
}

/**
 * Where Stripe takes its card fee from the organiser's sale, our application fee was cut by the standard UK card fee.
 * A foreign or premium card costs more, so once the payment is done we read Stripe's actual fee and give the
 * difference back from our fee: the organiser always ends up with exactly their ticket price.
 */
async function topUpOrganiser(db: Db, orderId: string, intentId: string | null): Promise<void> {
  if (!intentId) return
  const { data: o } = await loose(db).from('ticket_orders').select('stripe_account_id, ticket_price_pence, quantity, total_pence').eq('id', orderId).maybeSingle()
  if (!o?.stripe_account_id) return
  const { data: org } = await loose(db).from('organisers').select('stripe_fees_collector').eq('stripe_account_id', o.stripe_account_id).maybeSingle()
  if (org?.stripe_fees_collector !== 'stripe') return
  const pi = await stripeTickets(`/payment_intents/${encodeURIComponent(intentId)}`, { account: o.stripe_account_id, params: { 'expand[]': 'latest_charge.balance_transaction' }, method: 'GET' })
  const charge = pi?.latest_charge
  const bt = charge?.balance_transaction
  const feeId = typeof charge?.application_fee === 'string' ? charge.application_fee : charge?.application_fee?.id
  if (!bt || !feeId) return
  // What the organiser actually keeps = total - Stripe's fee - our fee; make it up to their ticket price.
  const shortfall = o.ticket_price_pence * o.quantity - Number(bt.net)
  const ourFee = Number(charge.application_fee_amount ?? 0)
  const refund = Math.min(Math.max(shortfall, 0), ourFee)
  if (refund > 0) await stripeTickets(`/application_fees/${encodeURIComponent(feeId)}/refunds`, { idempotencyKey: `tsf-topup-${orderId}`, params: { amount: refund, 'metadata[order_id]': orderId } })
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
