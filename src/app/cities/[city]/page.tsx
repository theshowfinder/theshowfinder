export const revalidate = 3600

import { notFound } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import EventCard from '@/components/EventCard'
import ArtistOnSaleCard from '@/components/ArtistOnSaleCard'
import SearchBar from '@/components/SearchBar'
import { Suspense } from 'react'
import type { EventWithVenue } from '@/lib/types/database'

const CITIES = [
  { name: 'London',         emoji: '🎡' },
  { name: 'Manchester',     emoji: '🐝' },
  { name: 'Birmingham',     emoji: '🏭' },
  { name: 'Glasgow',        emoji: '🎭' },
  { name: 'Edinburgh',      emoji: '🏰' },
  { name: 'Leeds',          emoji: '🦉' },
  { name: 'Liverpool',      emoji: '⚽' },
  { name: 'Bristol',        emoji: '🌉' },
  { name: 'Cardiff',        emoji: '🐉' },
  { name: 'Belfast',        emoji: '☘️' },
  { name: 'Nottingham',     emoji: '🏹' },
  { name: 'Newcastle',      emoji: '⚫' },
  { name: 'Leicester',      emoji: '🦊' },
  { name: 'Sheffield',      emoji: '⚙️' },
  { name: 'Derby',          emoji: '🐏' },
  { name: 'Coventry',       emoji: '🕊️' },
  { name: 'Southampton',    emoji: '⚓' },
  { name: 'Portsmouth',     emoji: '🚢' },
  { name: 'Norwich',        emoji: '🐦' },
  { name: 'Brighton',       emoji: '🎠' },
  { name: 'Oxford',         emoji: '🎓' },
  { name: 'Cambridge',      emoji: '🚣' },
  { name: 'Exeter',         emoji: '🏛️' },
  { name: 'Plymouth',       emoji: '⛵' },
  { name: 'Hull',           emoji: '🐟' },
  { name: 'Middlesbrough',  emoji: '🏗️' },
  { name: 'Sunderland',     emoji: '🏟️' },
  { name: 'Bradford',       emoji: '🌺' },
  { name: 'Reading',        emoji: '📖' },
  { name: 'Milton Keynes',  emoji: '🦁' },
  { name: 'Bournemouth',    emoji: '🏖️' },
  { name: 'Ipswich',        emoji: '🌊' },
  { name: 'Stoke-on-Trent', emoji: '🏺' },
  { name: 'Wolverhampton',  emoji: '🐺' },
  { name: 'Swansea',        emoji: '🦢' },
  { name: 'Aberdeen',       emoji: '🪨' },
]

export async function generateStaticParams() {
  return CITIES.map(c => ({ city: encodeURIComponent(c.name) }))
}

export async function generateMetadata(
  { params }: { params: Promise<{ city: string }> }
): Promise<Metadata> {
  const { city } = await params
  const cityName = decodeURIComponent(city)
  return {
    title: `Events in ${cityName} | TheShowFinder`,
    description: `Find concerts, theatre, comedy, sports and family events in ${cityName}. Browse tickets for upcoming shows.`,
  }
}

export default async function CityPage({ params }: { params: Promise<{ city: string }> }) {
  const { city } = await params
  const cityName = decodeURIComponent(city)

  const cityConfig = CITIES.find(c => c.name === cityName)
  if (!cityConfig) notFound()

  const supabase = await createClient()
  const now = new Date().toISOString()
  const weekAhead = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()

  const [featuredResult, onsaleResult, allEventsResult] = await Promise.all([
    supabase
      .from('events_with_venue')
      .select('*')
      .eq('venue_city', cityName)
      .eq('is_featured', true)
      .gte('start_date', now)
      .order('start_date', { ascending: true })
      .limit(6) as unknown as Promise<{ data: EventWithVenue[] | null }>,

    supabase
      .from('events_with_venue')
      .select('*')
      .eq('venue_city', cityName)
      .gte('onsale_date', now)
      .lte('onsale_date', weekAhead)
      .gte('start_date', now)
      .order('onsale_date', { ascending: true })
      .limit(6) as unknown as Promise<{ data: EventWithVenue[] | null }>,

    supabase
      .from('events_with_venue')
      .select('*', { count: 'exact' })
      .eq('venue_city', cityName)
      .gte('start_date', now)
      .order('start_date', { ascending: true })
      .limit(24) as unknown as Promise<{ data: EventWithVenue[] | null; count: number | null }>,
  ])

  const featuredEvents = featuredResult.data ?? []
  const onsaleEvents   = onsaleResult.data ?? []
  const allEvents      = allEventsResult.data ?? []
  const totalCount     = allEventsResult.count ?? allEvents.length

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#F5F5F0' }}>

      {/* ── HERO ── */}
      <div className="py-14 px-4 sm:px-6 lg:px-8" style={{ backgroundColor: '#1A1A2E' }}>
        <div className="max-w-7xl mx-auto">
          <p className="text-5xl mb-4 select-none">{cityConfig.emoji}</p>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-white mb-2">
            Events in {cityName}
          </h1>
          <p className="text-white/50 text-sm mb-8">
            {totalCount > 0
              ? `${totalCount}+ upcoming show${totalCount !== 1 ? 's' : ''}`
              : 'Browse upcoming shows'}
          </p>
          <Suspense>
            <SearchBar />
          </Suspense>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-14">

        {/* ── FEATURED EVENTS ── */}
        {featuredEvents.length > 0 && (
          <section>
            <div className="flex items-end justify-between mb-7">
              <div>
                <p className="font-bold text-xs uppercase tracking-widest mb-1" style={{ color: '#E8003D' }}>
                  Don&apos;t miss out
                </p>
                <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900">
                  Featured Events in {cityName}
                </h2>
              </div>
              <Link
                href={`/events?city=${encodeURIComponent(cityName)}`}
                className="text-sm font-semibold hover:underline hidden sm:block"
                style={{ color: '#E8003D' }}
              >
                View all →
              </Link>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {featuredEvents.map(event => (
                <EventCard key={event.id} event={event} />
              ))}
            </div>
          </section>
        )}

        {/* ── ON SALE THIS WEEK ── */}
        {onsaleEvents.length > 0 && (
          <section>
            <div className="flex items-end justify-between mb-7">
              <div>
                <p className="font-bold text-xs uppercase tracking-widest mb-1" style={{ color: '#026CDF' }}>
                  Tickets just released
                </p>
                <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900">
                  On Sale This Week in {cityName}
                </h2>
              </div>
              <Link
                href="/on-sale-this-week"
                className="text-sm font-semibold hover:underline hidden sm:block"
                style={{ color: '#026CDF' }}
              >
                View all →
              </Link>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {onsaleEvents.map(event => (
                <ArtistOnSaleCard
                  key={event.id}
                  name={event.title}
                  slug=""
                  href={`/events/${event.slug}`}
                  image_url={event.image_url}
                  tour_name={null}
                  onsale_date={event.onsale_date}
                  dates_count={0}
                />
              ))}
            </div>
          </section>
        )}

        {/* ── ALL EVENTS ── */}
        <section>
          <div className="flex items-end justify-between mb-7">
            <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900">
              All Events in {cityName}
            </h2>
            <Link
              href={`/events?city=${encodeURIComponent(cityName)}`}
              className="text-sm font-semibold hover:underline hidden sm:block text-slate-500 hover:text-slate-700"
            >
              View all →
            </Link>
          </div>

          {allEvents.length === 0 ? (
            <div className="text-center py-24 bg-white rounded-2xl border border-slate-200">
              <p className="text-6xl mb-4">🎭</p>
              <h3 className="text-xl font-semibold text-slate-700 mb-2">No events yet</h3>
              <p className="text-slate-500 mb-6">Check back soon — we update daily.</p>
              <Link href="/events" className="text-sm font-semibold hover:underline" style={{ color: '#E8003D' }}>
                Browse all UK events →
              </Link>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {allEvents.map(event => (
                  <EventCard key={event.id} event={event} />
                ))}
              </div>
              {totalCount > 24 && (
                <div className="mt-10 text-center">
                  <Link
                    href={`/events?city=${encodeURIComponent(cityName)}`}
                    className="inline-block font-bold text-white px-8 py-3.5 rounded-xl hover:opacity-90 transition-opacity"
                    style={{ backgroundColor: '#E8003D' }}
                  >
                    View all {totalCount}+ events in {cityName}
                  </Link>
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  )
}
