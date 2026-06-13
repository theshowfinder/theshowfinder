export const revalidate = 3600

import { notFound } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import EventCard from '@/components/EventCard'
import SearchBar from '@/components/SearchBar'
import Pagination from '@/components/Pagination'
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
  const cityName  = decodeURIComponent(city)
  const canonical = `https://www.theshowfinder.com/cities/${encodeURIComponent(cityName)}`
  const title     = `Concerts & Live Events in ${cityName}`
  const desc      = `Find upcoming concerts, theatre, comedy and live events in ${cityName}. Compare ticket prices from all major providers.`
  return {
    title,
    description: desc,
    alternates:  { canonical },
    openGraph:   { title, description: desc, url: canonical },
  }
}

// Pick up to 4 events sorted by venue capacity descending (biggest venues first).
// Uses venue_capacity from the events_with_venue view (populated by migration_014).
// Falls back to onsale_date descending for events at venues with no capacity set.
function pickFeaturedEvents(pool: EventWithVenue[]): EventWithVenue[] {
  const sorted = [...pool].sort((a, b) => {
    const aCap = a.venue_capacity ?? 0
    const bCap = b.venue_capacity ?? 0
    if (bCap !== aCap) return bCap - aCap
    return (b.onsale_date ?? '').localeCompare(a.onsale_date ?? '')
  })

  const seen = new Set<string>()
  const picked: EventWithVenue[] = []
  for (const ev of sorted) {
    if (seen.has(ev.title)) continue
    seen.add(ev.title)
    picked.push(ev)
    if (picked.length >= 4) break
  }
  return picked
}

const PAGE_SIZE = 24

export default async function CityPage({
  params,
  searchParams,
}: {
  params: Promise<{ city: string }>
  searchParams: Promise<{ page?: string }>
}) {
  const { city } = await params
  const { page: pageParam } = await searchParams
  const cityName = decodeURIComponent(city)
  const page     = Math.max(1, Number(pageParam ?? 1))

  const cityConfig = CITIES.find(c => c.name === cityName)
  if (!cityConfig) notFound()

  const supabase     = await createClient()
  const now          = new Date()
  const nowISO       = now.toISOString()
  const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString()
  const weekAhead    = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString()

  const from = (page - 1) * PAGE_SIZE
  const to   = from + PAGE_SIZE - 1

  const [featuredPoolResult, onsalePoolResult, allEventsResult, artistsResult, venuesResult, venueCountResult] = await Promise.all([
    // Pool for featured section: upcoming events with images, limit 50 (page 1 only)
    page === 1
      ? supabase
          .from('events_with_venue')
          .select('*')
          .ilike('venue_city', cityName)
          .gte('start_date', nowISO)
          .not('image_url', 'is', null)
          .order('start_date', { ascending: true })
          .limit(50) as unknown as Promise<{ data: EventWithVenue[] | null }>
      : Promise.resolve({ data: [] as EventWithVenue[] }),

    // On sale this week (page 1 only)
    page === 1
      ? supabase
          .from('events_with_venue')
          .select('*')
          .ilike('venue_city', cityName)
          .gte('onsale_date', threeDaysAgo)
          .lte('onsale_date', weekAhead)
          .order('onsale_date', { ascending: true })
          .limit(50) as unknown as Promise<{ data: EventWithVenue[] | null }>
      : Promise.resolve({ data: [] as EventWithVenue[] }),

    // All events for listing section — paginated
    supabase
      .from('events_with_venue')
      .select('*', { count: 'exact' })
      .ilike('venue_city', cityName)
      .gte('start_date', nowISO)
      .order('start_date', { ascending: true })
      .range(from, to) as unknown as Promise<{ data: EventWithVenue[] | null; count: number | null }>,

    // Artists for name matching (page 1 only)
    page === 1
      ? supabase.from('artists').select('*') as unknown as Promise<{ data: Artist[] | null }>
      : Promise.resolve({ data: [] as Artist[] }),

    // Venues in this city sorted by capacity (page 1 only)
    page === 1
      ? supabase
          .from('venues')
          .select('id, name, slug, capacity, address')
          .ilike('city', cityName)
          .order('capacity', { ascending: false, nullsFirst: false })
          .limit(20) as unknown as Promise<{ data: { id: string; name: string; slug: string; capacity: number | null; address: string }[] | null }>
      : Promise.resolve({ data: [] as { id: string; name: string; slug: string; capacity: number | null; address: string }[] }),

    // Upcoming event venue_ids for this city — to count events per venue (page 1 only)
    page === 1
      ? supabase
          .from('events_with_venue')
          .select('venue_id')
          .ilike('venue_city', cityName)
          .gte('start_date', nowISO)
          .limit(2000) as unknown as Promise<{ data: { venue_id: string }[] | null }>
      : Promise.resolve({ data: [] as { venue_id: string }[] }),
  ])

  const featuredPool = featuredPoolResult.data ?? []
  const onsalePool   = onsalePoolResult.data ?? []
  const allEvents    = allEventsResult.data ?? []
  const totalCount   = allEventsResult.count ?? allEvents.length
  const totalPages   = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))

  function buildHref(p: number) {
    if (p === 1) return `/cities/${encodeURIComponent(cityName)}`
    return `/cities/${encodeURIComponent(cityName)}?page=${p}`
  }

  // Group on-sale events by artist, limit 6 cards
  const onsaleGroups = groupEventsByArtist(onsalePool, artistsResult.data ?? []).slice(0, 6)

  // venue_capacity comes directly from the events_with_venue view (migration_014)
  const topEvents = pickFeaturedEvents(featuredPool)
  const topIsFeatured = topEvents.some(e => e.is_featured)

  // Build venue event count map and filter to venues with upcoming events
  const countByVenue: Record<string, number> = {}
  for (const { venue_id } of (venueCountResult.data ?? [])) {
    countByVenue[venue_id] = (countByVenue[venue_id] ?? 0) + 1
  }
  const cityVenues = (venuesResult.data ?? []).filter(v => countByVenue[v.id] > 0)

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

        {/* ── FEATURED / UPCOMING EVENTS (page 1 only) ── */}
        {page === 1 && topEvents.length > 0 && (
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
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {topEvents.map(event => (
                <EventCard key={event.id} event={event} />
              ))}
            </div>
          </section>
        )}

        {/* ── ON SALE THIS WEEK (page 1 only) ── */}
        {page === 1 && onsaleGroups.length > 0 && (
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
            <div>
              <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900">
                All Events in {cityName}
              </h2>
              {totalCount > 0 && (
                <p className="text-sm text-slate-500 mt-1">
                  {totalCount} upcoming show{totalCount !== 1 ? 's' : ''}
                  {totalPages > 1 && ` — page ${page} of ${totalPages}`}
                </p>
              )}
            </div>
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
              <Pagination currentPage={page} totalPages={totalPages} buildHref={buildHref} />
            </>
          )}
        </section>

        {/* ── VENUES (page 1 only) ── */}
        {page === 1 && cityVenues.length > 0 && (
          <section>
            <div className="flex items-end justify-between mb-7">
              <div>
                <p className="font-bold text-xs uppercase tracking-widest mb-1" style={{ color: '#026CDF' }}>
                  Where to go
                </p>
                <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900">
                  Venues in {cityName}
                </h2>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
              {cityVenues.map(venue => (
                <Link
                  key={venue.id}
                  href={`/venues/${venue.slug}`}
                  className="block bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 p-5"
                >
                  <h3 className="font-bold text-slate-900 text-base leading-snug mb-1 hover:text-red-600 transition-colors">
                    {venue.name}
                  </h3>
                  <p className="text-sm text-slate-500 mb-3 truncate">{venue.address}</p>
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    {venue.capacity ? (
                      <span>🎪 {venue.capacity.toLocaleString('en-GB')} capacity</span>
                    ) : (
                      <span />
                    )}
                    <span className="font-semibold text-slate-600">
                      {countByVenue[venue.id] ?? 0} event{(countByVenue[venue.id] ?? 0) !== 1 ? 's' : ''}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

      </div>
    </div>
  )
}
