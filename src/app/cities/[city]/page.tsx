export const revalidate = 3600

import { notFound } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import EventCard from '@/components/EventCard'
import SearchBar from '@/components/SearchBar'
import { Suspense } from 'react'
import type { EventWithVenue, Artist } from '@/lib/types/database'
import { groupEventsByArtist, fmtOnSaleLabel } from '@/lib/on-sale'

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

// Pick up to 6 events with venue-capacity priority and category variety
function pickFeaturedEvents(
  pool: EventWithVenue[],
  capacityMap: Record<string, number>,
): EventWithVenue[] {
  const sorted = [...pool].sort((a, b) => {
    const aLarge = (capacityMap[a.venue_id] ?? 0) > 5000 ? 1 : 0
    const bLarge = (capacityMap[b.venue_id] ?? 0) > 5000 ? 1 : 0
    if (aLarge !== bLarge) return bLarge - aLarge
    return a.start_date.localeCompare(b.start_date)
  })

  const catCount: Record<string, number> = {}
  const picked: EventWithVenue[] = []
  for (const ev of sorted) {
    if ((catCount[ev.category] ?? 0) >= 2) continue
    catCount[ev.category] = (catCount[ev.category] ?? 0) + 1
    picked.push(ev)
    if (picked.length >= 6) break
  }
  return picked
}

export default async function CityPage({ params }: { params: Promise<{ city: string }> }) {
  const { city } = await params
  const cityName = decodeURIComponent(city)

  const cityConfig = CITIES.find(c => c.name === cityName)
  if (!cityConfig) notFound()

  const supabase = await createClient()
  const now = new Date().toISOString()
  const weekAhead = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()

  const [featuredPoolResult, onsalePoolResult, allEventsResult, artistsResult] = await Promise.all([
    // Pool for featured section: upcoming events with images, limit 50
    supabase
      .from('events_with_venue')
      .select('*')
      .ilike('venue_city', cityName)
      .gte('start_date', now)
      .not('image_url', 'is', null)
      .order('start_date', { ascending: true })
      .limit(50) as unknown as Promise<{ data: EventWithVenue[] | null }>,

    // On sale this week — onsale_date in range only, no start_date restriction
    supabase
      .from('events_with_venue')
      .select('*')
      .ilike('venue_city', cityName)
      .gte('onsale_date', now)
      .lte('onsale_date', weekAhead)
      .order('onsale_date', { ascending: true })
      .limit(50) as unknown as Promise<{ data: EventWithVenue[] | null }>,

    // All events for listing section
    supabase
      .from('events_with_venue')
      .select('*', { count: 'exact' })
      .ilike('venue_city', cityName)
      .gte('start_date', now)
      .order('start_date', { ascending: true })
      .limit(24) as unknown as Promise<{ data: EventWithVenue[] | null; count: number | null }>,

    // Artists for name matching
    supabase
      .from('artists')
      .select('*') as unknown as Promise<{ data: Artist[] | null }>,
  ])

  const featuredPool = featuredPoolResult.data ?? []
  const onsalePool   = onsalePoolResult.data ?? []
  const allEvents    = allEventsResult.data ?? []
  const totalCount   = allEventsResult.count ?? allEvents.length

  // Group on-sale events by artist, limit 6 cards
  const onsaleGroups = groupEventsByArtist(onsalePool, artistsResult.data ?? []).slice(0, 6)

  // Fetch venue capacities for the featured pool
  let topEvents: EventWithVenue[] = []
  if (featuredPool.length > 0) {
    const venueIds = [...new Set(featuredPool.map(e => e.venue_id))]
    const db = createAdminClient()
    const { data: venues } = await db
      .from('venues')
      .select('id, capacity')
      .in('id', venueIds) as unknown as { data: { id: string; capacity: number | null }[] | null }

    const capacityMap: Record<string, number> = {}
    for (const v of venues ?? []) {
      if (v.capacity) capacityMap[v.id] = v.capacity
    }
    topEvents = pickFeaturedEvents(featuredPool, capacityMap)
  }

  const topIsFeatured = topEvents.some(e => e.is_featured)

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

        {/* ── FEATURED / UPCOMING EVENTS ── */}
        {topEvents.length > 0 && (
          <section>
            <div className="flex items-end justify-between mb-7">
              <div>
                <p className="font-bold text-xs uppercase tracking-widest mb-1" style={{ color: '#E8003D' }}>
                  {topIsFeatured ? "Don't miss out" : 'Coming up'}
                </p>
                <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900">
                  {topIsFeatured ? `Featured Events in ${cityName}` : `Upcoming Shows in ${cityName}`}
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
              {topEvents.map(event => (
                <EventCard key={event.id} event={event} />
              ))}
            </div>
          </section>
        )}

        {/* ── ON SALE THIS WEEK ── */}
        {onsaleGroups.length > 0 && (
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
              {onsaleGroups.map(group => (
                <Link
                  key={group.slug}
                  href={`/on-sale-this-week/${group.slug}`}
                  className="group block rounded-2xl overflow-hidden bg-white border border-slate-200 shadow-sm hover:shadow-lg transition-all duration-200 hover:-translate-y-0.5"
                >
                  <div className="relative h-48 overflow-hidden bg-slate-900">
                    {group.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={group.image_url} alt={group.artistName}
                        className="w-full h-full object-cover object-top group-hover:scale-105 transition-transform duration-300" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #1A1A2E, #E8003D)' }}>
                        <span className="text-5xl">🎤</span>
                      </div>
                    )}
                    <div className="absolute top-3 left-3">
                      <span className="text-xs font-bold uppercase tracking-wider text-white px-2.5 py-1 rounded-full" style={{ backgroundColor: '#026CDF' }}>
                        On Sale This Week
                      </span>
                    </div>
                  </div>
                  <div className="p-4">
                    <p className="text-xs font-semibold text-slate-500 mb-1 uppercase tracking-wide">
                      {group.dbArtist?.tour_name ?? 'Live Tour'}
                    </p>
                    <h3 className="font-extrabold text-slate-900 text-lg leading-tight mb-2 group-hover:text-red-600 transition-colors">
                      {group.artistName}
                    </h3>
                    <p className="text-sm text-slate-500 mb-3">
                      🗓 {group.events.length} UK date{group.events.length !== 1 ? 's' : ''}
                    </p>
                    <div className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg bg-slate-100 text-slate-700">
                      🎟️ On sale {fmtOnSaleLabel(group.onsale_date)}
                    </div>
                  </div>
                </Link>
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
