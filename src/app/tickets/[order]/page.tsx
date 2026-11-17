import type { Metadata } from 'next'
import Link from 'next/link'
import QRCode from 'qrcode'
import { createAdminClient } from '@/lib/supabase/admin'
import { loadOrder, paidSummary } from '@/lib/ticketOrders'
import { syncPendingOrder } from '@/lib/ticketPayments'
import { formatShareWhen } from '@/lib/shareText'
import { formatTicketCode, ticketQrPayload } from '@/lib/tickets'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Your tickets', robots: { index: false, follow: false } }

// The buyer's tickets, opened from the email link (private token). One QR code per ticket, big enough to scan.
export default async function TicketsPage({ params, searchParams }: { params: Promise<{ order: string }>; searchParams: Promise<{ t?: string; new?: string; paid?: string }> }) {
  const { order: orderId } = await params
  const { t, new: isNew, paid } = await searchParams
  const db = createAdminClient()
  let order = t ? await loadOrder(db, orderId, t) : null
  // Back from Stripe before its confirmation arrived: ask Stripe directly.
  if (order && order.status !== 'confirmed' && paid) { await syncPendingOrder(db, order.id); order = await loadOrder(db, orderId, t!) }
  if (!order) {
    return (
      <main className="min-h-screen bg-[#F5F5F0] px-4 py-16">
        <div className="mx-auto max-w-md rounded-3xl border border-slate-200 bg-white p-8 text-center">
          <h1 className="text-2xl font-black text-slate-950">Tickets not found</h1>
          <p className="mt-3 text-slate-600">Please use the link in your tickets email.</p>
        </div>
      </main>
    )
  }
  const qrs = await Promise.all(order.tickets.map(tk => QRCode.toString(ticketQrPayload(tk.code), { type: 'svg', margin: 1, width: 260, errorCorrectionLevel: 'M' })))
  const when = formatShareWhen(order.event.start_date)
  const v = order.event.venue
  const processing = order.status === 'pending'
  const cancelled = !processing && (order.status !== 'confirmed' || order.event.status === 'cancelled')
  return (
    <main className="min-h-screen bg-[#F5F5F0] px-4 py-10">
      <div className="mx-auto max-w-md">
        {processing && (
          <div className="mb-4 rounded-2xl bg-amber-50 border border-amber-200 p-4 text-sm text-amber-900">
            <strong>Confirming your payment…</strong> This usually takes a few seconds. <a href="" className="underline font-semibold">Refresh</a> this page, or check your email for your tickets.
          </div>
        )}
        {(isNew || (paid && order.status === 'confirmed')) && (
          <div className="mb-4 rounded-2xl bg-emerald-50 border border-emerald-200 p-4 text-sm text-emerald-900">
            <strong>You’re in!</strong> We’ve emailed your {order.tickets.length === 1 ? 'ticket' : 'tickets'} to {order.buyer_email}. They’re also here, so you can show this page at the door.
          </div>
        )}
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-extrabold uppercase tracking-widest text-slate-400">{order.ticketType.name} · {order.buyer_name}</p>
          <h1 className="mt-1 text-2xl font-black text-slate-950">{order.event.title}</h1>
          <p className="mt-1 text-slate-600">{when}</p>
          {v && <p className="text-slate-600">{v.name}, {v.city}{v.postcode ? ` ${v.postcode}` : ''}</p>}
          {v?.postcode && <a className="mt-1 inline-block text-sm font-semibold underline" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${v.name} ${v.postcode}`)}`} target="_blank" rel="noopener noreferrer">Directions</a>}
        </div>
        {cancelled ? (
          <div className="mt-4 rounded-3xl border border-red-200 bg-red-50 p-6 text-center font-bold text-red-800">These tickets are no longer valid.</div>
        ) : processing ? null : order.tickets.map((tk, i) => (
          <div key={tk.code} className="mt-4 rounded-3xl border-2 border-dashed border-slate-300 bg-white p-6 text-center">
            <p className="text-xs font-extrabold uppercase tracking-widest text-slate-400">Ticket {i + 1} of {order.tickets.length}</p>
            <div className="mx-auto mt-3 w-[260px] max-w-full [&_svg]:w-full [&_svg]:h-auto" dangerouslySetInnerHTML={{ __html: qrs[i] }} />
            <p className="mt-2 font-mono text-xl font-bold tracking-widest">{formatTicketCode(tk.code)}</p>
            {tk.checked_in_at && <p className="mt-1 text-sm font-semibold text-slate-500">Used at the door</p>}
          </div>
        ))}
        {order.totalPence > 0 && order.status === 'confirmed' && <p className="mt-4 text-center text-xs text-slate-500">{paidSummary(order)}</p>}
        <p className="mt-6 text-center text-sm text-slate-500">Show the QR code at the door. Each code works once.<br />Can’t go? Reply to your tickets email and we’ll pass your place on.</p>
        <p className="mt-4 text-center text-sm"><Link href={`/events/${order.event.slug}`} className="underline font-semibold">Event details</Link></p>
      </div>
    </main>
  )
}
