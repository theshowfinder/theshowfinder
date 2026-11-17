export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { requireAdmin } from '@/lib/admin-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { gbpFromPence, formatTicketCode } from '@/lib/tickets'
import { ticketsTestMode } from '@/lib/ticketPayments'
import { refundOrderAction, refundEventAction } from './actions'

// Tickets sold (or given away) through TheShowFinder: per event, what has sold, our fees, and refunds.
type Loose = any // eslint-disable-line @typescript-eslint/no-explicit-any
const when = (iso: string) => new Date(iso).toLocaleString('en-GB', { timeZone: 'Europe/London', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

export default async function TicketSalesPage({ searchParams }: { searchParams: Promise<{ event?: string; msg?: string }> }) {
  await requireAdmin()
  const sp = await searchParams
  const db = createAdminClient() as Loose
  const { data: types } = await db.from('ticket_types').select('event_id, name, price_pence, capacity, sold, active, events(title, slug, start_date, status, organisers(name))').limit(1000)
  const { data: orders } = await db.from('ticket_orders').select('event_id, status, quantity, ticket_price_pence, fee_pence, total_pence, paid_out_at').in('status', ['confirmed', 'refunded']).limit(20000)
  const byEvent = new Map<string, { tickets: number; takings: number; fees: number; refunded: number; paidOut: number }>()
  for (const o of (orders ?? []) as Loose[]) {
    const g = byEvent.get(o.event_id) ?? { tickets: 0, takings: 0, fees: 0, refunded: 0, paidOut: 0 }
    if (o.status === 'confirmed') { g.tickets += o.quantity; g.takings += o.ticket_price_pence * o.quantity; g.fees += o.fee_pence; if (o.paid_out_at) g.paidOut += o.ticket_price_pence * o.quantity }
    else g.refunded += o.quantity
    byEvent.set(o.event_id, g)
  }
  const rows = ((types ?? []) as Loose[]).filter(t => t.events).sort((a, b) => a.events.start_date.localeCompare(b.events.start_date))
  const totalFees = [...byEvent.values()].reduce((n, g) => n + g.fees, 0)
  const selected = rows.find(r => r.event_id === sp.event)
  const { data: eventOrders } = selected
    ? await db.from('ticket_orders').select('id, buyer_name, buyer_email, quantity, status, total_pence, created_at, tickets(code, checked_in_at)').eq('event_id', selected.event_id).in('status', ['confirmed', 'refunded', 'cancelled']).order('created_at', { ascending: false }).limit(500)
    : { data: [] }
  const card = 'bg-white border border-slate-200 rounded-2xl p-4'
  return (
    <div className="min-h-screen bg-slate-50">
      <main className="max-w-5xl mx-auto px-4 py-6 space-y-5">
        <div>
          <h1 className="text-2xl font-black text-slate-900">Ticket sales</h1>
          <p className="text-sm text-slate-600">Tickets sold through TheShowFinder. Our booking fees so far: <strong>{gbpFromPence(totalFees)}</strong> (incl. VAT).{ticketsTestMode() ? ' Payments are in Stripe TEST mode: no real money.' : ''}</p>
        </div>
        {sp.msg && <p className="rounded-xl bg-slate-900 text-white px-4 py-2 text-sm">{sp.msg}</p>}
        <div className="space-y-2">
          {rows.length === 0 && <p className="text-sm text-slate-500">No events with tickets yet.</p>}
          {rows.map(r => {
            const g = byEvent.get(r.event_id)
            return (
              <Link key={r.event_id + r.name} href={`/admin/ticket-sales?event=${r.event_id}`} className={`${card} block hover:border-slate-400`}>
                <div className="flex flex-wrap justify-between gap-2">
                  <div>
                    <p className="font-extrabold text-slate-900">{r.events.title}</p>
                    <p className="text-xs text-slate-500">{when(r.events.start_date)} · {r.events.organisers?.name ?? 'Organiser'} · {r.name} {r.price_pence ? gbpFromPence(r.price_pence) : 'free'}{r.active ? '' : ' · not on sale yet (payouts not set up)'}{r.events.status === 'cancelled' ? ' · CANCELLED' : ''}</p>
                  </div>
                  <div className="text-right text-sm">
                    <p className="font-bold">{r.sold} / {r.capacity} sold</p>
                    {g && r.price_pence > 0 && <p className="text-xs text-slate-500">Takings {gbpFromPence(g.takings)} · our fees {gbpFromPence(g.fees)}{g.paidOut ? ` · paid out ${gbpFromPence(g.paidOut)}` : ''}{g.refunded ? ` · ${g.refunded} refunded` : ''}</p>}
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
        {selected && (
          <section className={`${card} space-y-3`}>
            <h2 className="font-extrabold text-slate-900">{selected.events.title}: orders</h2>
            {((eventOrders ?? []) as Loose[]).map(o => (
              <div key={o.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2 text-sm">
                <div>
                  <p className="font-semibold">{o.buyer_name} · {o.buyer_email}</p>
                  <p className="text-xs text-slate-500">{o.quantity} ticket{o.quantity === 1 ? '' : 's'} · {o.total_pence ? gbpFromPence(o.total_pence) : 'free'} · {when(o.created_at)} · {o.status}{(o.tickets ?? []).some((t: Loose) => t.checked_in_at) ? ' · checked in' : ''} · {(o.tickets ?? []).map((t: Loose) => formatTicketCode(t.code)).join(', ')}</p>
                </div>
                {o.status === 'confirmed' && (
                  <form action={refundOrderAction} className="flex gap-2">
                    <input type="hidden" name="id" value={o.id} /><input type="hidden" name="event" value={selected.event_id} />
                    <input name="reason" placeholder="Reason (emailed)" className="border border-slate-200 rounded-lg px-2 py-1 text-xs" />
                    <button className="rounded-lg border border-red-300 text-red-700 px-3 py-1 text-xs font-bold">{o.total_pence ? 'Refund' : 'Cancel'}</button>
                  </form>
                )}
              </div>
            ))}
            <form action={refundEventAction} className="border-t border-slate-200 pt-3 flex flex-wrap items-center gap-2">
              <input type="hidden" name="event" value={selected.event_id} />
              <span className="text-sm font-semibold text-red-700">Event cancelled? Refund everyone in full:</span>
              <input name="confirm" placeholder="Type REFUND" className="border border-slate-200 rounded-lg px-2 py-1 text-sm" />
              <button className="rounded-lg bg-red-700 text-white px-3 py-1.5 text-sm font-bold">Refund all and cancel event</button>
            </form>
          </section>
        )}
      </main>
    </div>
  )
}
