export const dynamic = 'force-dynamic'

import { Suspense } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import EventCard from '@/components/EventCard'
import ArtistOnSaleCard from '@/components/ArtistOnSaleCard'
import SearchBar from '@/components/SearchBar'
import CitiesGrid from '@/components/CitiesGrid'
import CategoryStrip from '@/components/CategoryStrip'
import NewsletterSignup from '@/components/NewsletterSignup'
import type { EventWithVenue, Artist } from '@/lib/types/database'

async function FeaturedEvents() {
  const supabase = await createClient()
  const now = new Date().toISOString()

  let { data: events } = await supabase
    .from('events_with_venue')
    .select('*')
    .eq('is_featured', true)
    .gte('start_date', now)
    .order('start_date', { ascending: true })
    .limit(6)

  // Fall back to upcoming events with good images when no featured events are future-dated
  if (!events?.length) {
    const { data: fallback } = await supabase
      .from('events_with_venue')
      .select('*')
      .gte('start_date', now)
      .like('image_url', '%TABLET_LANDSCAPE_16_9%')
      .not('image_url', 'like', '%LARGE%')
      .order('start_date', { ascending: true })
      .limit(6)
    events = fallback
  }

  if (!events?.length) {
    return (
      <div className="text-center py-16">
        <p className="text-5xl mb-4">🎭</p>
        <p className="text-slate-500">Seeding the database — check back shortly!</p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
      {(events as EventWithVenue[]).map(event => (
        <EventCard key={event.id} event={event} />
      ))}
    </div>
  )
}

function fmtCount(n: number): string {
  if (n >= 10000) return `${(Math.floor(n / 1000) * 1000).toLocaleString('en-GB')}+`
  if (n >= 1000)  return `${(Math.floor(n / 100)  * 100 ).toLocaleString('en-GB')}+`
  return `${n}+`
}

async function HomepageStats() {
  const supabase = await createClient()
  const now = new Date().toISOString()

  const [{ count: eventCount }, { count: venueCount }] = await Promise.all([
    supabase.from('events').select('*', { count: 'exact', head: true })
      .gte('start_date', now)
      .in('status', ['upcoming', 'on_sale']),
    supabase.from('venues').select('*', { count: 'exact', head: true }),
  ])

  const venueResult = await supabase.from('venues').select('city') as unknown as { data: { city: string }[] | null }
  const cityCount = new Set((venueResult.data ?? []).map(r => r.city)).size

  const stats = [
    { value: fmtCount(eventCount ?? 0), label: 'Events listed'     },
    { value: fmtCount(venueCount ?? 0), label: 'Venues'            },
    { value: `${cityCount}+`,           label: 'UK cities covered'  },
    { value: '1M+',                     label: 'Tickets found'      },
  ]

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
      {stats.map(({ value, label }) => (
        <div key={label}>
          <div className="text-3xl sm:text-4xl font-extrabold mb-1" style={{ color: '#FFD700' }}>{value}</div>
          <div className="text-white/60 text-sm">{label}</div>
        </div>
      ))}
    </div>
  )
}

async function OnSaleThisWeek() {
  const supabase = await createClient()
  const now = new Date()
  const weekAhead = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)

  const [eventsResult, artistsResult] = await Promise.all([
    supabase
      .from('events_with_venue')
      .select('*')
      .gte('onsale_date', now.toISOString())
      .lte('onsale_date', weekAhead.toISOString())
      .gte('start_date', now.toISOString())
      .order('onsale_date', { ascending: true })
      .limit(6) as unknown as Promise<{ data: EventWithVenue[] | null }>,
    supabase
      .from('artists')
      .select('*')
      .eq('featured_onsale', true)
      .gte('onsale_date', now.toISOString())
      .lte('onsale_date', weekAhead.toISOString())
      .order('onsale_date', { ascending: true }) as unknown as Promise<{ data: Artist[] | null }>,
  ])

  const seen = new Set<string>()
  const events = (eventsResult.data ?? []).filter(e => !seen.has(e.id) && seen.add(e.id))
  const featuredArtists = artistsResult.data ?? []

  // Fetch tour date counts for featured artists
  const artistDateCounts: Record<string, number> = {}
  if (featuredArtists.length) {
    const { data: tours } = await supabase
      .from('tours')
      .select('id, artist_id')
      .in('artist_id', featuredArtists.map(a => a.id)) as unknown as { data: { id: string; artist_id: string }[] | null }

    if (tours?.length) {
      const { data: tourDates } = await supabase
        .from('tour_dates')
        .select('tour_id')
        .in('tour_id', tours.map(t => t.id))
        .gte('date', now.toISOString()) as unknown as { data: { tour_id: string }[] | null }

      const tourToArtist = Object.fromEntries((tours ?? []).map(t => [t.id, t.artist_id]))
      for (const d of tourDates ?? []) {
        const aId = tourToArtist[d.tour_id]
        if (aId) artistDateCounts[aId] = (artistDateCounts[aId] ?? 0) + 1
      }
    }
  }

  if (!events.length && !featuredArtists.length) return null

  return (
    <section className="bg-white py-14 border-t border-slate-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-end justify-between mb-7">
          <div>
            <p className="font-bold text-xs uppercase tracking-widest mb-1" style={{ color: '#026CDF' }}>
              Tickets just released
            </p>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900">On Sale This Week</h2>
          </div>
          <Link href="/on-sale-this-week" className="text-sm font-semibold hover:underline hidden sm:block" style={{ color: '#026CDF' }}>
            View all →
          </Link>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {featuredArtists.map(artist => (
            <ArtistOnSaleCard
              key={artist.id}
              name={artist.name}
              slug={artist.slug}
              image_url={artist.image_url}
              tour_name={artist.tour_name}
              onsale_date={artist.onsale_date}
              dates_count={artistDateCounts[artist.id] ?? 0}
            />
          ))}
          {events.map(event => (
            <EventCard key={event.id} event={event} />
          ))}
        </div>
        <div className="mt-8 text-center sm:hidden">
          <Link href="/on-sale-this-week" className="inline-block text-sm font-semibold hover:underline" style={{ color: '#026CDF' }}>
            View all →
          </Link>
        </div>
      </div>
    </section>
  )
}

const EventCardSkeleton = () => (
  <div className="rounded-2xl overflow-hidden bg-white border border-slate-200 shadow-sm">
    <div className="h-48 bg-slate-200 animate-pulse" />
    <div className="p-4 space-y-3">
      <div className="h-3 w-16 bg-slate-200 rounded-full animate-pulse" />
      <div className="h-5 w-4/5 bg-slate-200 rounded animate-pulse" />
      <div className="h-4 w-3/5 bg-slate-200 rounded animate-pulse" />
      <div className="h-10 bg-slate-200 rounded-xl animate-pulse mt-4" />
    </div>
  </div>
)

export default function HomePage() {
  return (
    <>
      {/* ── HERO ────────────────────────────────────────────────── */}
      <section
        className="relative overflow-hidden flex flex-col items-center justify-center text-white min-h-[60vh] md:min-h-screen"
        style={{ backgroundColor: '#1A1A2E' }}
      >

        {/* Decorative blobs */}
        <div
          className="absolute top-0 right-0 w-[500px] h-[500px] rounded-full -translate-y-1/2 translate-x-1/3 blur-3xl pointer-events-none"
          style={{ backgroundColor: 'rgba(232,0,61,0.15)' }}
        />
        <div className="absolute bottom-0 left-0 w-80 h-80 rounded-full bg-white/5 translate-y-1/2 -translate-x-1/4 blur-3xl pointer-events-none" />

        <div className="relative w-full max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-20 md:py-0 text-center z-10">
          {/* Pre-headline */}
          <p className="inline-flex items-center gap-2 font-bold text-sm uppercase tracking-widest mb-6 bg-white/5 px-4 py-2 rounded-full border border-white/10"
            style={{ color: '#FFD700' }}>
            🎟️ The UK&apos;s events discovery platform
          </p>

          {/* Headline */}
          <h1 className="text-5xl sm:text-6xl md:text-7xl font-extrabold tracking-tight leading-[1.05] mb-6 text-white">
            Find Your Next<br />
            <span style={{ color: '#FFD700' }}>Unforgettable</span> Show
          </h1>

          <p className="text-xl text-white/70 mb-10 max-w-xl mx-auto leading-relaxed">
            Concerts, theatre, comedy, sports and family events — all across the UK in one place.
          </p>

          {/* Search bar */}
          <div className="flex justify-center">
            <Suspense>
              <SearchBar />
            </Suspense>
          </div>

          {/* Trust row */}
          <div className="mt-8 flex flex-wrap justify-center gap-6 text-sm text-white/50">
            <span>✓ Free to use</span>
            <span>✓ Updated daily</span>
            <span>✓ 50+ UK cities</span>
          </div>
        </div>
      </section>

      {/* ── UK CITIES ───────────────────────────────────────────── */}
      <section className="bg-slate-900 py-14">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-end justify-between mb-7">
            <div>
              <p className="font-bold text-xs uppercase tracking-widest mb-1" style={{ color: '#FFD700' }}>
                Browse by location
              </p>
              <h2 className="text-2xl sm:text-3xl font-extrabold text-white">Events near you</h2>
            </div>
            <Link href="/events" className="text-sm font-semibold text-white/60 hover:text-white transition-colors hidden sm:block">
              All cities →
            </Link>
          </div>
          <Suspense fallback={
            <div className="flex gap-4 overflow-x-auto pb-2 md:grid md:grid-cols-4 md:gap-5">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="flex-none w-44 md:w-auto h-36 md:h-48 rounded-2xl bg-white/10 animate-pulse" />
              ))}
            </div>
          }>
            <CitiesGrid />
          </Suspense>
        </div>
      </section>

      {/* ── CATEGORY STRIP ──────────────────────────────────────── */}
      <section className="bg-[#F5F5F0] border-y border-slate-200 py-5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <Suspense>
            <CategoryStrip />
          </Suspense>
        </div>
      </section>

      {/* ── FEATURED EVENTS ─────────────────────────────────────── */}
      <section className="bg-[#F5F5F0] py-14">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-end justify-between mb-7">
            <div>
              <p className="font-bold text-xs uppercase tracking-widest mb-1" style={{ color: '#E8003D' }}>
                Don&apos;t miss out
              </p>
              <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900">Featured Shows</h2>
            </div>
            <Link href="/events" className="text-sm font-semibold hover:underline hidden sm:block" style={{ color: '#E8003D' }}>
              View all →
            </Link>
          </div>

          <Suspense fallback={
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {Array.from({ length: 6 }).map((_, i) => <EventCardSkeleton key={i} />)}
            </div>
          }>
            <FeaturedEvents />
          </Suspense>

          <div className="mt-8 text-center sm:hidden">
            <Link href="/events" className="inline-block text-sm font-semibold hover:underline" style={{ color: '#E8003D' }}>
              View all events →
            </Link>
          </div>
        </div>
      </section>

      {/* ── ON SALE THIS WEEK ───────────────────────────────────── */}
      <Suspense fallback={null}>
        <OnSaleThisWeek />
      </Suspense>

      {/* ── NEWSLETTER ──────────────────────────────────────────── */}
      <NewsletterSignup />

      {/* ── STATS BAND ──────────────────────────────────────────── */}
      <section className="py-14" style={{ backgroundColor: '#1A1A2E' }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <Suspense fallback={
            <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i}>
                  <div className="h-10 w-24 mx-auto bg-white/10 rounded animate-pulse mb-1" />
                  <div className="h-4 w-20 mx-auto bg-white/10 rounded animate-pulse" />
                </div>
              ))}
            </div>
          }>
            <HomepageStats />
          </Suspense>
        </div>
      </section>
    </>
  )
}
