import type { Metadata } from 'next'
import Link from 'next/link'
import { CITIES } from '@/lib/cities'

export const metadata: Metadata = {
  title: 'Advertise your local business | TheShowFinder',
  description: 'Put your business on TheShowFinder city pages with a direct website link and a limited local advertising placement.',
  alternates:  { canonical: 'https://www.theshowfinder.com/advertise' },
}

const standardBenefits = [
  'Visible on your chosen city page',
  'Appears in the second or third advertising row',
  'Business name, category and description',
  'Direct link to your website',
  'Maximum six Standard placements per city',
]

const featuredBenefits = [
  'Always appears in the first advertising row',
  'More prominent Featured styling',
  'Business name, category and description',
  'Direct link to your website',
  'Maximum three Featured placements per city',
]

function PackageCard({ name, monthly, annual, benefits, featured = false }: {
  name: string
  monthly: string
  annual: string
  benefits: string[]
  featured?: boolean
  href: string
}) {
  return (
    <div className={`relative rounded-3xl border bg-white p-7 shadow-sm ${featured ? 'border-rose-300 ring-2 ring-rose-100' : 'border-slate-200'}`}>
      {featured && <span className="absolute right-5 top-5 rounded-full bg-rose-600 px-3 py-1 text-xs font-extrabold uppercase tracking-wider text-white">Top position</span>}
      <p className="mb-2 text-sm font-extrabold uppercase tracking-widest text-rose-600">{name}</p>
      <div className="mb-1 flex items-end gap-2">
        <span className="text-4xl font-black tracking-tight text-slate-950">{monthly}</span>
        <span className="pb-1 text-sm text-slate-500">per month</span>
      </div>
      <p className="mb-6 text-sm font-semibold text-slate-500">or {annual} paid annually</p>
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

export default async function AdvertisePage({ searchParams }: { searchParams: Promise<{ city?: string }> }) {
  const params = await searchParams
  const city = CITIES.find(item => item.name.toLowerCase() === params.city?.trim().toLowerCase())?.name
  const onboardingUrl = (packageKey: 'standard' | 'featured') => `/advertise/onboard?${new URLSearchParams({ ...(city ? { city } : {}), package: packageKey }).toString()}`
  return (
    <main className="min-h-screen bg-[#F5F5F0]">
      <section className="bg-slate-950 text-white">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24 lg:px-8">
          <p className="mb-4 text-sm font-extrabold uppercase tracking-[0.2em] text-rose-400">Advertise with TheShowFinder</p>
          <h1 className="max-w-4xl text-4xl font-black tracking-tight sm:text-6xl">Put your business in front of people planning a night out.</h1>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-slate-300">
            TheShowFinder helps people discover events and plan what to do in cities across the UK. Put your business alongside the events they are already exploring.
          </p>
          <div className="mt-9 inline-flex flex-wrap items-center gap-x-8 gap-y-3 rounded-2xl border border-white/10 bg-white/5 px-6 py-4 text-sm font-bold text-slate-200">
            <span><strong className="text-white">9</strong> businesses maximum per city</span>
            <span><strong className="text-white">3</strong> Featured positions</span>
            <span><strong className="text-white">6</strong> Standard positions</span>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="mb-10 max-w-3xl">
          <p className="mb-2 text-xs font-extrabold uppercase tracking-widest text-rose-600">Simple city pricing</p>
          <h2 className="text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">Choose your position</h2>
          <p className="mt-4 leading-relaxed text-slate-600">
            Every advertiser stays visible on the city page. Featured businesses always appear first, with only three top-row positions available in each city.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <PackageCard name="Standard" monthly="£24.95" annual="£249.95" benefits={standardBenefits} href={onboardingUrl('standard')} />
          <PackageCard name="Featured" monthly="£49.95" annual="£499.95" benefits={featuredBenefits} featured href={onboardingUrl('featured')} />
        </div>

        <div className="mt-12 rounded-3xl bg-rose-600 p-8 text-white shadow-lg sm:flex sm:items-center sm:justify-between sm:p-10">
          <div className="max-w-2xl">
            <h2 className="text-2xl font-black sm:text-3xl">Secure your city placement</h2>
            <p className="mt-2 leading-relaxed text-rose-50">Tell us your business, city and preferred package. We will confirm availability and get your placement ready.</p>
          </div>
          <Link href={onboardingUrl('featured')} className="mt-6 inline-flex shrink-0 items-center justify-center rounded-xl bg-white px-6 py-3.5 text-sm font-extrabold text-rose-600 transition-transform hover:-translate-y-0.5 sm:ml-8 sm:mt-0">
            Start your application →
          </Link>
        </div>
      </section>
    </main>
  )
}
