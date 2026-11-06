import type { Metadata } from 'next'
import Link from 'next/link'
import { CITIES } from '@/lib/cities'
import { gbp, yearlySaving } from '@/lib/advertisingPackages'

export const metadata: Metadata = {
  title: 'Advertise your local business | TheShowFinder',
  description: 'Put your business on TheShowFinder city pages with a direct website link and a limited local advertising placement.',
  alternates:  { canonical: 'https://www.theshowfinder.com/advertise' },
}

const standardBenefits = [
  'A listing in the local guide on your city page',
  'Business name, category, description and website link',
  'Your offer as a QR voucher, plus a "Book a table" button',
  'A monthly check-in from us, and a mention on our social channels',
  'Maximum six Standard places in each area',
]

const featuredBenefits = (showPages: string) => [
  `On ${showPages}, right under the ticket buttons, in a "Make a night of it" box`,
  'Top of the local guide on your city page, with your logo',
  '"4 min walk from the venue" shown on every show page, so you\'re the obvious choice',
  'Your offer as a QR voucher, plus a "Book a table" button',
  'Regular promotion on our social channels, and a monthly check-in from us',
  'Only three Featured places around each venue',
]

function PackageCard({ name, monthly, annual, saving, benefits, featured = false, href }: {
  name: string
  monthly: string
  annual: string
  saving: string
  benefits: string[]
  featured?: boolean
  href: string
}) {
  return (
    <div className={`relative rounded-3xl border bg-white p-7 shadow-sm ${featured ? 'border-rose-300 ring-2 ring-rose-100' : 'border-slate-200'}`}>
      <span className="absolute left-5 top-5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-extrabold uppercase tracking-wider text-emerald-800">Introductory city rate</span>
      {featured && <span className="absolute right-5 top-5 rounded-full bg-rose-600 px-3 py-1 text-xs font-extrabold uppercase tracking-wider text-white">Top position</span>}
      <p className="mb-2 text-sm font-extrabold uppercase tracking-widest text-rose-600">{name}</p>
      <div className="mb-1 flex items-end gap-2">
        <span className="text-4xl font-black tracking-tight text-slate-950">{monthly}</span>
        <span className="pb-1 text-sm text-slate-500">per month</span>
      </div>
      <p className="mb-1 text-sm font-extrabold text-slate-800">12-month subscription</p>
      <p className="mb-2 text-sm font-semibold text-slate-500">or {annual} paid upfront for the year</p>
      <p className="mb-6 text-sm font-extrabold text-emerald-700">Save {saving} by paying for the year upfront · price protected while subscribed</p>
      <ul className="space-y-3">
        {benefits.map(benefit => (
          <li key={benefit} className="flex gap-3 text-sm leading-relaxed text-slate-600">
            <span className="font-black text-rose-600" aria-hidden="true">✓</span>
            <span>{benefit}</span>
          </li>
        ))}
      </ul>
      <Link href={href} className={`mt-7 inline-flex rounded-xl px-5 py-3 text-sm font-extrabold ${featured ? 'bg-slate-950 text-white hover:bg-slate-800' : 'border border-slate-300 text-slate-800 hover:border-slate-500'}`}>
        Choose {name} →
      </Link>
    </div>
  )
}

export default async function AdvertisePage({ searchParams }: { searchParams: Promise<{ city?: string; ref?: string }> }) {
  const params = await searchParams
  const city = CITIES.find(item => item.name.toLowerCase() === params.city?.trim().toLowerCase())?.name
  // The Featured box appears on the show pages within walking distance of the partner (src/lib/localPlacements.ts,
  // AREA_RADIUS_M), not every page in the city, so no city-wide count here.
  const showPages = city ? `every show page within walking distance of you in ${city}` : 'every show page within walking distance of you'
  // Outreach link code (/p/<ref>): carried through to sign-up so the form is pre-filled.
  const ref = /^[a-f0-9]{6,20}$/.test(params.ref ?? '') ? params.ref! : null
  const onboardingUrl = (packageKey: 'standard' | 'featured') => `/advertise/onboard?${new URLSearchParams({ ...(city ? { city } : {}), package: packageKey, ...(ref ? { ref } : {}) }).toString()}`
  return (
    <main className="min-h-screen bg-[#F5F5F0]">
      <section className="bg-slate-950 text-white">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24 lg:px-8">
          <p className="mb-4 text-sm font-extrabold uppercase tracking-[0.2em] text-rose-400">Advertise with TheShowFinder</p>
          <h1 className="max-w-4xl text-4xl font-black tracking-tight sm:text-6xl">Put your business in front of people planning a night out.</h1>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-slate-300">
            People use TheShowFinder to choose a show and plan the night around it. Be the place they eat, drink or stay, with an offer they can claim on their phone and use at your door.
          </p>
          <div className="mt-9 inline-flex flex-wrap items-center gap-x-8 gap-y-3 rounded-2xl border border-white/10 bg-white/5 px-6 py-4 text-sm font-bold text-slate-200">
            <span><strong className="text-white">9</strong> businesses maximum in each area</span>
            <span><strong className="text-white">3</strong> Featured places around each venue</span>
            <span><strong className="text-white">6</strong> Standard places</span>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="mb-14">
          <p className="mb-2 text-xs font-extrabold uppercase tracking-widest text-rose-600">How it brings you customers</p>
          <h2 className="text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">Seen at the right moment. A reason to choose you. Promoted by us.</h2>
          <div className="mt-8 grid gap-5 md:grid-cols-3">
            {[
              ['1. Seen when they plan the night', `Featured partners sit right under the ticket buttons on ${showPages}, with how far you are from the venue. That is the moment people decide where to go before and after the show.`],
              ['2. A reason to choose you', 'Add an offer such as "10% off food with your show ticket". Visitors tap Get voucher and get a one-off QR code on their phone, valid on the day of their show.'],
              ['3. Easy for you, and we promote you', 'Your staff scan the QR with any phone and enter your PIN to apply it; each voucher works once. We feature our partners on our social channels and check in with you every month.'],
            ].map(([title, body]) => (
              <div key={title} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <p className="text-lg font-extrabold text-slate-950">{title}</p>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">{body}</p>
              </div>
            ))}
          </div>
          <p className="mt-4 text-sm text-slate-500">No app or equipment needed: a staff phone is enough.</p>
        </div>

        <div className="mb-10 max-w-3xl">
          <p className="mb-2 text-xs font-extrabold uppercase tracking-widest text-rose-600">Simple city pricing</p>
          <h2 className="text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">Choose your position</h2>
          <p className="mt-4 leading-relaxed text-slate-600">
            Standard puts you in your city&apos;s local guide. Featured also puts you on every show page within walking distance of you (about a mile), right under the ticket buttons, and there are only three Featured places around each venue.
          </p>
        </div>

        <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm font-semibold text-amber-950">
          These are introductory city rates for the first available placements. Once the nine Manchester positions are filled, or the introductory period ends, pricing will be reviewed. Joining now secures the displayed rate while your subscription remains active. All placements are a 12-month subscription, paid monthly or upfront.
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <PackageCard name="Standard" monthly="£29.95" annual="£299.95" saving={gbp(yearlySaving('standard'))} benefits={standardBenefits} href={onboardingUrl('standard')} />
          <PackageCard name="Featured" monthly="£44.95" annual="£449.95" saving={gbp(yearlySaving('featured'))} benefits={featuredBenefits(showPages)} featured href={onboardingUrl('featured')} />
        </div>

        <div className="mt-12 rounded-3xl bg-rose-600 p-8 text-white shadow-lg sm:flex sm:items-center sm:justify-between sm:p-10">
          <div className="max-w-2xl">
            <h2 className="text-2xl font-black sm:text-3xl">Secure your city placement at the introductory rate</h2>
            <p className="mt-2 leading-relaxed text-rose-50">Choose your city and package, add your offer and pay securely by card. We check your details and put you live, usually within one working day.</p>
          </div>
          <Link href={onboardingUrl('featured')} className="mt-6 inline-flex shrink-0 items-center justify-center rounded-xl bg-white px-6 py-3.5 text-sm font-extrabold text-rose-600 transition-transform hover:-translate-y-0.5 sm:ml-8 sm:mt-0">
            Secure your placement →
          </Link>
        </div>
      </section>
    </main>
  )
}
