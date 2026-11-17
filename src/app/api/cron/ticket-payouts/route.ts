import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { withJobRun } from '@/lib/jobRuns'
import { stripeTickets, ticketsStripeReady } from '@/lib/ticketPayments'
import { emailOrganiser } from '@/lib/organiserPublish'
import { gbpFromPence } from '@/lib/tickets'

export const maxDuration = 120
export const dynamic = 'force-dynamic'

type Loose = any // eslint-disable-line @typescript-eslint/no-explicit-any

// Daily: pay organisers their ticket takings once the event has happened (held until the day after, so a cancelled
// event can still be refunded from the money). Organisers' Stripe payouts are manual; this sends each organiser's
// due amount (their ticket price × tickets sold; our fee was already taken) when it is available in their balance.
async function handleGet(request: Request) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || request.headers.get('authorization') !== `Bearer ${cronSecret}`) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!ticketsStripeReady()) return NextResponse.json({ success: true, note: 'ticket payments not set up' })
  const db = createAdminClient() as Loose
  const cutoff = new Date(Date.now() - 24 * 3600_000).toISOString()
  const { data: rows } = await db.from('ticket_orders')
    .select('id, stripe_account_id, ticket_price_pence, quantity, events!inner(title, start_date, organiser_id)')
    .eq('status', 'confirmed').is('paid_out_at', null).gt('ticket_price_pence', 0).lt('events.start_date', cutoff).limit(5000)
  const byAccount = new Map<string, { due: number; ids: string[]; titles: Set<string>; organiserId: string }>()
  for (const r of ((rows ?? []) as Loose[])) {
    if (!r.stripe_account_id) continue
    const g = byAccount.get(r.stripe_account_id) ?? { due: 0, ids: [] as string[], titles: new Set<string>(), organiserId: r.events.organiser_id }
    g.due += r.ticket_price_pence * r.quantity
    g.ids.push(r.id)
    g.titles.add(r.events.title)
    byAccount.set(r.stripe_account_id, g)
  }
  const results: Array<{ account: string; due: number; result: string }> = []
  for (const [account, g] of byAccount) {
    try {
      const bal = await stripeTickets(`/balance`, { account })
      const available = ((bal?.available ?? []) as Array<{ currency: string; amount: number }>).find(b => b.currency === 'gbp')?.amount ?? 0
      if (available < g.due) { results.push({ account, due: g.due, result: `waiting (available ${available})` }); continue }
      await stripeTickets('/payouts', { account, idempotencyKey: `tsf-payout-${account}-${g.ids.sort()[0]}-${g.ids.length}`, params: { amount: g.due, currency: 'gbp', description: 'TheShowFinder ticket sales' } })
      await db.from('ticket_orders').update({ paid_out_at: new Date().toISOString() }).in('id', g.ids)
      const { data: org } = await db.from('organisers').select('email, name').eq('id', g.organiserId).maybeSingle()
      if (org?.email) await emailOrganiser(org.email, `Your ticket money is on its way: ${gbpFromPence(g.due)}`, [
        `Hi ${org.name},`,
        `We've sent ${gbpFromPence(g.due)} to your bank account for ${[...g.titles].join(', ')}. It usually arrives in 1 to 3 working days.`,
        'Thanks for selling your tickets with TheShowFinder. Got another event coming up? List it at https://www.theshowfinder.com/list-your-event',
        'Chris, TheShowFinder',
      ])
      results.push({ account, due: g.due, result: 'paid out' })
    } catch (err) {
      results.push({ account, due: g.due, result: `error: ${err instanceof Error ? err.message : String(err)}` })
    }
  }
  const failed = results.filter(r => r.result.startsWith('error'))
  return NextResponse.json({ success: failed.length === 0, accounts: results.length, results }, { status: failed.length ? 500 : 200 })
}

export const GET = withJobRun('ticket-payouts', handleGet)
