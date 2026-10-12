// West End hub — one card per show (not per performance), built to rank for
// "West End shows" / "London theatre tickets" searches and to send visitors
// into the ticket comparison on each event page. Theatre tickets are the
// best-paying category on the site, so this page gets prominent placement
// (header nav, homepage, London page).
export const revalidate = 600

import Link from 'next/link'
import type { Metadata } from 'next'
import ShowCard from '@/components/ShowCard'
import { getWestEndShows } from '@/lib/showPool'
import { summarizeVenues } from '@/lib/shows'
import { jsonLdScript, buildBreadcrumbSchema, buildItemListSchema } from '@/lib/jsonld'

const BASE = 'https://www.theshowfinder.com'
const CANONICAL = `${BASE}/west-end`
const TITLE = 'West End Shows & Tickets – Compare Prices'
const SOCIAL_TITLE = `${TITLE} | TheShowFinder`
const DESCRIPTION =
  "Find West End shows and compare ticket prices across providers. See what's on at every London theatre, with the next date, venue and ticket links for each show."

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: CANONICAL },
  openGraph: {
    title: SOCIAL_TITLE,
    description: DESCRIPTION,
    url: CANONICAL,
    images: [{ url: `${BASE}/og-image.png`, width: 1200, height: 630, alt: TITLE }],
  },
  twitter: {
    card: 'summary_large_image',
    title: SOCIAL_TITLE,
    description: DESCRIPTION,
    images: [`${BASE}/og-image.png`],
  },
}

export default async function WestEndPage() {
  const shows = await getWestEndShows()
  const venues = summarizeVenues(shows)

  const breadcrumbSchema = buildBreadcrumbSchema([
    { name: 'Home', url: BASE },
    { name: 'West End', url: CANONICAL },
  ])
  const itemListSchema = buildItemListSchema(
    shows.slice(0, 30).map(s => ({ name: s.title, url: `${BASE}/west-end/${s.slug}` })),
  )
  const collectionSchema = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: 'West End Shows',
    url: CANONICAL,
    description: DESCRIPTION,
    isPartOf: { '@type': 'WebSite', name: 'TheShowFinder', url: BASE },
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#F5F5F0' }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(breadcrumbSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(collectionSchema) }} />
      {itemListSchema.itemListElement.length > 0 && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(itemListSchema) }} />
      )}

      <div className="relative py-14 px-4 sm:px-6 lg:px-8 overflow-hidden" style={{ backgroundColor: '#1A1A2E' }}>
        <div className="relative max-w-7xl mx-auto">
          <p className="text-5xl mb-4 select-none">🎭</p>
          <nav className="text-white/40 text-xs mb-3">
            <Link href="/" className="hover:text-white/70">Home</Link>
            {' / West End'}
          </nav>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-white mb-2">West End Shows &amp; Tickets</h1>
          <p className="text-white/60 text-sm max-w-2xl">
            {shows.length > 0
              ? `${shows.length} show${shows.length !== 1 ? 's' : ''} on across ${venues.length} London theatre${venues.length !== 1 ? 's' : ''}, with ticket prices compared across providers.`
              : 'London’s West End shows, with ticket prices compared across providers.'}
          </p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-12">
        <p className="text-slate-600 leading-relaxed max-w-3xl">
          London’s West End is home to some of the world’s longest-running musicals, plays and comedies. Pick a
          show to see every upcoming performance, or head straight to the ticket comparison to check prices
          across the main providers before you buy. New dates are added daily.
        </p>

        {shows.length > 0 ? (
          <section>
            <h2 className="text-2xl font-extrabold text-slate-900 mb-6">Now playing in the West End</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {shows.map(show => <ShowCard key={show.slug} show={show} kind="west-end" />)}
            </div>
          </section>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center">
            <p className="text-slate-600 mb-4">West End listings are being refreshed — please check back shortly.</p>
            <Link href="/events?category=theatre" className="inline-block font-bold text-white px-6 py-3 rounded-xl" style={{ backgroundColor: '#E8003D' }}>
              Browse all theatre
            </Link>
          </div>
        )}

        {venues.length > 0 && (
          <section>
            <h2 className="text-xl font-extrabold text-slate-900 mb-4">Browse by theatre</h2>
            <ul className="flex flex-wrap gap-2">
              {venues.map(v => (
                <li key={v.name}>
                  {v.slug ? (
                    <Link href={`/venues/${v.slug}`} className="inline-block text-sm bg-white border border-slate-200 rounded-full px-3 py-1.5 text-slate-700 hover:border-slate-400">
                      {v.name} <span className="text-slate-400">· {v.shows}</span>
                    </Link>
                  ) : (
                    <span className="inline-block text-sm bg-white border border-slate-200 rounded-full px-3 py-1.5 text-slate-700">
                      {v.name} <span className="text-slate-400">· {v.shows}</span>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        <div className="pt-2 flex flex-wrap gap-x-6 gap-y-2 text-sm font-semibold" style={{ color: '#026CDF' }}>
          <Link href="/cities/London" className="hover:underline">Everything on in London →</Link>
          <Link href="/events?category=theatre" className="hover:underline">All theatre across the UK →</Link>
        </div>
      </div>
    </div>
  )
}
