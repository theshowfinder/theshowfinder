import type { Metadata } from 'next'
import { CITIES } from '@/lib/cities'
import ListEventForm from './ListEventForm'

export const metadata: Metadata = {
  title: 'List Your Event Free | Promote Gigs & Events in Your City',
  description: 'Organising a gig, club night, comedy show or local event? List it free on TheShowFinder, or boost it for £9.95 to reach more people in your city.',
  alternates: { canonical: 'https://www.theshowfinder.com/list-your-event' },
}

export default async function ListYourEventPage({ searchParams }: { searchParams: Promise<{ city?: string }> }) {
  const { city } = await searchParams
  const cities = CITIES.map(c => c.name).sort()
  const initialCity = cities.find(c => c.toLowerCase() === (city ?? '').toLowerCase())
  return (
    <main className="min-h-screen bg-[#F5F5F0]">
      <section className="bg-[#1A1A2E] text-white">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
          <p className="text-xs font-extrabold uppercase tracking-widest text-[#E8003D]">For promoters, venues and bands</p>
          <h1 className="mt-2 text-3xl sm:text-5xl font-extrabold leading-tight">Get your event in front of people looking for something to do</h1>
          <p className="mt-4 text-lg text-white/80">TheShowFinder lists what’s on in 36 UK cities. Add your gig, club night, comedy show or local event in two minutes. It’s free, and your tickets stay on your own ticket page.</p>
          <ul className="mt-6 grid sm:grid-cols-3 gap-3 text-sm">
            <li className="rounded-2xl bg-white/10 p-4"><strong className="block text-base">Free listing</strong>Your city page, venue page and search</li>
            <li className="rounded-2xl bg-white/10 p-4"><strong className="block text-base">Boost £9.95</strong>Featured until the night, socials and the weekly email</li>
            <li className="rounded-2xl bg-white/10 p-4"><strong className="block text-base">Promoter £19.95/mo</strong>Every event boosted plus your own page</li>
          </ul>
        </div>
      </section>
      <section className="max-w-2xl mx-auto px-4 sm:px-6 py-10">
        <div className="rounded-3xl bg-white border border-slate-200 shadow-sm p-5 sm:p-8">
          <ListEventForm cities={cities} initialCity={initialCity} />
        </div>
        <p className="mt-6 text-sm text-slate-500 text-center">We check every listing before it shows. Questions? <a href="mailto:hello@theshowfinder.com" className="underline">hello@theshowfinder.com</a></p>
      </section>
    </main>
  )
}
