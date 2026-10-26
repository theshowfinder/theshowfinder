import type { Metadata } from 'next'
import Link from 'next/link'
import { CITIES } from '@/lib/cities'
import { BUSINESS_CATEGORIES, PACKAGES, gbp } from '@/lib/advertisingPackages'
import { requestListingAction } from './actions'

export const metadata: Metadata = {
  title: 'Promote your business on TheShowFinder',
  description: 'Put your restaurant, bar, café, hotel or local business in front of people planning a night out in your city.',
  alternates: { canonical: 'https://www.theshowfinder.com/advertise/join' },
}

const FIELD = 'block w-full mt-1 rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-slate-900'
const LABEL = 'block text-sm font-semibold text-slate-700'

export default async function JoinPage({ searchParams }: { searchParams: Promise<{ city?: string; package?: string; sent?: string; error?: string }> }) {
  const sp = await searchParams
  const city = CITIES.find(c => c.name.toLowerCase() === (sp.city ?? '').toLowerCase())?.name ?? ''
  const pkg = sp.package === 'standard' ? 'standard' : 'featured'

  if (sp.sent) {
    return (
      <div className="min-h-screen" style={{ backgroundColor: '#F5F5F0' }}>
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-20 text-center">
          <h1 className="text-3xl font-extrabold text-slate-900">Thank you</h1>
          <p className="mt-4 text-slate-600 leading-relaxed">We&apos;ve got your details. We&apos;ll be in touch within one working day to confirm your placement and set up payment, then your business goes live.</p>
          <Link href="/" className="inline-block mt-8 font-bold" style={{ color: '#E8003D' }}>Back to TheShowFinder →</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#F5F5F0' }}>
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-14">
        <p className="font-bold text-xs uppercase tracking-widest mb-2" style={{ color: '#E8003D' }}>Promote your business</p>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 leading-tight">Be the place people go before the show{city ? ` in ${city}` : ''}</h1>
        <p className="mt-4 text-slate-600 leading-relaxed text-lg">
          TheShowFinder lists the concerts, theatre, comedy, sport and family shows happening across the UK, updated every day,
          along with local what&apos;s on. People use it to plan a night out, and we&apos;re growing every week. Put your business
          in front of them while they&apos;re deciding where to eat, drink and stay.
        </p>

        <div className="grid gap-4 sm:grid-cols-2 mt-8">
          {(['standard', 'featured'] as const).map(key => (
            <div key={key} className={`rounded-2xl border bg-white p-6 ${key === 'featured' ? 'border-2' : 'border-slate-200'}`} style={key === 'featured' ? { borderColor: '#E8003D' } : undefined}>
              {key === 'featured' && <p className="text-[11px] font-extrabold uppercase tracking-widest mb-1" style={{ color: '#E8003D' }}>Most popular</p>}
              <h2 className="font-extrabold text-slate-900">{PACKAGES[key].name}</h2>
              <p className="mt-2 text-2xl font-extrabold text-slate-900">{gbp(PACKAGES[key].monthly)} <span className="text-sm font-normal text-slate-500">a month</span></p>
              <p className="text-sm font-semibold text-slate-700">or {gbp(PACKAGES[key].yearly)} for the year</p>
              <p className="mt-3 text-sm text-slate-600">{PACKAGES[key].summary}</p>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-slate-500">Monthly plans are a 12-month commitment. Spaces in each city are limited so the guide stays useful.</p>

        <form action={requestListingAction} className="mt-10 bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 space-y-5">
          <h2 className="text-xl font-extrabold text-slate-900">Your details</h2>
          {sp.error && <p className="rounded-lg bg-red-50 border border-red-200 text-red-800 text-sm px-4 py-3">Please fill in your business name, city, your name and a valid email, and tick the box at the end.</p>}

          <div className="grid gap-5 sm:grid-cols-2">
            <label className={LABEL}>Package
              <select name="package" defaultValue={pkg} className={FIELD}>
                <option value="featured">{PACKAGES.featured.name}</option>
                <option value="standard">{PACKAGES.standard.name}</option>
              </select>
            </label>
            <label className={LABEL}>Pay
              <select name="billing" defaultValue="monthly" className={FIELD}>
                <option value="monthly">Monthly</option>
                <option value="yearly">Yearly (save about two months)</option>
              </select>
            </label>
            <label className={LABEL}>Business name<input name="name" required maxLength={80} className={FIELD} /></label>
            <label className={LABEL}>City
              <select name="city" required defaultValue={city} className={FIELD}>
                <option value="">Choose your city</option>
                {CITIES.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
              </select>
            </label>
            <label className={LABEL}>Type of business
              <select name="category" defaultValue="restaurant" className={FIELD}>
                {BUSINESS_CATEGORIES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <label className={LABEL}>Website<input name="website_url" maxLength={200} placeholder="www.yourbusiness.co.uk" className={FIELD} /></label>
            <label className={`${LABEL} sm:col-span-2`}>A short line about your business
              <textarea name="description" maxLength={200} rows={2} placeholder="e.g. Pre-theatre menu, 2 minutes from the Playhouse. Book online." className={FIELD} />
            </label>
            <label className={LABEL}>Address<input name="address" maxLength={160} className={FIELD} /></label>
            <label className={LABEL}>Postcode<input name="postcode" maxLength={12} className={FIELD} /></label>
            <label className={LABEL}>Your name<input name="contact_name" required maxLength={80} className={FIELD} /></label>
            <label className={LABEL}>Email<input name="email" type="email" required maxLength={120} className={FIELD} /></label>
            <label className={LABEL}>Phone (optional)<input name="phone" maxLength={40} className={FIELD} /></label>
          </div>
          <input name="fax" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />
          <label className="flex items-start gap-3 text-sm text-slate-600">
            <input type="checkbox" name="agree" required className="mt-1" />
            <span>I&apos;d like to go ahead. I understand monthly plans are a 12-month commitment, and you&apos;ll contact me to confirm and set up payment before anything is charged.</span>
          </label>
          <button type="submit" className="w-full sm:w-auto font-extrabold text-white rounded-xl px-8 py-3.5" style={{ backgroundColor: '#E8003D' }}>Send my details</button>
        </form>
      </div>
    </div>
  )
}
