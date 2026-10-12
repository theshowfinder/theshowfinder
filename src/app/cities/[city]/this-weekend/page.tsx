// "{city} this weekend" pages: Friday 17:00 to Sunday night, built from the same
// per-day mix as the This Week page. Weekend intent ("things to do in X this
// weekend") is one of the most-searched event queries and was not targeted by
// any page. Rolls over after midnight, so revalidate is short.
export const revalidate = 300

import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import { createPublicClient } from '@/lib/supabase/public'
import EventCard from '@/components/EventCard'
import { CITIES } from '@/lib/cities'
import { fetchEventsThisWeekend } from '@/lib/eventPools'
import { jsonLdScript, buildBreadcrumbSchema, buildItemListSchema } from '@/lib/jsonld'
import { CITY_GUIDE_INTROS } from '@/lib/cityGuides'
import { buildCityCollectionSchema, cityThisWeekendCanonicalUrl, cityThisWeekendDescription, cityThisWeekendTitle } from '@/lib/citySeo'

export async function generateStaticParams() {
  return CITIES.map(c => ({ city: c.name }))
}

export async function generateMetadata(
  { params }: { params: Promise<{ city: string }> }
): Promise<Metadata> {
  const { city } = await params
  const cityName  = decodeURIComponent(city)
  const canonical = cityThisWeekendCanonicalUrl(cityName)
  const title     = cityThisWeekendTitle(cityName)
  const desc      = cityThisWeekendDescription(cityName)
  const ogImage   = 'https://www.theshowfinder.com/og-image.png'
  return {
    title,
    description: desc,
    alternates:  { canonical },
    openGraph: {
      title,
      description: desc,
      url:    canonical,
      images: [{ url: ogImage, width: 1200, height: 630, alt: title }],
    },
    twitter: {
      card:        'summary_large_image',
      title,
      description: desc,
      images:      [ogImage],
    },
  }
}

export default async function CityThisWeekendPage({
  params,
}: {
  params: Promise<{ city: string }>
}) {
  const { city } = await params
  const requestedCityName = decodeURIComponent(city)

  const cityConfig = CITIES.find(c => c.name.toLowerCase() === requestedCityName.toLowerCase())
  if (!cityConfig) notFound()
  const cityName = cityConfig.name
  if (requestedCityName !== cityName) redirect(cityThisWeekendCanonicalUrl(cityName))

  const supabase = createPublicClient()
  const eventsThisWeekend = await fetchEventsThisWeekend(supabase, { city: cityName, limit: 30 })

  const cityUrl  = `https://www.theshowfinder.com/cities/${encodeURIComponent(cityName)}`
  const canonical = `${cityUrl}/this-weekend`
  const breadcrumbSchema = buildBreadcrumbSchema([
    { name: 'Home', url: 'https://www.theshowfinder.com' },
    { name: cityName, url: cityUrl },
    { name: 'This Weekend', url: canonical },
  ])
  const itemListSchema = buildItemListSchema(
    eventsThisWeekend.slice(0, 20).map(ev => ({
      name: ev.title,
      url:  `https://www.theshowfinder.com/events/${ev.slug}`,
    }))
  )
  const collectionSchema = buildCityCollectionSchema({
    cityName,
    url: canonical,
    name: cityThisWeekendTitle(cityName),
    description: cityThisWeekendDescription(cityName),
  })

  const guideIntro = CITY_GUIDE_INTROS[cityName]

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#F5F5F0' }}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(breadcrumbSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(collectionSchema) }}
      />
      {itemListSchema.itemListElement.length > 0 && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLdScript(itemListSchema) }}
        />
      )}

      {/* ── HERO ── */}
      <div className="relative py-14 px-4 sm:px-6 lg:px-8 overflow-hidden" style={{ backgroundColor: '#1A1A2E' }}>
        <div className="relative max-w-7xl mx-auto">
          <p className="text-5xl mb-4 select-none">{cityConfig.emoji}</p>
          <nav className="text-white/40 text-xs mb-3">
            <Link href="/" className="hover:text-white/70">Home</Link>
            {' / '}
            <Link href={`/cities/${encodeURIComponent(cityName)}`} className="hover:text-white/70">{cityName}</Link>
            {' / This Weekend'}
          </nav>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-white mb-2">
            Things To Do in {cityName} This Weekend
          </h1>
          <p className="text-white/50 text-sm">
            {eventsThisWeekend.length > 0
              ? `${eventsThisWeekend.length} show${eventsThisWeekend.length !== 1 ? 's' : ''} this weekend`
              : `Nothing listed for this weekend yet — see what's coming up`}
          </p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-10">

        {guideIntro && (
          <p className="text-slate-600 leading-relaxed max-w-3xl">
            {guideIntro}
          </p>
        )}

        {eventsThisWeekend.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {eventsThisWeekend.map(event => (
              <EventCard key={event.id} event={event} />
            ))}
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center">
            <p className="text-slate-600 mb-4">
              Nothing&rsquo;s listed in {cityName} for this weekend just yet — but there&rsquo;s plenty coming up further out.
            </p>
            <Link
              href={`/cities/${encodeURIComponent(cityName)}`}
              className="inline-block font-bold text-white px-6 py-3 rounded-xl"
              style={{ backgroundColor: '#E8003D' }}
            >
              See all upcoming shows in {cityName}
            </Link>
          </div>
        )}

        <div className="pt-4 flex flex-wrap gap-x-6 gap-y-2">
          <Link
            href={`/cities/${encodeURIComponent(cityName)}/this-week`}
            className="text-sm font-semibold hover:underline"
            style={{ color: '#026CDF' }}
          >
            Everything on in {cityName} this week →
          </Link>
          <Link
            href={`/cities/${encodeURIComponent(cityName)}`}
            className="text-sm font-semibold hover:underline"
            style={{ color: '#026CDF' }}
          >
            ← See everything on in {cityName}, not just this weekend
          </Link>
        </div>

      </div>
    </div>
  )
}
