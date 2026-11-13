import type { Metadata } from 'next'
import Link from 'next/link'
import { GUIDES } from '@/lib/guides'

export const metadata: Metadata = {
  title: 'Ticket Buying Guides',
  description: 'Practical UK guides to buying gig, theatre and comedy tickets: how presales work and how to spot and avoid ticket scams.',
  alternates: { canonical: 'https://www.theshowfinder.com/guides' },
}

export default function GuidesIndex() {
  return (
    <div className="min-h-screen" style={{ backgroundColor: '#F5F5F0' }}>
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
        <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900">Ticket buying guides</h1>
        <p className="text-lg text-slate-700 mt-4">Practical advice for getting tickets to UK gigs, theatre and comedy, and staying safe when you buy.</p>
        <ul className="mt-10 space-y-4">
          {GUIDES.map(g => (
            <li key={g.slug}>
              <Link href={`/guides/${g.slug}`} className="block bg-white rounded-2xl border border-slate-200 shadow-sm p-6 hover:border-slate-400 transition-colors">
                <h2 className="text-xl font-extrabold text-slate-900">{g.title}</h2>
                <p className="text-slate-600 mt-2">{g.description}</p>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
