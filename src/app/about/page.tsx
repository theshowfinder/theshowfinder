import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title:       'About TheShowFinder',
  description: 'TheShowFinder is the UK\'s events discovery and ticket comparison platform. Find concerts, theatre, comedy and live events and compare prices from all major providers.',
  alternates:  { canonical: 'https://www.theshowfinder.com/about' },
}

export default function AboutPage() {
  return (
    <div className="min-h-screen" style={{ backgroundColor: '#F5F5F0' }}>
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16">

        <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 mb-10">
          About TheShowFinder
        </h1>

        <div className="space-y-8 text-slate-600 leading-relaxed">

          <p className="text-lg">
            We are a UK events discovery and ticket comparison platform. We help fans find concerts,
            theatre, comedy, sports and live events across the UK, and compare ticket prices from all
            major providers including Ticketmaster, See Tickets, Viagogo, StubHub and more.
          </p>

          <p>
            Our mission is to make finding and buying live event tickets simpler, faster and fairer.
            We show you every option in one place so you can choose where to buy.
          </p>

          <p>
            We cover <strong className="text-slate-900">36 cities</strong> across the UK with thousands
            of upcoming events updated daily.
          </p>

          <div className="flex flex-wrap gap-4 pt-2">
            <Link
              href="/contact"
              className="inline-block font-bold text-white px-6 py-3 rounded-xl text-sm hover:opacity-90 transition-opacity"
              style={{ backgroundColor: '#E8003D' }}
            >
              Contact us
            </Link>
            <Link
              href="/advertise"
              className="inline-block font-bold text-slate-700 bg-white border border-slate-200 px-6 py-3 rounded-xl text-sm hover:shadow-md transition-shadow"
            >
              Advertise with us
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
