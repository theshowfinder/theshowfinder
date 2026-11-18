'use client'

import { useState } from 'react'
import { bookingFeePence, gbpFromPence, parsePricePence } from '@/lib/tickets'
import { MAX_TICKET_TYPES, MAX_DISCOUNT_CODES } from '@/lib/ticketPlan'

// Paid tickets: one or more ticket types (Early bird with an end date, Standard, VIP) and optional discount codes.
// Sent as one JSON field, ticket_plan; checked again on the server (validateTicketPlan).
type TypeRow = { name: string; price: string; capacity: string; salesEnd: string }
type CodeRow = { code: string; kind: 'percent' | 'amount'; amount: string; maxUses: string; expires: string }

const input = 'w-full min-h-[44px] px-3 rounded-xl border border-slate-300 text-base bg-white'
const small = 'block text-xs font-bold text-slate-700 mb-1'

export default function TicketBuilder() {
  const [types, setTypes] = useState<TypeRow[]>([{ name: '', price: '', capacity: '', salesEnd: '' }])
  const [codes, setCodes] = useState<CodeRow[]>([])
  const setType = (i: number, k: keyof TypeRow, v: string) => setTypes(ts => ts.map((t, j) => j === i ? { ...t, [k]: v } : t))
  const setCode = (i: number, k: keyof CodeRow, v: string) => setCodes(cs => cs.map((c, j) => j === i ? { ...c, [k]: v } : c))
  const many = types.length > 1

  return (
    <div className="space-y-4">
      <input type="hidden" name="ticket_plan" value={JSON.stringify({ types, codes })} />
      {types.map((t, i) => {
        const p = parsePricePence(t.price)
        return (
          <div key={i} className="rounded-2xl border border-slate-200 bg-slate-50/60 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-extrabold text-slate-900">{many ? `Ticket ${i + 1}` : 'Your ticket'}</p>
              {many && <button type="button" onClick={() => setTypes(ts => ts.filter((_, j) => j !== i))} className="text-xs font-bold text-slate-500 underline">Remove</button>}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-[1.4fr_1fr_1fr] gap-2">
              <div><label className={small} htmlFor={`tt-name-${i}`}>Name {many ? '' : <span className="font-normal text-slate-500">(optional)</span>}</label>
                <input id={`tt-name-${i}`} required={many} maxLength={60} className={input} placeholder={i === 0 ? 'e.g. Standard' : i === 1 ? 'e.g. VIP' : 'e.g. Early bird'} value={t.name} onChange={e => setType(i, 'name', e.target.value)} /></div>
              <div><label className={small} htmlFor={`tt-price-${i}`}>Price (£)</label>
                <input id={`tt-price-${i}`} required inputMode="decimal" className={input} placeholder="12.50" value={t.price} onChange={e => setType(i, 'price', e.target.value)} /></div>
              <div><label className={small} htmlFor={`tt-cap-${i}`}>How many</label>
                <input id={`tt-cap-${i}`} required type="number" min={1} max={10000} inputMode="numeric" className={input} placeholder="200" value={t.capacity} onChange={e => setType(i, 'capacity', e.target.value)} /></div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 items-end">
              <div><label className={small} htmlFor={`tt-end-${i}`}>On sale until <span className="font-normal text-slate-500">(optional, for early bird)</span></label>
                <input id={`tt-end-${i}`} type="date" className={input} value={t.salesEnd} onChange={e => setType(i, 'salesEnd', e.target.value)} /></div>
              <p className="text-xs text-slate-600 pb-1">{p ? <>You get <strong>{gbpFromPence(p)}</strong>. Buyer pays {gbpFromPence(p + bookingFeePence(p))}.</> : 'You keep 100% of your ticket price.'}</p>
            </div>
          </div>
        )
      })}
      {types.length < MAX_TICKET_TYPES && (
        <button type="button" onClick={() => setTypes(ts => [...ts, { name: '', price: '', capacity: '', salesEnd: '' }])} className="text-sm font-bold underline text-slate-800">+ Add another ticket type (VIP, early bird, concession…)</button>
      )}

      <div className="pt-1">
        <p className="text-sm font-extrabold text-slate-900">Discount codes <span className="font-normal text-slate-500">(optional)</span></p>
        <p className="text-xs text-slate-500">For friends, the band, or a promo. Buyers type the code before paying. A ticket never goes below £1.</p>
      </div>
      {codes.map((c, i) => (
        <div key={i} className="rounded-2xl border border-slate-200 bg-slate-50/60 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-extrabold text-slate-900">Code {i + 1}</p>
            <button type="button" onClick={() => setCodes(cs => cs.filter((_, j) => j !== i))} className="text-xs font-bold text-slate-500 underline">Remove</button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-[1.3fr_1fr_1fr] gap-2">
            <div><label className={small} htmlFor={`dc-code-${i}`}>Code</label>
              <input id={`dc-code-${i}`} required maxLength={20} className={`${input} uppercase`} placeholder="FRIENDS20" value={c.code} onChange={e => setCode(i, 'code', e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} /></div>
            <div><label className={small} htmlFor={`dc-kind-${i}`}>Discount</label>
              <select id={`dc-kind-${i}`} className={input} value={c.kind} onChange={e => setCode(i, 'kind', e.target.value)}>
                <option value="percent">% off</option><option value="amount">£ off</option>
              </select></div>
            <div><label className={small} htmlFor={`dc-amt-${i}`}>{c.kind === 'percent' ? 'Percent off' : 'Pounds off'}</label>
              <input id={`dc-amt-${i}`} required inputMode="decimal" className={input} placeholder={c.kind === 'percent' ? '20' : '2.50'} value={c.amount} onChange={e => setCode(i, 'amount', e.target.value)} /></div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><label className={small} htmlFor={`dc-max-${i}`}>How many tickets <span className="font-normal text-slate-500">(optional)</span></label>
              <input id={`dc-max-${i}`} type="number" min={1} max={10000} inputMode="numeric" className={input} placeholder="No limit" value={c.maxUses} onChange={e => setCode(i, 'maxUses', e.target.value)} /></div>
            <div><label className={small} htmlFor={`dc-exp-${i}`}>Ends <span className="font-normal text-slate-500">(optional)</span></label>
              <input id={`dc-exp-${i}`} type="date" className={input} value={c.expires} onChange={e => setCode(i, 'expires', e.target.value)} /></div>
          </div>
        </div>
      ))}
      {codes.length < MAX_DISCOUNT_CODES && (
        <button type="button" onClick={() => setCodes(cs => [...cs, { code: '', kind: 'percent', amount: '', maxUses: '', expires: '' }])} className="text-sm font-bold underline text-slate-800">+ Add a discount code</button>
      )}
      <p className="text-xs text-slate-500">Buyers pay a small booking fee on top of each ticket, shown before they pay. Stripe pays your takings into your bank, usually a few days after each sale. You set up payouts with Stripe after listing.</p>
    </div>
  )
}
