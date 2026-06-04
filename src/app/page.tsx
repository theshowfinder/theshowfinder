export const revalidate = 3600

import { Suspense } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import EventCard from '@/components/EventCard'
import SearchBar from '@/components/SearchBar'
import CitiesGrid from '@/components/CitiesGrid'
import NewsletterSignup from '@/components/NewsletterSignup'
import type { EventWithVenue, Artist } from '@/lib/types/database'
import { groupEventsByArtist, fmtOnSaleLabel } from '@/lib/on-sale'

async function FeaturedEvents() {
  const supabase = await createClient()
  const now = new Date().toISOString()

  const result = await supabase
    .from('events_with_venue')
    .select('*')
    .gte('start_date', now)
    .not('image_url', 'is', null)
    .order('start_date', { ascending: true })
    .limit(50) as unknown as { data: EventWithVenue[] | null }

  const seen = new Set<string>()
  const deduped: EventWithVenue[] = []
  for (const event of (result.data ?? [])) {
    if (!seen.has(event.title)) {
      seen.add(event.title)
      deduped.push(event)
    }
  }

  const pool = [...deduped]
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[pool[i], pool[j]] = [pool[j], pool[i]]
  }
  const events = pool.slice(0, 8)

  if (!events.length) {
    return (
      <div className="text-center py-16">
        <p className="text-5xl mb-4">🎭</p>
        <p className="text-slate-500">Seeding the database — check back shortly!</p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
      {events.map(event => (
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

  const stats = [
    { value: fmtCount(eventCount ?? 0), label: 'Events listed' },
    { value: fmtCount(venueCount ?? 0), label: 'Venues'        },
    { value: '36',                       label: 'UK cities'     },
    { value: '1M+',                      label: 'Tickets found' },
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
  const supabase  = await createClient()
  const now       = new Date()
  const nowISO    = now.toISOString()
  const sevenISO  = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString()

  // public_onsale_start does not exist in this DB; onsale_date is the public sale date
  const dateField = 'onsale_date'
  console.log(`[OnSaleThisWeek] date field: ${dateField} | range: ${nowISO} → ${sevenISO}`)

  const [evResult, arResult] = await Promise.all([
    supabase
      .from('events_with_venue')
      .select('*')
      .gte('onsale_date', nowISO)
      .lte('onsale_date', sevenISO)
      .order('onsale_date', { ascending: true })
      .limit(500) as unknown as Promise<{ data: EventWithVenue[] | null }>,
    supabase
      .from('artists')
      .select('*') as unknown as Promise<{ data: Artist[] | null }>,
  ])

  const rawCount = (evResult.data ?? []).length

  // Deduplicate by title, keep earliest start_date
  const sorted = (evResult.data ?? []).slice().sort((a, b) => a.start_date.localeCompare(b.start_date))
  const seen = new Set<string>()
  const deduped: EventWithVenue[] = []
  for (const event of sorted) {
    if (!seen.has(event.title)) {
      seen.add(event.title)
      deduped.push(event)
    }
  }

  const allGroups = groupEventsByArtist(deduped, arResult.data ?? [])
  console.log(`[OnSaleThisWeek] ${rawCount} raw events → ${deduped.length} unique titles → ${allGroups.length} artist groups`)

  const groups   = allGroups.slice(0, 12)
  const overflow = allGroups.length > 12 ? allGroups.length : 0

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
          {overflow > 0 && (
            <Link href="/on-sale-this-week" className="text-sm font-semibold hover:underline hidden sm:block" style={{ color: '#026CDF' }}>
              View all {allGroups.length} →
            </Link>
          )}
        </div>

        {groups.length === 0 ? (
          <p className="text-slate-500 text-sm py-4">
            No major tickets going on sale this week — check back soon.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {groups.map(group => (
                <Link
                  key={group.slug}
                  href={`/on-sale-this-week/${group.slug}`}
                  className="group block rounded-2xl overflow-hidden bg-white border border-slate-200 shadow-sm hover:shadow-lg transition-all duration-200 hover:-translate-y-0.5"
                >
                  <div className="relative h-48 overflow-hidden bg-slate-900">
                    {group.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={group.image_url}
                        alt={group.artistName}
                        className="w-full h-full object-cover object-top group-hover:scale-105 transition-transform duration-300"
                      />
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
                    {group.events.length > 0 && (
                      <p className="text-sm text-slate-500 mb-3">
                        🗓 {group.events.length} UK date{group.events.length !== 1 ? 's' : ''}
                      </p>
                    )}
                    <div className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg bg-slate-100 text-slate-700">
                      🎟️ On sale {fmtOnSaleLabel(group.onsale_date)}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
            {overflow > 0 && (
              <div className="mt-10 text-center">
                <Link
                  href="/on-sale-this-week"
                  className="inline-block font-bold px-8 py-3.5 rounded-xl text-sm hover:opacity-90 transition-opacity text-white"
                  style={{ backgroundColor: '#026CDF' }}
                >
                  View all {allGroups.length} artists on sale this week →
                </Link>
              </div>
            )}
          </>
        )}
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
        {/* Background image */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/heroshowfinder.png"
          alt=""
          className="absolute inset-0 w-full h-full object-cover object-center pointer-events-none select-none"
        />
        {/* Dark overlay */}
        <div className="absolute inset-0 pointer-events-none" style={{ backgroundColor: 'rgba(0,0,0,0.55)' }} />

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

      {/* ── ON SALE THIS WEEK ───────────────────────────────────── */}
      <Suspense fallback={null}>
        <OnSaleThisWeek />
      </Suspense>

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
