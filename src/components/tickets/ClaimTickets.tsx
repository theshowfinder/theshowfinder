'use client'

import { useEffect, useState, type FormEvent } from 'react'
import { bookingFeePence, gbpFromPence } from '@/lib/tickets'

type TicketType = { id: string; name: string; maxPerOrder: number; pricePence: number }
const input = 'w-full min-h-[48px] px-4 rounded-xl border border-slate-300 text-base bg-white'

// Free tickets through TheShowFinder: pick how many, name and email, and the QR tickets arrive by email
// (and open straight away on the next page). What's left is read live, the event page itself is cached.
export default function ClaimTickets({ eventTitle, types }: { eventTitle: string; types: TicketType[] }) {
  const [typeId, setTypeId] = useState(types[0]?.id ?? '')
  const [left, setLeft] = useState<Record<string, number> | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [qty, setQty] = useState(1)
  const type = types.find(t => t.id === typeId) ?? types[0]
  const paid = (type?.pricePence ?? 0) > 0
  const fee = paid ? bookingFeePence(type.pricePence) : 0

  useEffect(() => {
    let alive = true
    fetch(`/api/tickets/availability?types=${types.map(t => t.id).join(',')}`, { cache: 'no-store' })
      .then(r => r.json()).then((j: { left?: Record<string, number> }) => { if (alive && j.left) setLeft(j.left) })
      .catch(() => {})
    return () => { alive = false }
  }, [types])

  const remaining = left ? left[type?.id ?? ''] ?? 0 : null
  const soldOut = remaining === 0
  const maxQty = Math.max(1, Math.min(type?.maxPerOrder ?? 1, remaining ?? type?.maxPerOrder ?? 1))

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (busy) return
    setBusy(true); setError(null)
    const f = new FormData(e.currentTarget)
    const res = await fetch(paid ? '/api/tickets/checkout' : '/api/tickets/claim', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticketTypeId: type?.id, quantity: f.get('quantity'), name: f.get('name'), email: f.get('email'), website: f.get('website') }),
    })
    const json = await res.json().catch(() => ({})) as { url?: string; error?: string }
    if (json.url) { window.location.href = json.url; return }
    setBusy(false); setError(json.error ?? 'Something went wrong. Please try again.')
  }

  return (
    <div id="tickets" className="bg-white border-2 border-slate-900 rounded-2xl p-5 shadow-sm scroll-mt-24">
      <h3 className="text-xs font-extrabold uppercase tracking-widest text-slate-400 mb-1">{paid ? 'Tickets' : 'Free tickets'}</h3>
      {paid && <p className="text-2xl font-black text-slate-900">{gbpFromPence(type.pricePence)} <span className="text-sm font-semibold text-slate-500">+ {gbpFromPence(fee)} booking fee</span></p>}
      <p className="text-sm text-slate-600 mb-4">
        {soldOut ? (paid ? 'Sold out.' : 'All the free tickets have gone.') : remaining !== null && remaining <= 20 ? `Only ${remaining} left. ` : ''}
        {!soldOut && (paid ? 'Sold by the organiser through TheShowFinder. Your tickets come by email as a QR code to show at the door.' : 'Get your tickets here. They come by email as a QR code to show at the door.')}
      </p>
      {!soldOut && (
        <form onSubmit={onSubmit} className="space-y-3">
          <div aria-hidden="true" className="hidden"><label>Leave this empty <input name="website" tabIndex={-1} autoComplete="off" /></label></div>
          {types.length > 1 && (
            <select value={typeId} onChange={e => setTypeId(e.target.value)} className={input} aria-label="Ticket type">
              {types.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          )}
          <div className="grid grid-cols-[96px_1fr] gap-2">
            <select name="quantity" value={Math.min(qty, maxQty)} onChange={e => setQty(Number(e.target.value))} className={input} aria-label="How many tickets">
              {Array.from({ length: maxQty }, (_, i) => i + 1).map(n => <option key={n} value={n}>{n}</option>)}
            </select>
            <input name="name" required maxLength={80} placeholder="Your name" autoComplete="name" className={input} aria-label="Your name" />
          </div>
          <input name="email" type="email" required placeholder="Email for your tickets" autoComplete="email" className={input} aria-label="Email" />
          {error && <p className="text-sm font-semibold text-red-700">{error}</p>}
          <button type="submit" disabled={busy} className="w-full min-h-[56px] rounded-xl font-extrabold text-white disabled:opacity-60" style={{ backgroundColor: '#E8003D' }}>
            {busy ? (paid ? 'Opening secure payment…' : 'Getting your tickets…') : paid ? `Buy ${Math.min(qty, maxQty)} for ${gbpFromPence((type.pricePence + fee) * Math.min(qty, maxQty))}` : 'Get free tickets'}
          </button>
          <p className="text-xs text-slate-400">For {eventTitle}. {paid ? 'Secure payment by Stripe: card, Apple Pay or Google Pay. The booking fee includes VAT. ' : ''}We only use your email to send your tickets and anything the organiser needs to tell you about this event.{paid ? <> <a href="/terms#tickets" className="underline">Ticket terms</a>.</> : null}</p>
        </form>
      )}
    </div>
  )
}
