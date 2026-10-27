'use client'

import { useState } from 'react'
import { CITIES } from '@/lib/cities'

type PackageKey = 'featured' | 'standard'

const PACKAGES = {
  featured: { label: 'Featured placement', price: '£44.95 per month', detail: 'One of three premium positions, with priority city placement and event-page visibility.' },
  standard: { label: 'Standard listing', price: '£29.95 per month', detail: 'One of six strong business listings in your city.' },
} as const

export default function AdvertiserOnboardingForm({ initialCity = '', initialPackage = 'featured' }: { initialCity?: string; initialPackage?: PackageKey }) {
  const [step, setStep] = useState(1)
  const [city, setCity] = useState(initialCity)
  const [packageKey, setPackageKey] = useState<PackageKey>(initialPackage)
  const [businessName, setBusinessName] = useState('')
  const [category, setCategory] = useState('Restaurant')
  const [contactName, setContactName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [website, setWebsite] = useState('')
  const [description, setDescription] = useState('')
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [assetFiles, setAssetFiles] = useState<File[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')

  const canContinue = city.length > 0
  const canSubmit = businessName.trim().length > 1 && contactName.trim().length > 1 && email.includes('@')

  async function submitApplication() {
    if (!canSubmit || submitting) return
    setSubmitting(true)
    setError('')
    const form = new FormData()
    form.set('city', city)
    form.set('package', packageKey)
    form.set('business_name', businessName.trim())
    form.set('category', category)
    form.set('contact_name', contactName.trim())
    form.set('email', email.trim())
    form.set('phone', phone.trim())
    form.set('website_url', website.trim())
    form.set('description', description.trim())
    if (logoFile) form.set('logo', logoFile)
    assetFiles.forEach(file => form.append('assets', file))

    try {
      const response = await fetch('/api/advertise/applications', { method: 'POST', body: form })
      const result = await response.json().catch(() => null)
      if (!response.ok) throw new Error(result?.error || 'We could not submit the application.')
      setSubmitted(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'We could not submit the application.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[0.8fr_1.2fr]">
      <aside className="rounded-3xl bg-slate-950 p-7 text-white sm:p-9">
        <p className="text-xs font-extrabold uppercase tracking-[0.22em] text-rose-300">Advertiser onboarding</p>
        <h1 className="mt-4 text-3xl font-extrabold tracking-tight sm:text-4xl">Get your business in front of people planning a night out.</h1>
        <p className="mt-4 text-sm leading-relaxed text-white/70">Choose your city and placement, send us your details and upload your marketing assets. We will confirm availability, arrange payment and prepare your listing.</p>
        <div className="mt-8 space-y-4 text-sm">
          {['Choose your city and package', 'Tell us about your business and upload assets', 'We confirm, publish and send your live link'].map((item, index) => (
            <div key={item} className="flex gap-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/10 font-extrabold text-rose-200">{index + 1}</span>
              <span className="pt-1 text-white/80">{item}</span>
            </div>
          ))}
        </div>
      </aside>

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-9">
        <div className="mb-8 flex items-center gap-2 text-xs font-extrabold uppercase tracking-widest text-slate-400">
          {[1, 2, 3].map(number => <span key={number} className={`rounded-full px-3 py-1 ${step === number ? 'bg-slate-950 text-white' : step > number ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100'}`}>{number}</span>)}
        </div>

        {step === 1 && (
          <div>
            <h2 className="text-2xl font-extrabold text-slate-900">Choose your city and placement</h2>
            <p className="mt-2 text-sm text-slate-500">Each city has nine advertising spaces: three featured and six standard.</p>
            <label className="mt-7 block text-sm font-bold text-slate-700">City
              <select value={city} onChange={event => setCity(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3">
                <option value="">Select a city</option>
                {CITIES.map(item => <option key={item.name} value={item.name}>{item.name}</option>)}
              </select>
            </label>
            <div className="mt-7 grid gap-4 sm:grid-cols-2">
              {(Object.entries(PACKAGES) as [PackageKey, typeof PACKAGES[PackageKey]][]).map(([key, pkg]) => (
                <button type="button" key={key} onClick={() => setPackageKey(key)} className={`rounded-2xl border-2 p-5 text-left transition ${packageKey === key ? 'border-slate-950 bg-slate-50 shadow-md' : 'border-slate-200 hover:border-slate-400'}`}>
                  <span className="text-xs font-extrabold uppercase tracking-widest text-slate-400">{key === 'featured' ? 'Premium visibility' : 'Core presence'}</span>
                  <span className="mt-2 block text-lg font-extrabold text-slate-900">{pkg.label}</span>
                  <span className="mt-1 block text-sm font-bold text-slate-700">{pkg.price}</span>
                  <span className="mt-3 block text-sm leading-relaxed text-slate-500">{pkg.detail}</span>
                </button>
              ))}
            </div>
            <button type="button" disabled={!canContinue} onClick={() => setStep(2)} className="mt-8 rounded-xl bg-slate-950 px-5 py-3 text-sm font-extrabold text-white disabled:cursor-not-allowed disabled:opacity-40">Continue →</button>
          </div>
        )}

        {step === 2 && (
          <div>
            <h2 className="text-2xl font-extrabold text-slate-900">Tell us about your business</h2>
            <p className="mt-2 text-sm text-slate-500">Add the details you want us to use when preparing your listing.</p>
            <div className="mt-7 grid gap-5 sm:grid-cols-2">
              <label className="text-sm font-bold text-slate-700">Business name<input value={businessName} onChange={event => setBusinessName(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3" placeholder="Your business name" /></label>
              <label className="text-sm font-bold text-slate-700">Business type<select value={category} onChange={event => setCategory(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3">{['Restaurant', 'Bar or pub', 'Café', 'Hotel or B&B', 'Attraction', 'Transport', 'Parking', 'Beauty', 'Other'].map(item => <option key={item}>{item}</option>)}</select></label>
              <label className="text-sm font-bold text-slate-700">Your name<input value={contactName} onChange={event => setContactName(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3" placeholder="Contact name" /></label>
              <label className="text-sm font-bold text-slate-700">Email address<input type="email" value={email} onChange={event => setEmail(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3" placeholder="you@business.com" /></label>
              <label className="text-sm font-bold text-slate-700">Phone number<input value={phone} onChange={event => setPhone(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3" placeholder="Optional" /></label>
              <label className="text-sm font-bold text-slate-700">Website<input value={website} onChange={event => setWebsite(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3" placeholder="https://..." /></label>
              <label className="text-sm font-bold text-slate-700 sm:col-span-2">Short description<textarea value={description} onChange={event => setDescription(event.target.value)} rows={4} className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3" placeholder="What should visitors know about your business?" /></label>
              <label className="text-sm font-bold text-slate-700">Logo<input type="file" accept="image/png,image/jpeg,image/webp" onChange={event => setLogoFile(event.target.files?.[0] ?? null)} className="mt-2 block w-full text-sm text-slate-500" /><span className="mt-1 block text-xs font-normal text-slate-400">PNG, JPG or WebP, up to 5MB.</span></label>
              <label className="text-sm font-bold text-slate-700">Marketing files<input type="file" multiple accept="image/png,image/jpeg,image/webp,application/pdf" onChange={event => setAssetFiles(Array.from(event.target.files ?? []))} className="mt-2 block w-full text-sm text-slate-500" /><span className="mt-1 block text-xs font-normal text-slate-400">Up to five images or PDFs, 5MB each.</span></label>
            </div>
            <div className="mt-8 flex gap-3"><button type="button" onClick={() => setStep(1)} className="rounded-xl border border-slate-300 px-5 py-3 text-sm font-extrabold text-slate-700">Back</button><button type="button" disabled={!canSubmit} onClick={() => setStep(3)} className="rounded-xl bg-slate-950 px-5 py-3 text-sm font-extrabold text-white disabled:cursor-not-allowed disabled:opacity-40">Review details →</button></div>
          </div>
        )}

        {step === 3 && !submitted && (
          <div>
            <h2 className="text-2xl font-extrabold text-slate-900">Review your application</h2>
            <p className="mt-2 text-sm text-slate-500">Check the details below, then submit your application. We will contact you to confirm availability and payment.</p>
            <div className="mt-7 rounded-2xl bg-slate-50 p-5 text-sm text-slate-700">
              <p><b>City:</b> {city}</p><p><b>Package:</b> {PACKAGES[packageKey].label} ({PACKAGES[packageKey].price})</p><p><b>Business:</b> {businessName}</p><p><b>Contact:</b> {contactName} · {email}</p><p><b>Logo:</b> {logoFile?.name ?? 'Not supplied'}</p><p><b>Marketing files:</b> {assetFiles.length || 'None'}</p>
            </div>
            {error && <p className="mt-5 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p>}
            <div className="mt-8 flex flex-wrap gap-3"><button type="button" onClick={() => setStep(2)} className="rounded-xl border border-slate-300 px-5 py-3 text-sm font-extrabold text-slate-700">Edit details</button><button type="button" onClick={submitApplication} disabled={submitting} className="rounded-xl bg-rose-600 px-5 py-3 text-sm font-extrabold text-white hover:bg-rose-500 disabled:cursor-wait disabled:opacity-50">{submitting ? 'Submitting…' : 'Submit application →'}</button></div>
          </div>
        )}

        {step === 3 && submitted && (
          <div className="py-8">
            <p className="text-4xl">✓</p>
            <h2 className="mt-4 text-2xl font-extrabold text-slate-900">Application received</h2>
            <p className="mt-3 text-sm leading-relaxed text-slate-600">Thanks. We have your details and files. We will confirm the available placement and payment arrangements before anything goes live.</p>
            <p className="mt-5 text-xs text-slate-400">Your application is pending review. No payment has been taken.</p>
          </div>
        )}
      </section>
    </div>
  )
}
