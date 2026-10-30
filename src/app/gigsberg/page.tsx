// Every upcoming show with Gigsberg tickets currently available. The homepage "Featured
// Gigsberg events" strip links here. Inventory is checked per show (the admin Gigsberg
// tools / sync), so the list only contains shows that were recently seen as available.
export const revalidate = 10800

import Link from 'next/link'
import type { Metadata } from 'next'
import { createPublicClient } from '@/lib/supabase/public'
import EventCard from '@/components/EventCard'
import { fetchGigsbergAvailableEvents, GIGSBERG_PAGE_MIN_INDEXABLE } from '@/lib/gigsbergEvents'
import { jsonLdScript, buildBreadcrumbSchema, buildItemListSchema } from '@/lib/jsonld'

const CANONICAL = 'https://www.theshowfinder.com/gigsberg'
const TITLE = 'Shows With Tickets Available on Gigsberg'
const DESCRIPTION = 'UK shows where Gigsberg has tickets available right now, with dates, venues and links to each event page. Inventory is checked regularly and can sell out.'

export async function generateMetadata(): Promise<Metadata> {
  const events = await fetchGigsbergAvailableEvents(createPublicClient())
  const indexable = events.length >= GIGSBERG_PAGE_MIN_INDEXABLE
  return {
    title: TITLE,
    description: DESCRIPTION,
    alternates: { canonical: CANONICAL },
    ...(indexable ? {} : { robots: { index: false, follow: true } }),
    openGraph: { title: `${TITLE} | TheShowFinder`, description: DESCRIPTION, url: CANONICAL },
  }
}

export default async function GigsbergPage() {
  const events = await fetchGigsbergAvailableEvents(createPublicClient())

  const breadcrumb = buildBreadcrumbSchema([
    { name: 'Home', url: 'https://www.theshowfinder.com' },
    { name: 'Gigsberg tickets', url: CANONICAL },
  ])
  const itemList = buildItemListSchema(
    events.slice(0, 20).map(e => ({ name: e.title, url: `https://www.theshowfinder.com/events/${e.slug}` })),
  )

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#F5F5F0' }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(breadcrumb) }} />
      {itemList.itemListElement.length > 0 && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(itemList) }} />
      )}

      <div className="py-14 px-4 sm:px-6 lg:px-8" style={{ backgroundColor: '#1A1A2E' }}>
        <div className="max-w-7xl mx-auto">
          <nav className="text-white/40 text-xs mb-3">
            <Link href="/" className="hover:text-white/70">Home</Link>
            {' / Gigsberg tickets'}
          </nav>
          <p className="font-bold text-xs uppercase tracking-widest mb-2" style={{ color: '#FFD23F' }}>Tickets currently available</p>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-white mb-2">Shows With Tickets on Gigsberg</h1>
          <p className="text-white/60 text-sm max-w-2xl">
            {events.length > 0
              ? `${events.length} upcoming show${events.length !== 1 ? 's' : ''} where Gigsberg had tickets available when we last checked. Gigsberg is a resale marketplace, so prices can be above or below face value.`
              : 'No Gigsberg tickets are listed right now. Check back soon, or browse everything that is on.'}
          </p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-10">
        {events.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {events.map(event => <EventCard key={event.id} event={event} />)}
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center">
            <Link href="/events" className="inline-block font-bold text-white px-6 py-3 rounded-xl" style={{ backgroundColor: '#E8003D' }}>
              Browse all upcoming events
            </Link>
          </div>
        )}

        <p className="text-xs text-slate-400 max-w-3xl">
          Availability is checked regularly but changes quickly: a show can sell out before you click through. We may earn a
          commission if you buy through our links; it never changes the price you pay.
        </p>
        <Link href="/events" className="text-sm font-semibold hover:underline" style={{ color: '#026CDF' }}>
          ← Browse every upcoming event
        </Link>
      </div>
    </div>
  )
}
