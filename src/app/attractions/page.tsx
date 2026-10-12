// Attractions & experiences hub — timed-entry tickets (London Eye, Madame
// Tussauds, Sea Life, Twist Museum, ...) in one place instead of flooding the
// "Tonight" / "This Week" show listings. One card per attraction.
export const revalidate = 600

import Link from 'next/link'
import type { Metadata } from 'next'
import ShowCard from '@/components/ShowCard'
import { getAttractionShows } from '@/lib/showPool'
import { jsonLdScript, buildBreadcrumbSchema, buildItemListSchema } from '@/lib/jsonld'

const BASE = 'https://www.theshowfinder.com'
const CANONICAL = `${BASE}/attractions`
const TITLE = 'UK Attractions & Experiences – Tickets | TheShowFinder'
const DESCRIPTION =
  'Tickets for UK attractions and experiences — London Eye, Madame Tussauds, Sea Life, the London Dungeon and more — with dates and prices in one place.'

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: CANONICAL },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: CANONICAL,
    images: [{ url: `${BASE}/og-image.png`, width: 1200, height: 630, alt: TITLE }],
  },
  twitter: { card: 'summary_large_image', title: TITLE, description: DESCRIPTION, images: [`${BASE}/og-image.png`] },
}

export default async function AttractionsPage() {
  const attractions = await getAttractionShows()

  const breadcrumbSchema = buildBreadcrumbSchema([
    { name: 'Home', url: BASE },
    { name: 'Attractions', url: CANONICAL },
  ])
  const itemListSchema = buildItemListSchema(
    attractions.slice(0, 30).map(a => ({ name: a.title, url: `${BASE}/events/${a.nextEventSlug}` })),
  )

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#F5F5F0' }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(breadcrumbSchema) }} />
      {itemListSchema.itemListElement.length > 0 && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(itemListSchema) }} />
      )}

      <div className="py-14 px-4 sm:px-6 lg:px-8" style={{ backgroundColor: '#1A1A2E' }}>
        <div className="max-w-7xl mx-auto">
          <p className="text-5xl mb-4 select-none">🎡</p>
          <nav className="text-white/40 text-xs mb-3">
            <Link href="/" className="hover:text-white/70">Home</Link>
            {' / Attractions'}
          </nav>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-white mb-2">Attractions &amp; Experiences</h1>
          <p className="text-white/60 text-sm max-w-2xl">
            Timed-entry tickets for days out across the UK, kept separate from live shows so you can find what you’re after.
          </p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-10">
        {attractions.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {attractions.map(a => <ShowCard key={a.slug} show={a} kind="attraction" />)}
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center">
            <p className="text-slate-600 mb-4">Attraction listings are being refreshed — please check back shortly.</p>
            <Link href="/events" className="inline-block font-bold text-white px-6 py-3 rounded-xl" style={{ backgroundColor: '#E8003D' }}>
              Browse all events
            </Link>
          </div>
        )}
        <Link href="/west-end" className="text-sm font-semibold hover:underline" style={{ color: '#026CDF' }}>Looking for a show? See the West End →</Link>
      </div>
    </div>
  )
}
