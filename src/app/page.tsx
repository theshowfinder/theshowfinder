export const revalidate = 3600

import { fetchAllArtists } from '@/lib/allArtists'
import type { Metadata } from 'next'
import { Suspense } from 'react'
import Link from 'next/link'
import { createPublicClient } from '@/lib/supabase/public'

const HOME_OG_DESCRIPTION = 'Discover concerts, theatre, comedy and live events across the UK and find tickets from official sellers.'
const HOME_OG_IMAGE = 'https://www.theshowfinder.com/og-image.png'

export const metadata: Metadata = {
  title: { absolute: 'TheShowFinder | Find Concerts & Live Events in the UK' },
  description: HOME_OG_DESCRIPTION,
  alternates: { canonical: 'https://www.theshowfinder.com' },
  openGraph: {
    title:       'TheShowFinder | Find Concerts & Live Events in the UK',
    description: HOME_OG_DESCRIPTION,
    url:         'https://www.theshowfinder.com',
    images:      [{ url: HOME_OG_IMAGE, width: 1200, height: 630, alt: 'TheShowFinder — Find Your Next Unforgettable Show' }],
  },
  twitter: {
    card:        'summary_large_image',
    title:       'TheShowFinder | Find Concerts & Live Events in the UK',
    description: HOME_OG_DESCRIPTION,
    images:      [HOME_OG_IMAGE],
  },
}
import EventCard from '@/components/EventCard'
import SearchBar from '@/components/SearchBar'
import CitiesGrid from '@/components/CitiesGrid'
import NewsletterSignup from '@/components/NewsletterSignup'
import LocationBanner from '@/components/LocationBanner'
import LocalSpotlight from '@/components/LocalSpotlight'
import LocalHeroCopy from '@/components/LocalHeroCopy'
import CategoryStrip from '@/components/CategoryStrip'
import WestEndStrip from '@/components/WestEndStrip'
import HeadlineNews from '@/components/HeadlineNews'
import type { EventWithVenue } from '@/lib/types/database'
import { saleBadgeText, groupDateCount } from '@/lib/on-sale'
import { fetchEventsThisWeek, fetchOnSaleThisWeek, attachTourDateCounts, LIVE_EVENT_STATUSES } from '@/lib/eventPools'
import { listedEventsCount, dropDuplicateEvents } from '@/lib/listedEvents'
import { CITIES } from '@/lib/cities'
import { pickFeaturedShows } from '@/lib/featuredShows'
import ScrollRail from '@/components/ScrollRail'
import OnSaleMosaic, { type OnSaleMosaicTile } from '@/components/OnSaleMosaic'
import { pickOnSaleMosaic } from '@/lib/onSaleMosaic'
import { londonDayWithYear } from '@/lib/cityBrief'
import { eventImageUrl, artistPhotoUrl } from '@/lib/eventImages'
import { venueLabel } from '@/lib/displayTitle'

type FeaturedQueryResult = { data: EventWithVenue[] | null; error: { message: string } | null }

function HomeSectionSkeleton() {
  return (
    <div className="min-h-[260px] py-10" aria-hidden="true">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="h-4 w-36 rounded bg-slate-200/70 animate-pulse mb-3" />
        <div className="h-8 w-64 rounded bg-slate-200/70 animate-pulse mb-7" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-36 rounded-2xl bg-slate-200/60 animate-pulse" />
          ))}
        </div>
      </div>
    </div>
  )
}

async function queryFeaturedEvents(supabase: ReturnType<typeof createPublicClient>, now: string): Promise<FeaturedQueryResult> {
  try {
    // Candidate pool: shows in the next 60 days at larger venues (the de-duplicated
    // listed view, filtered to capacity so this stays a cheap, indexed read).
    // pickFeaturedShows (src/lib/featuredShows.ts) then applies the curation rules:
    // no attractions, packages or class listings; one card per venue; a category mix.
    const horizon = new Date(Date.parse(now) + 60 * 24 * 60 * 60 * 1000).toISOString()
    const base = () => supabase
      .from('listed_events_with_venue')
      .select('*')
      .gte('start_date', now)
      .lte('start_date', horizon)
      .in('status', LIVE_EVENT_STATUSES)
      .order('start_date', { ascending: true })
      .limit(300)

    const { data, error } = await base().gte('venue_capacity', 1200) as unknown as FeaturedQueryResult
    if (error) return { data: null, error }
    let picked = pickFeaturedShows(data ?? [], FEATURED_COUNT)

    // Too few big-venue shows (quiet weeks): top up from any venue, same rules.
    if (picked.length < FEATURED_COUNT) {
      const { data: more, error: moreError } = await base().neq('category', 'family') as unknown as FeaturedQueryResult
      if (moreError) return { data: picked, error: null }
      const have = new Set(picked.map(e => e.id))
      const extra = pickFeaturedShows((more ?? []).filter(e => !have.has(e.id)), FEATURED_COUNT - picked.length)
      picked = [...picked, ...extra].sort((a, b) => a.start_date.localeCompare(b.start_date))
    }
    return { data: picked, error: null }
  } catch (err) {
    return { data: null, error: { message: err instanceof Error ? err.message : 'unknown error' } }
  }
}

const FEATURED_COUNT = 6

async function FeaturedEvents() {
  const supabase = createPublicClient()
  const now = new Date().toISOString()

  // Root cause of the intermittent "blank until refresh" report: this
  // section used to require a non-null image_url with no status filter
  // at all, on a page statically rendered with revalidate=3600 (ISR). If
  // one regeneration happened to land on zero qualifying rows (an image-
  // backfill timing gap, say), that empty state got cached for up to an
  // hour — real visitors saw it until the next background regeneration
  // completed, which looks exactly like "fixed by a refresh". Two fixes
  // here: (1) image_url is no longer a hard requirement — EventCard
  // already renders a graceful category-emoji placeholder when it's
  // missing, so a temporary image gap can no longer zero out the whole
  // section; (2) cancelled/postponed rows are excluded, matching
  // LIVE_EVENT_STATUSES everywhere else a "what's on" grid is built.
  //
  // Fetch more than needed to absorb title deduplication; primary sort is
  // venue_capacity desc so the biggest venues surface first, onsale_date desc
  // as a tiebreaker for venues with unknown capacity (nulls last).
  let result = await queryFeaturedEvents(supabase, now)
  if (result.error) {
    console.warn('[homepage] Featured Shows query failed; retrying once:', result.error.message)
    await new Promise(resolve => setTimeout(resolve, 250))
    result = await queryFeaturedEvents(supabase, now)
  }

  if (result.error) {
    return (
      <div className="text-center py-16">
        <p className="text-5xl mb-4">⚠️</p>
        <p className="text-slate-500">Couldn&rsquo;t load featured shows right now — try refreshing.</p>
      </div>
    )
  }

  const seen = new Set<string>()
  const events: EventWithVenue[] = []
  for (const event of (result.data ?? [])) {
    if (!seen.has(event.title)) {
      seen.add(event.title)
      events.push(event)
    }
    if (events.length >= 6) break
  }

  if (!events.length) {
    return (
      <div className="text-center py-16">
        <p className="text-5xl mb-4">🎭</p>
        <p className="text-slate-500">No featured shows right now — check back soon.</p>
      </div>
    )
  }

  return (
    <ScrollRail label="Featured shows">
      {events.map(event => (
        <EventCard key={event.id} event={event} />
      ))}
    </ScrollRail>
  )
}

async function GigsbergHighlights() {
  const supabase = createPublicClient()
  const now = new Date().toISOString()
  const { data } = await supabase
    .from('events')
    .select('*, venue:venues(id, name, slug, city, postcode, capacity)')
    .eq('gigsberg_highlighted', true)
    .eq('gigsberg_inventory_status', 'available')
    .gte('gigsberg_highlight_until', now)
    .gte('start_date', now)
    .in('status', LIVE_EVENT_STATUSES)
    .order('start_date', { ascending: true })
    .limit(6) as unknown as { data: (Record<string, unknown> & { id: string; venue: { id: string; name: string; slug: string | null; city: string; postcode: string; capacity: number | null } | null })[] | null }

  const events: EventWithVenue[] = await dropDuplicateEvents(supabase, (data ?? []).filter(row => row.venue).map(row => ({
    ...row,
    venue_id: row.venue!.id,
    venue_name: row.venue!.name,
    venue_slug: row.venue!.slug,
    venue_city: row.venue!.city,
    venue_postcode: row.venue!.postcode,
    venue_capacity: row.venue!.capacity,
  } as unknown as EventWithVenue)))

  if (!events.length) return null
  return (
    <section className="bg-slate-900 py-10 sm:py-14">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-end justify-between gap-4 mb-7">
          <div>
            <p className="font-bold text-xs uppercase tracking-widest mb-1" style={{ color: '#FFD23F' }}>Tickets currently available</p>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-white">Featured Gigsberg events</h2>
            <p className="text-white/60 mt-2 text-sm">Live UK events with inventory checked recently.</p>
          </div>
          <Link href="/gigsberg" className="text-sm font-semibold whitespace-nowrap text-white/60 hover:text-white transition-colors">
            See all Gigsberg shows →
          </Link>
        </div>
        <ScrollRail label="Events">
          {events.map(event => <EventCard key={event.id} event={event} />)}
        </ScrollRail>
      </div>
    </section>
  )
}

function fmtCount(n: number): string {
  if (n >= 10000) return `${(Math.floor(n / 1000) * 1000).toLocaleString('en-GB')}+`
  if (n >= 1000)  return `${(Math.floor(n / 100)  * 100 ).toLocaleString('en-GB')}+`
  return `${n}+`
}

async function HomepageStats() {
  const supabase = createPublicClient()
  const now = new Date().toISOString()

  const [{ count: eventCount }, { count: venueCount }] = await Promise.all([
    // Canonical count: de-duplicated listings, live statuses, future only.
    listedEventsCount(supabase, { fromISO: now }),
    supabase.from('venues').select('*', { count: 'exact', head: true }),
  ])

  const stats = [
    { value: fmtCount(eventCount ?? 0), label: 'Events listed' },
    { value: fmtCount(venueCount ?? 0), label: 'Venues'        },
    { value: String(CITIES.length),     label: 'UK cities'     },
  ]

  return (
    <dl className="grid grid-cols-3 gap-4 sm:gap-8 text-center">
      {stats.map(({ value, label }) => (
        <div key={label} className="flex flex-col-reverse">
          <dt className="text-white/60 text-sm">{label}</dt>
          <dd className="text-3xl sm:text-4xl font-extrabold mb-1" style={{ color: '#FFD700' }}>{value}</dd>
        </div>
      ))}
    </dl>
  )
}

// The block straight under the hero: only shows whose public on-sale (or presale) falls in the current week, as an
// image mosaic (big tile = the most prominent show). Same pool as /on-sale-this-week, so a tile never 404s on click.
async function OnSaleMosaicSection() {
  const supabase = createPublicClient()
  const artistsData = await fetchAllArtists(supabase)
  const allGroups = await fetchOnSaleThisWeek(supabase, artistsData ?? [], { limit: 500 })
  // Same whole-tour count the click-through page lists, so a tile's "N UK dates" always matches it.
  const picked = await attachTourDateCounts(supabase, pickOnSaleMosaic(allGroups))

  const now = new Date()
  const tiles: OnSaleMosaicTile[] = picked.map(g => {
    const events = [...g.events].sort((a, b) => a.start_date.localeCompare(b.start_date))
    const first = events[0]
    const dates = groupDateCount(g)
    return {
      href: `/on-sale-this-week/${g.slug}`,
      title: g.artistName,
      imageUrl: eventImageUrl(artistPhotoUrl(g.artistName, g.image_url), first.category, first.title),
      chip: saleBadgeText(g.saleType, g.onsale_date),
      presale: g.saleType === 'presale',
      meta: dates > 1
        ? `${dates} UK dates`
        : `${venueLabel(first.venue_name, first.venue_city)} · ${londonDayWithYear(first.start_date, now)}`,
    }
  })
  return <OnSaleMosaic tiles={tiles} total={allGroups.length} />
}

async function EventsThisWeekNational() {
  const supabase = createPublicClient()

  // Biggest venues first, next 7 days, no city filter — the "generalised,
  // biggest events, no small local stuff" version of Events This Week that
  // belongs on the national homepage. Same shared helper city pages use
  // (src/lib/eventPools.ts), just called without a `city`.
  const events = await fetchEventsThisWeek(supabase, { limit: 9 })

  if (!events.length) return null

  return (
    <section className="bg-[#F5F5F0] py-10 sm:py-14">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-end justify-between mb-7">
          <div>
            <p className="font-bold text-xs uppercase tracking-widest mb-1" style={{ color: '#E8003D' }}>
              Next 7 days
            </p>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900">Events This Week</h2>
          </div>
          <Link href="/this-week" className="text-sm font-semibold whitespace-nowrap hover:underline" style={{ color: '#E8003D' }}>
            See everything this week →
          </Link>
        </div>
        <ScrollRail label="Events">
          {events.map(event => <EventCard key={event.id} event={event} />)}
        </ScrollRail>
      </div>
    </section>
  )
}

async function JustAnnounced() {
  const supabase = createPublicClient()
  const now = new Date()
  const nowISO = now.toISOString()
  const sevenDaysAgoISO = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()

  // events_with_venue doesn't expose created_at, so this queries the base
  // events table with venues embedded (same venue:venues(...) join used in
  // events/[slug]/page.tsx) rather than the view. Checks created_at /
  // public_onsale_start directly rather than the newly_announced flag column
  // — that flag depends on the same nightly calculate_event_flags() DB
  // function already known not to be running (see the OnSaleThisWeek
  // comment above), so it's stuck at false for everything.
  //
  // Excludes category='local' — hand-added local/community listings (city
  // page markets, festivals, etc.) have no public_onsale_start by design
  // (there's no ticket on-sale to announce), so they matched this "recently
  // created, not yet on sale" filter and were showing up on the generic
  // homepage mislabelled as "Just Announced" ticketed shows. This section
  // is specifically for genuine newly-synced Ticketmaster announcements.
  const result = await supabase
    .from('events')
    .select('*, venue:venues(id, name, slug, city, postcode, capacity)')
    .neq('category', 'local')
    .gte('created_at', sevenDaysAgoISO)
    .or(`public_onsale_start.is.null,public_onsale_start.gt.${nowISO}`)
    .gte('start_date', nowISO)
    // A newly-synced event that's already cancelled/postponed within its
    // first week is never a genuine "Just Announced" show — see
    // eventPools.ts's LIVE_EVENT_STATUSES comment.
    .in('status', LIVE_EVENT_STATUSES)
    .order('created_at', { ascending: false })
    .limit(8) as unknown as {
      data: (Record<string, unknown> & {
        id: string
        venue: { id: string; name: string; slug: string | null; city: string; postcode: string; capacity: number | null } | null
      })[] | null
    }

  const events: EventWithVenue[] = await dropDuplicateEvents(supabase, (result.data ?? [])
    .filter(row => row.venue)
    .map(row => ({
      ...row,
      venue_id:       row.venue!.id,
      venue_name:     row.venue!.name,
      venue_slug:     row.venue!.slug,
      venue_city:     row.venue!.city,
      venue_postcode: row.venue!.postcode,
      venue_capacity: row.venue!.capacity,
    } as unknown as EventWithVenue)))

  if (!events.length) return null

  return (
    <section className="bg-white py-10 sm:py-14 border-t border-slate-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-end justify-between mb-7">
          <div>
            <p className="font-bold text-xs uppercase tracking-widest mb-1" style={{ color: '#E8003D' }}>
              Hot off the press
            </p>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900">Just Announced</h2>
          </div>
          <Link href="/new-tours" className="text-sm font-semibold whitespace-nowrap hover:underline" style={{ color: '#E8003D' }}>
            See all new tours →
          </Link>
        </div>
        <ScrollRail label="Just announced" columns={4}>
          {events.map(event => <EventCard key={event.id} event={event} />)}
        </ScrollRail>
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
      {/* ── HEADLINE NEWS: our newest tour announcements, newest first ── */}
      <Suspense fallback={null}>
        <HeadlineNews />
      </Suspense>

      {/* ── HERO ────────────────────────────────────────────────── */}
      <section
        className="relative overflow-hidden flex flex-col items-center justify-center text-white min-h-[56vh] md:min-h-screen"
        style={{ backgroundColor: '#1A1A2E' }}
      >
        {/* Background image */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/heroshowfinder.png"
          alt="Crowd at a live concert with stage lights"
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

        <div className="relative w-full max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 md:py-0 text-center z-10">
          {/* Location banner — client-only, renders nothing unless Vercel's
              edge geolocation matched one of our 40 cities (see
              middleware.ts + LocationBanner.tsx) */}
          <div>
            <LocationBanner />
          </div>

          {/* Pre-headline */}
          <p className="inline-flex items-center gap-2 font-bold text-xs sm:text-sm uppercase tracking-widest mb-4 sm:mb-6 bg-white/5 px-3 sm:px-4 py-2 rounded-full border border-white/10"
            style={{ color: '#FFD700' }}>
            🎟️ Concerts, theatre, comedy, sports &amp; family shows
          </p>

          {/* Headline + subtext — swaps to a localized version once a city is
              detected (see LocalHeroCopy.tsx); server always renders the
              generic copy below as the safe default/fallback shape */}
          <LocalHeroCopy />

          {/* Search bar */}
          <div className="flex justify-center min-h-[72px]">
            <Suspense fallback={<div className="h-14 w-full max-w-3xl rounded-2xl bg-white/10 animate-pulse" aria-hidden="true" />}>
              <SearchBar />
            </Suspense>
          </div>

          {/* Category quick-filters */}
          <div className="mt-6 max-w-xl mx-auto min-h-[40px]">
            <Suspense fallback={<div className="h-10 rounded-xl bg-white/10 animate-pulse" aria-hidden="true" />}>
              <CategoryStrip />
            </Suspense>
          </div>

          {/* Trust row */}
          <div className="mt-6 sm:mt-8 flex flex-wrap justify-center gap-x-5 gap-y-1 sm:gap-6 text-xs sm:text-sm text-white/50">
            <span>✓ Free to use</span>
            <span>✓ Updated daily</span>
            <span>✓ {CITIES.length} UK cities</span>
          </div>
        </div>
      </section>

      {/* ── EMAIL SIGNUP: kept close to the hero without dominating the page ── */}
      <NewsletterSignup />

      {/* ── ON SALE THIS WEEK: image mosaic, straight under the hero so social-post visitors land on it ── */}
      <Suspense fallback={<HomeSectionSkeleton />}>
        <OnSaleMosaicSection />
      </Suspense>

      {/* ── LOCAL SPOTLIGHT (only renders once a city is detected) ─ */}
      <LocalSpotlight />

      {/* ── UK CITIES ───────────────────────────────────────────── */}
      <section className="bg-slate-900 py-10 sm:py-14">
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

      {/* ── WEST END (theatre is the best-paying ticket category) ── */}
      <Suspense fallback={<HomeSectionSkeleton />}>
        <WestEndStrip />
      </Suspense>

      {/* ── EVENTS THIS WEEK (national, biggest venues first) ───── */}
      <Suspense fallback={<HomeSectionSkeleton />}>
        <EventsThisWeekNational />
      </Suspense>

      {/* ── JUST ANNOUNCED ──────────────────────── */}
      <Suspense fallback={<HomeSectionSkeleton />}>
        <JustAnnounced />
      </Suspense>

      <Suspense fallback={<HomeSectionSkeleton />}>
        <GigsbergHighlights />
      </Suspense>

      {/* ── FEATURED EVENTS ─────────────────────────────────────── */}
      <section className="bg-[#F5F5F0] py-10 sm:py-14">
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

      {/* ── STATS BAND ──────────────────────────────────────────── */}
      <section className="py-10 sm:py-14" style={{ backgroundColor: '#1A1A2E' }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <Suspense fallback={
            <div className="grid grid-cols-3 gap-4 sm:gap-8 text-center">
              {Array.from({ length: 3 }).map((_, i) => (
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
