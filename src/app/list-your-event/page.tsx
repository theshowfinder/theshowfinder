import type { Metadata } from 'next'
import Link from 'next/link'
import { CITIES } from '@/lib/cities'
import ListEventForm from './ListEventForm'

export const metadata: Metadata = {
  title: 'List Your Event Free | Promote Gigs & Events in Your City',
  description: 'Organising a gig, club night, comedy show or local event? List it free on TheShowFinder, sell tickets and keep 100% of your ticket price, or boost it to reach more people in your town.',
  alternates: { canonical: 'https://www.theshowfinder.com/list-your-event' },
}

export default async function ListYourEventPage({ searchParams }: { searchParams: Promise<{ city?: string; ticketing?: string }> }) {
  const { city, ticketing } = await searchParams
  const initialTicketing = ticketing === 'paid' || ticketing === 'free' ? ticketing : undefined
  const cities = CITIES.map(c => c.name).sort()
  const initialCity = cities.find(c => c.toLowerCase() === (city ?? '').toLowerCase())
  return (
    <main className="min-h-screen bg-[#F5F5F0]">
      <section className="bg-[#1A1A2E] text-white">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
          <p className="text-xs font-extrabold uppercase tracking-widest text-[#E8003D]">For promoters, venues and bands</p>
          <h1 className="mt-2 text-3xl sm:text-5xl font-extrabold leading-tight">Get your event in front of people looking for something to do</h1>
          <p className="mt-4 text-lg text-white/80">Add your gig, club night, comedy show or local event in two minutes, anywhere in the UK. Listing is free. Link to your own ticket page, or sell tickets through us and keep 100% of your ticket price, paid to your bank as you sell.</p>
          <p className="mt-3"><Link href="/sell-tickets" className="font-bold underline text-white">Why sell tickets with us? See the benefits →</Link></p>
          <ul className="mt-6 grid sm:grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
            <li className="rounded-2xl bg-white/10 p-4"><strong className="block text-base">Free listing</strong>Your town page, venue page and search</li>
            <li className="rounded-2xl bg-white/10 p-4"><strong className="block text-base">Sell tickets</strong>You keep every penny. Buyers pay a small fee</li>
            <li className="rounded-2xl bg-white/10 p-4"><strong className="block text-base">Boost £9.95</strong>Featured until the night, socials and the weekly email</li>
            <li className="rounded-2xl bg-white/10 p-4"><strong className="block text-base">Promoter £19.95/mo</strong>Every event boosted plus your own page</li>
          </ul>
        </div>
      </section>
      <section className="max-w-2xl mx-auto px-4 sm:px-6 py-10">
        <div className="rounded-3xl bg-white border border-slate-200 shadow-sm p-5 sm:p-8">
          <ListEventForm cities={cities} initialCity={initialCity} initialTicketing={initialTicketing} />
        </div>
        <p className="mt-6 text-sm text-slate-500 text-center">We check every listing before it shows. Questions? <a href="mailto:hello@theshowfinder.com" className="underline">hello@theshowfinder.com</a></p>
      </section>
    </main>
  )
}
