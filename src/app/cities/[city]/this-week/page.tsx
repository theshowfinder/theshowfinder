// Dedicated page for "events this week in {city}"-style searches — split out
// from the main city page because Search Console showed literally zero
// impressions for that phrase (and the broader "events in {city}") despite
// the main city page already having a "Events This Week in {city}" section:
// a subsection mid-page isn't what Google indexes as a match for a distinct
// search intent, it needs its own URL/title/H1, the same pattern the site
// already uses nationally for /on-sale-this-week. Fully data-driven off the
// same fetchEventsThisWeek() the main city page uses, so this is safe to
// ship for all 36 cities at once — no per-city manual content needed here
// (unlike src/lib/cityGuides.ts, which does need real per-city research).
export const revalidate = 3600

import { notFound } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import EventCard from '@/components/EventCard'
import { CITIES } from '@/lib/cities'
import { fetchEventsThisWeek } from '@/lib/eventPools'
import { jsonLdScript, buildBreadcrumbSchema, buildItemListSchema } from '@/lib/jsonld'
import { CITY_GUIDE_INTROS } from '@/lib/cityGuides'

export async function generateStaticParams() {
  return CITIES.map(c => ({ city: encodeURIComponent(c.name) }))
}

export async function generateMetadata(
  { params }: { params: Promise<{ city: string }> }
): Promise<Metadata> {
  const { city } = await params
  const cityName  = decodeURIComponent(city)
  const canonical = `https://www.theshowfinder.com/cities/${encodeURIComponent(cityName)}/this-week`
  const title     = `Events This Week in ${cityName}`
  const desc      = `What's on in ${cityName} this week — concerts, theatre, comedy, sport and family events. Compare ticket prices across every major provider.`
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

export default async function CityThisWeekPage({
  params,
}: {
  params: Promise<{ city: string }>
}) {
  const { city } = await params
  const cityName = decodeURIComponent(city)

  const cityConfig = CITIES.find(c => c.name === cityName)
  if (!cityConfig) notFound()

  const supabase = await createClient()
  const eventsThisWeek = await fetchEventsThisWeek(supabase, { city: cityName, limit: 30 })

  const cityUrl  = `https://www.theshowfinder.com/cities/${encodeURIComponent(cityName)}`
  const canonical = `${cityUrl}/this-week`
  const breadcrumbSchema = buildBreadcrumbSchema([
    { name: 'Home', url: 'https://www.theshowfinder.com' },
    { name: cityName, url: cityUrl },
    { name: 'This Week', url: canonical },
  ])
  const itemListSchema = buildItemListSchema(
    eventsThisWeek.slice(0, 20).map(ev => ({
      name: ev.title,
      url:  `https://www.theshowfinder.com/events/${ev.slug}`,
    }))
  )

  const guideIntro = CITY_GUIDE_INTROS[cityName]

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#F5F5F0' }}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(breadcrumbSchema) }}
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
            {' / This Week'}
          </nav>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-white mb-2">
            Events This Week in {cityName}
          </h1>
          <p className="text-white/50 text-sm">
            {eventsThisWeek.length > 0
              ? `${eventsThisWeek.length} show${eventsThisWeek.length !== 1 ? 's' : ''} in the next 7 days`
              : `Nothing on in the next 7 days right now — see what's coming up`}
          </p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-10">

        {guideIntro && (
          <p className="text-slate-600 leading-relaxed max-w-3xl">
            {guideIntro}
          </p>
        )}

        {eventsThisWeek.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {eventsThisWeek.map(event => (
              <EventCard key={event.id} event={event} />
            ))}
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center">
            <p className="text-slate-600 mb-4">
              Nothing&rsquo;s landed in {cityName} in the next 7 days just yet — but there&rsquo;s plenty coming up further out.
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

        <div className="pt-4">
          <Link
            href={`/cities/${encodeURIComponent(cityName)}`}
            className="text-sm font-semibold hover:underline"
            style={{ color: '#026CDF' }}
          >
            ← See everything on in {cityName}, not just this week
          </Link>
        </div>

      </div>
    </div>
  )
}
