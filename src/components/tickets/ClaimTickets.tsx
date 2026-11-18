'use client'

import { useEffect, useState, type FormEvent } from 'react'
import { bookingFeePence, gbpFromPence } from '@/lib/tickets'

type TicketType = { id: string; name: string; maxPerOrder: number; pricePence: number; salesEnd?: string | null }
type Applied = { code: string; pricePence: number; feePence: number }
const input = 'w-full min-h-[48px] px-4 rounded-xl border border-slate-300 text-base bg-white'

// Free tickets through TheShowFinder: pick how many, name and email, and the QR tickets arrive by email
// (and open straight away on the next page). What's left is read live, the event page itself is cached.
export default function ClaimTickets({ eventTitle, types: allTypes }: { eventTitle: string; types: TicketType[] }) {
  // Early-bird style types drop off once their "on sale until" date has passed (the page itself is cached).
  const [types] = useState(() => { const now = Date.now(); const live = allTypes.filter(t => !t.salesEnd || Date.parse(t.salesEnd) > now); return live.length ? live : allTypes })
  const [typeId, setTypeId] = useState(types[0]?.id ?? '')
  const [codeOpen, setCodeOpen] = useState(false)
  const [codeText, setCodeText] = useState('')
  const [applied, setApplied] = useState<Applied | null>(null)
  const [codeMsg, setCodeMsg] = useState<string | null>(null)
  const [left, setLeft] = useState<Record<string, number> | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [qty, setQty] = useState(1)
  const type = types.find(t => t.id === typeId) ?? types[0]
  const paid = (type?.pricePence ?? 0) > 0
  const unitPrice = paid && applied ? applied.pricePence : type?.pricePence ?? 0
  const fee = paid ? (applied ? applied.feePence : bookingFeePence(type.pricePence)) : 0

  async function applyCode(forTypeId = type?.id, text = codeText) {
    const code = text.toUpperCase().replace(/[^A-Z0-9]/g, '')
    if (!code || !forTypeId) return
    setCodeMsg(null)
    const res = await fetch('/api/tickets/discount', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ticketTypeId: forTypeId, code }) })
    const j = await res.json().catch(() => ({})) as { ok?: boolean; code?: string; pricePence?: number; feePence?: number; error?: string }
    if (j.ok && j.code && j.pricePence != null && j.feePence != null) { setApplied({ code: j.code, pricePence: j.pricePence, feePence: j.feePence }); setCodeMsg(null) }
    else { setApplied(null); setCodeMsg(j.error ?? 'That code didn’t work.') }
  }
  function pickType(id: string) {
    setTypeId(id)
    if (applied) applyCode(id, applied.code)   // same code, new ticket price
  }

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
      body: JSON.stringify({ ticketTypeId: type?.id, quantity: f.get('quantity'), name: f.get('name'), email: f.get('email'), website: f.get('website'), code: paid ? applied?.code : undefined }),
    })
    const json = await res.json().catch(() => ({})) as { url?: string; error?: string }
    if (json.url) { window.location.href = json.url; return }
    setBusy(false); setError(json.error ?? 'Something went wrong. Please try again.')
  }

  return (
    <div id="tickets" className="bg-white border-2 border-slate-900 rounded-2xl p-5 shadow-sm scroll-mt-24 md:scroll-mt-32">
      <h3 className="text-xs font-extrabold uppercase tracking-widest text-slate-400 mb-1">{paid ? 'Tickets' : 'Free tickets'}</h3>
      {paid && types.length === 1 && (
        <p className="text-2xl font-black text-slate-900">
          {applied && <span className="text-base font-semibold text-slate-400 line-through mr-2">{gbpFromPence(type.pricePence)}</span>}
          {gbpFromPence(unitPrice)} <span className="text-sm font-semibold text-slate-500">+ {gbpFromPence(fee)} booking fee</span>
        </p>
      )}
      <p className="text-sm text-slate-600 mb-4">
        {soldOut ? (paid ? 'Sold out.' : 'All the free tickets have gone.') : remaining !== null && remaining <= 20 ? `Only ${remaining} left. ` : ''}
        {!soldOut && (paid ? 'Sold by the organiser through TheShowFinder. Your tickets come by email as a QR code to show at the door.' : 'Get your tickets here. They come by email as a QR code to show at the door.')}
      </p>
      {!soldOut && (
        <form onSubmit={onSubmit} className="space-y-3">
          <div aria-hidden="true" className="hidden"><label>Leave this empty <input name="website" tabIndex={-1} autoComplete="off" /></label></div>
          {types.length > 1 && (
            <fieldset className="space-y-2">
              <legend className="sr-only">Ticket type</legend>
              {types.map(t => {
                const out = left ? (left[t.id] ?? 0) === 0 : false
                const ends = t.salesEnd ? new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', day: 'numeric', month: 'short' }).format(new Date(t.salesEnd)) : null
                return (
                  <label key={t.id} className={`flex items-center justify-between gap-3 rounded-xl border-2 px-3 py-2.5 ${out ? 'opacity-50' : 'cursor-pointer'} ${t.id === typeId ? 'border-[#E8003D] bg-red-50/40' : 'border-slate-200'}`}>
                    <span className="flex items-center gap-2">
                      <input type="radio" name="ticket_type" value={t.id} checked={t.id === typeId} disabled={out} onChange={() => pickType(t.id)} />
                      <span><span className="block font-bold text-slate-900 text-sm">{t.name}</span>{(ends || out) && <span className="block text-xs text-slate-500">{out ? 'Sold out' : `On sale until ${ends}`}</span>}</span>
                    </span>
                    {t.pricePence > 0 && <span className="text-right text-sm font-extrabold text-slate-900">{gbpFromPence(t.id === typeId && applied ? applied.pricePence : t.pricePence)}<span className="block text-[11px] font-semibold text-slate-500">+ {gbpFromPence(t.id === typeId && applied ? applied.feePence : bookingFeePence(t.pricePence))} fee</span></span>}
                  </label>
                )
              })}
            </fieldset>
          )}
          <div className="grid grid-cols-[96px_1fr] gap-2">
            <select name="quantity" value={Math.min(qty, maxQty)} onChange={e => setQty(Number(e.target.value))} className={input} aria-label="How many tickets">
              {Array.from({ length: maxQty }, (_, i) => i + 1).map(n => <option key={n} value={n}>{n}</option>)}
            </select>
            <input name="name" required maxLength={80} placeholder="Your name" autoComplete="name" className={input} aria-label="Your name" />
          </div>
          <input name="email" type="email" required placeholder="Email for your tickets" autoComplete="email" className={input} aria-label="Email" />
          {paid && (
            applied ? (
              <p className="text-sm font-semibold text-green-700">Code {applied.code} applied. <button type="button" className="underline text-slate-500 font-normal" onClick={() => { setApplied(null); setCodeText('') }}>Remove</button></p>
            ) : codeOpen ? (
              <div>
                <div className="flex gap-2">
                  <input value={codeText} onChange={e => setCodeText(e.target.value.toUpperCase())} maxLength={20} placeholder="Discount code" className={`${input} uppercase`} aria-label="Discount code"
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); applyCode() } }} />
                  <button type="button" onClick={() => applyCode()} className="min-h-[48px] px-4 rounded-xl border-2 border-slate-900 font-bold text-slate-900">Apply</button>
                </div>
                {codeMsg && <p className="mt-1 text-sm font-semibold text-red-700">{codeMsg}</p>}
              </div>
            ) : (
              <button type="button" onClick={() => setCodeOpen(true)} className="text-sm font-semibold underline text-slate-600">Have a discount code?</button>
            )
          )}
          {error && <p className="text-sm font-semibold text-red-700">{error}</p>}
          <button type="submit" disabled={busy} className="w-full min-h-[56px] rounded-xl font-extrabold text-white disabled:opacity-60" style={{ backgroundColor: '#E8003D' }}>
            {busy ? (paid ? 'Opening secure payment…' : 'Getting your tickets…') : paid ? `Buy ${Math.min(qty, maxQty)} for ${gbpFromPence((unitPrice + fee) * Math.min(qty, maxQty))}` : 'Get free tickets'}
          </button>
          <p className="text-xs text-slate-400">For {eventTitle}. {paid ? 'Secure payment by Stripe: card, Apple Pay or Google Pay. The booking fee includes VAT. ' : ''}We only use your email to send your tickets and anything the organiser needs to tell you about this event.{paid ? <> <a href="/terms#tickets" className="underline">Ticket terms</a>.</> : null}</p>
        </form>
      )}
    </div>
  )
}
