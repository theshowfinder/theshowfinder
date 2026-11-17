'use client'

import { useState, type FormEvent } from 'react'
import Link from 'next/link'
import { CATEGORY_CHOICES, BOOST_PRICE_GBP, PROMOTER_PRICE_GBP } from '@/lib/organiserEvents'

const input = 'w-full min-h-[48px] px-4 rounded-xl border border-slate-300 text-base bg-white'
const label = 'block text-sm font-bold text-slate-800 mb-1'

export default function ListEventForm({ cities, initialCity }: { cities: string[]; initialCity?: string }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [boost, setBoost] = useState<'none' | 'boost' | 'promoter'>('boost')
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
          <div><label className={label} htmlFor="city">Nearest city</label>
            <select id="city" name="city" required className={input} defaultValue={initialCity ?? ''}>
              <option value="" disabled>Choose…</option>
              {cities.map(c => <option key={c} value={c}>{c}</option>)}
            </select></div>
          <div><label className={label} htmlFor="postcode">Venue postcode</label><input id="postcode" name="postcode" maxLength={10} className={input} placeholder="DE1 3AB" /></div>
        </div>
        <div><label className={label} htmlFor="ticket_url">Where people buy tickets or book</label><input id="ticket_url" name="ticket_url" required className={input} placeholder="Your Eventbrite, Skiddle, Ticket Tailor or website link" /></div>
        <div><label className={label} htmlFor="price_from">Tickets from (£, optional)</label><input id="price_from" name="price_from" inputMode="decimal" className={input} placeholder="e.g. 12.50, or 0 if free" /></div>
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
