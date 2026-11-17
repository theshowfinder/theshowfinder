'use client'

import { useState, type FormEvent } from 'react'
import Link from 'next/link'
import { CATEGORY_CHOICES, BOOST_PRICE_GBP, PROMOTER_PRICE_GBP } from '@/lib/organiserEvents'
import { bookingFeePence, gbpFromPence, parsePricePence } from '@/lib/tickets'

const input = 'w-full min-h-[48px] px-4 rounded-xl border border-slate-300 text-base bg-white'
const label = 'block text-sm font-bold text-slate-800 mb-1'

export default function ListEventForm({ cities, initialCity }: { cities: string[]; initialCity?: string }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [boost, setBoost] = useState<'none' | 'boost' | 'promoter'>('boost')
  const [ticketing, setTicketing] = useState<'link' | 'paid' | 'free'>('link')
  const [price, setPrice] = useState('')
  const [startedAt] = useState(() => String(Date.now()))

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (busy) return
    setBusy(true); setError(null)
    const res = await fetch('/api/list-your-event', { method: 'POST', body: new FormData(e.currentTarget) })
    const json = await res.json().catch(() => ({})) as { checkoutUrl?: string; next?: string; error?: string }
    if (json.checkoutUrl) { window.location.href = json.checkoutUrl; return }
    if (json.next) { window.location.href = json.next; return }
    setBusy(false); setError(json.error ?? 'Something went wrong. Please try again.')
  }

  const option = (value: typeof boost, title: string, price: string, blurb: string) => (
    <label className={`block rounded-2xl border-2 p-4 cursor-pointer ${boost === value ? 'border-[#E8003D] bg-red-50/40' : 'border-slate-200 bg-white'}`}>
      <input type="radio" name="boost" value={value} checked={boost === value} onChange={() => setBoost(value)} className="sr-only" />
      <span className="flex items-baseline justify-between gap-3">
        <span className="font-extrabold text-slate-900">{title}</span>
        <span className="font-extrabold text-slate-900 whitespace-nowrap">{price}</span>
      </span>
      <span className="block text-sm text-slate-600 mt-1">{blurb}</span>
    </label>
  )

  return (
    <form onSubmit={onSubmit} className="space-y-6" encType="multipart/form-data">
      <input type="hidden" name="started_at" value={startedAt} />
      <div aria-hidden="true" className="hidden"><label>Leave this empty <input name="company_url" tabIndex={-1} autoComplete="off" /></label></div>

      <fieldset className="space-y-4">
        <legend className="text-lg font-extrabold text-slate-900 mb-1">Your event</legend>
        <div><label className={label} htmlFor="title">Event name</label><input id="title" name="title" required maxLength={120} className={input} placeholder="e.g. Christmas Bliss: 80s, 90s & 00s Party" /></div>
        <div><label className={label} htmlFor="category">What kind of event?</label>
          <select id="category" name="category" required className={input} defaultValue="concert">
            {CATEGORY_CHOICES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className={label} htmlFor="date">Date</label><input id="date" name="date" type="date" required className={input} /></div>
          <div><label className={label} htmlFor="time">Start time</label><input id="time" name="time" type="time" required className={input} defaultValue="19:30" /></div>
        </div>
        <div><label className={label} htmlFor="venue_name">Venue</label><input id="venue_name" name="venue_name" required maxLength={100} className={input} placeholder="e.g. The Old Bell Hotel" /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className={label} htmlFor="city">Town or city</label>
            <input id="city" name="city" required maxLength={60} list="tsf-cities" className={input} defaultValue={initialCity ?? ''} placeholder="e.g. Ilkeston" autoComplete="address-level2" />
            <datalist id="tsf-cities">{cities.map(c => <option key={c} value={c} />)}</datalist></div>
          <div><label className={label} htmlFor="postcode">Venue postcode</label><input id="postcode" name="postcode" required maxLength={10} className={input} placeholder="DE7 5RP" autoComplete="postal-code" /></div>
        </div>
        <p className="text-xs text-slate-500 -mt-2">Anywhere in the UK. Events outside our city pages show on the nearest one, so people nearby still find them.</p>
        <div>
          <p className={label}>How do people get tickets?</p>
          <input type="hidden" name="ticketing" value={ticketing} />
          <div className="grid sm:grid-cols-3 gap-2">
            {([['link', 'On my own ticket site', 'Eventbrite, Skiddle, your website…'], ['paid', 'Sell tickets with TheShowFinder', 'Cheaper than Eventbrite. Paid to your bank after the event.'], ['free', 'Free tickets through TheShowFinder', 'QR tickets by email, scan them at the door. Free.']] as const).map(([v, t, b]) => (
              <button key={v} type="button" onClick={() => setTicketing(v)} aria-pressed={ticketing === v}
                className={`text-left rounded-2xl border-2 p-3 ${ticketing === v ? 'border-[#E8003D] bg-red-50/40' : 'border-slate-200 bg-white'}`}>
                <span className="block font-extrabold text-slate-900 text-sm">{t}</span>
                <span className="block text-xs text-slate-600 mt-0.5">{b}</span>
              </button>
            ))}
          </div>
        </div>
        {ticketing === 'paid' && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div><label className={label} htmlFor="paid_price">Ticket price (£)</label><input id="paid_price" name="paid_price" required inputMode="decimal" className={input} placeholder="e.g. 12.50" value={price} onChange={e => setPrice(e.target.value)} /></div>
              <div><label className={label} htmlFor="paid_capacity">How many tickets?</label><input id="paid_capacity" name="paid_capacity" type="number" min={1} max={10000} required inputMode="numeric" className={input} placeholder="e.g. 200" /></div>
            </div>
            <FeeNote price={price} />
            <div><label className={label} htmlFor="ticket_url">Event web page <span className="font-normal text-slate-500">(optional)</span></label><input id="ticket_url" name="ticket_url" className={input} placeholder="Facebook event or website" /></div>
          </div>
        )}
        {ticketing === 'paid' ? null : ticketing === 'free' ? (
          <div className="grid grid-cols-2 gap-3">
            <div><label className={label} htmlFor="free_capacity">How many tickets?</label><input id="free_capacity" name="free_capacity" type="number" min={1} max={5000} required inputMode="numeric" className={input} placeholder="e.g. 150" /></div>
            <div><label className={label} htmlFor="ticket_url">Event web page <span className="font-normal text-slate-500">(optional)</span></label><input id="ticket_url" name="ticket_url" className={input} placeholder="Facebook event or website" /></div>
          </div>
        ) : (
          <div><label className={label} htmlFor="ticket_url">Where people buy tickets or book</label><input id="ticket_url" name="ticket_url" required className={input} placeholder="Your Eventbrite, Skiddle, Ticket Tailor or website link" /></div>
        )}
        {ticketing === 'link' && <div><label className={label} htmlFor="price_from">Tickets from (£, optional)</label><input id="price_from" name="price_from" inputMode="decimal" className={input} placeholder="e.g. 12.50, or 0 if free" /></div>}
        <div><label className={label} htmlFor="description">Tell people about it (optional)</label><textarea id="description" name="description" maxLength={1200} rows={4} className={`${input} py-3`} placeholder="Who’s playing, what to expect, dress code…" /></div>
        <div><label className={label} htmlFor="image">Photo or poster (optional, JPG/PNG up to 5MB)</label><input id="image" name="image" type="file" accept="image/png,image/jpeg,image/webp" className="block w-full text-sm" /></div>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="text-lg font-extrabold text-slate-900 mb-1">About you</legend>
        <div><label className={label} htmlFor="organiser_name">Your name or organisation</label><input id="organiser_name" name="organiser_name" required maxLength={80} className={input} placeholder="e.g. Christmas Bliss Events" /></div>
        <div><label className={label} htmlFor="email">Email</label><input id="email" name="email" type="email" required autoComplete="email" className={input} /></div>
        <div><label className={label} htmlFor="website">Website (optional)</label><input id="website" name="website" className={input} placeholder="yourwebsite.co.uk" /></div>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="text-lg font-extrabold text-slate-900 mb-1">How many people should see it?</legend>
        {option('boost', 'Boost this event', `£${BOOST_PRICE_GBP.toFixed(2)}`, 'Featured at the top of your city page until the night, plus “This weekend”, our social posts and the weekly email. Most popular.')}
        {option('promoter', 'Promoter plan', `£${PROMOTER_PRICE_GBP.toFixed(2)}/month`, 'Every event you list is boosted, plus your own promoter page. For regular nights. Cancel any time.')}
        {option('none', 'Free listing', '£0', 'On your city page, the venue page and in search, with a button to your tickets.')}
      </fieldset>

      <label className="flex items-start gap-2 text-sm text-slate-600">
        <input type="checkbox" name="terms" value="yes" required className="mt-1" />
        <span>I’m organising or promoting this event, the details are right, and I agree to the <Link href="/terms#event-listings" className="underline">listing terms</Link>.</span>
      </label>

      {error && <p role="alert" className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm font-semibold text-red-700">{error}</p>}
      <button type="submit" disabled={busy} className="w-full min-h-[56px] rounded-xl text-white text-lg font-extrabold disabled:opacity-60" style={{ backgroundColor: '#E8003D' }}>
        {busy ? 'Saving…' : boost === 'none' ? 'List my event free' : 'Continue to payment'}
      </button>
    </form>
  )
}

// You get your full ticket price; the buyer pays our booking fee on top (6% + 49p, all-in), compared with Eventbrite.
function FeeNote({ price }: { price: string }) {
  const p = parsePricePence(price)
  if (!p) return <p className="text-xs text-slate-500 -mt-1">You get your full ticket price. Buyers pay a booking fee of 6% + 49p a ticket (Eventbrite: 6.95% + 59p). Stripe pays your takings into your bank, usually a few days after each sale.</p>
  const fee = bookingFeePence(p)
  const eb = Math.round(p * 0.0695) + 59
  return (
    <p className="text-xs text-slate-600 -mt-1">
      You get <strong>{gbpFromPence(p)}</strong> a ticket. Buyers pay {gbpFromPence(p + fee)} ({gbpFromPence(fee)} booking fee{eb > fee ? `, ${gbpFromPence(eb - fee)} less than Eventbrite’s` : ''}). Stripe pays it into your bank a few days after each sale. You set up payouts with Stripe after listing.
    </p>
  )
}
