import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createPublicClient } from '@/lib/supabase/public'
import EventCard from '@/components/EventCard'
import Pagination from '@/components/Pagination'
import NewsletterInline from '@/components/NewsletterInline'
import FollowButton from '@/components/FollowButton'
import { ArtistsInCity, SimilarArtists } from '@/components/RelatedArtists'
import ShareButton from '@/components/ShareButton'
import CalendarSubscribe from '@/components/CalendarSubscribe'
import { cityPagePath } from '@/lib/cities'
import type { EventWithVenue } from '@/lib/types/database'
import { venuePageDescription } from '@/lib/venueBlurb'
import { LIVE_EVENT_STATUSES } from '@/lib/eventPools'
import { jsonLdScript, buildBreadcrumbSchema, buildItemListSchema } from '@/lib/jsonld'
import { buildVenueSchema } from '@/lib/venueSeo'

export const PAGE_SIZE = 24

interface VenueRow {
  id: string
  name: string
  slug: string
  address: string
  city: string
  postcode: string
  capacity: number | null
  website: string | null
}

export default async function VenueView({ slug, page }: { slug: string; page: number }) {
  const supabase  = createPublicClient()
  const now       = new Date().toISOString()
  const from      = (page - 1) * PAGE_SIZE
  const to        = from + PAGE_SIZE - 1

  // Fetch venue — first query so we have the ID for the events query
  const { data: venue } = await supabase
    .from('venues')
    .select('id, name, slug, address, city, postcode, capacity, website')
    .eq('slug', slug)
    .single() as unknown as { data: VenueRow | null }

  if (!venue) notFound()

  // Fetch upcoming events at this venue — paginated (not capped at an
  // arbitrary limit) so a busy venue's later shows aren't silently hidden.
  // A flat .limit(50) previously meant any venue with more than ~25 distinct
  // upcoming shows (Ticketmaster often lists a standard + a premium-package
  // listing per show, doubling the row count) had its later dates vanish
  // from the page entirely with no indication anything was missing.
  const { data: events, count } = await supabase
    .from('events_with_venue')
    .select('*', { count: 'exact' })
    .eq('venue_id', venue.id)
    .gte('start_date', now)
    // A cancelled/postponed show is never a genuine upcoming listing —
    // see eventPools.ts's LIVE_EVENT_STATUSES comment.
    .in('status', LIVE_EVENT_STATUSES)
    .order('start_date', { ascending: true })
    .range(from, to) as unknown as { data: EventWithVenue[] | null; count: number | null }

  const upcomingEvents = events ?? []
  const totalCount     = count ?? upcomingEvents.length
  const totalPages     = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))

  function buildHref(p: number) {
    if (p === 1) return `/venues/${slug}`
    return `/venues/${slug}?page=${p}`
  }

  // Only link to a city page when one exists (otherwise it would 404).
  const cityHref = cityPagePath(venue.city)

  const description = venuePageDescription(
    venue.name,
    venue.city,
    venue.capacity,
    upcomingEvents.map(e => e.category),
  )

  const venueUrl = `https://www.theshowfinder.com/venues/${venue.slug}`
  const schemas = [
    buildVenueSchema(venue),
    buildBreadcrumbSchema([
      { name: 'Home', url: 'https://www.theshowfinder.com' },
      ...(cityHref ? [{ name: venue.city, url: `https://www.theshowfinder.com${cityHref}` }] : []),
      { name: venue.name, url: venueUrl },
    ]),
    ...(upcomingEvents.length
      ? [buildItemListSchema(upcomingEvents.slice(0, 20).map(e => ({ name: e.title, url: `https://www.theshowfinder.com/events/${e.slug}` })))]
      : []),
  ]

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#F5F5F0' }}>
      {schemas.map((s, i) => (
        <script key={i} type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(s) }} />
      ))}

      {/* ── HERO ── */}
      <div className="py-14 px-4 sm:px-6 lg:px-8" style={{ backgroundColor: '#1A1A2E' }}>
        <div className="max-w-7xl mx-auto">

          {/* Breadcrumb */}
          <nav className="flex items-center gap-1.5 text-sm text-white/50 mb-6 flex-wrap">
            <Link href="/" className="hover:text-white transition-colors">Home</Link>
            <span>/</span>
            {cityHref ? (
              <Link href={cityHref} className="hover:text-white transition-colors">
                {venue.city}
              </Link>
            ) : (
              <span>{venue.city}</span>
            )}
            <span>/</span>
            <span className="text-white/80">{venue.name}</span>
          </nav>

          <h1 className="text-3xl sm:text-4xl font-extrabold text-white mb-2">
            {venue.name}
          </h1>

          <p className="text-white/60 text-sm mb-1">
            {venue.address}, {venue.city}, {venue.postcode}
          </p>

          {venue.capacity && (
            <p className="text-white/50 text-sm mb-4">
              Capacity: {venue.capacity.toLocaleString('en-GB')}
            </p>
          )}

          <p className="text-white/70 text-sm max-w-2xl leading-relaxed mb-5">
            {description}
          </p>

          <div className="flex flex-wrap items-start gap-3">
            <FollowButton kind="venue" slug={venue.slug} name={venue.name} source="venue" />
            <CalendarSubscribe path={`/calendar/venues/${venue.slug}.ics`} label="Add shows to calendar" />
            <ShareButton
              url={`https://www.theshowfinder.com/venues/${venue.slug}`}
              title={venue.name}
              text={`What's on at ${venue.name}? Compare tickets:`}
              itemId={venue.slug}
              contentType="venue"
              variant="dark"
              label="Share"
            />
          </div>
        </div>
      </div>

      {/* ── EVENTS GRID ── */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="flex items-end justify-between mb-7">
          <div>
            <p className="font-bold text-xs uppercase tracking-widest mb-1" style={{ color: '#E8003D' }}>
              Upcoming shows
            </p>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900">
              Events at {venue.name}
            </h2>
          </div>
          {totalCount > 0 && (
            <span className="text-sm text-slate-500 hidden sm:block">
              {totalCount} upcoming show{totalCount !== 1 ? 's' : ''}
            </span>
          )}
        </div>

        {upcomingEvents.length === 0 ? (
          <div className="text-center py-24 bg-white rounded-2xl border border-slate-200">
            <p className="text-6xl mb-4">🎭</p>
            <h3 className="text-xl font-semibold text-slate-700 mb-2">No upcoming events</h3>
            <p className="text-slate-500 mb-6">No events are scheduled at this venue right now.</p>
            <Link
              href={cityHref ?? '/events'}
              className="text-sm font-semibold hover:underline"
              style={{ color: '#E8003D' }}
            >
              {cityHref ? `Browse all events in ${venue.city} →` : 'Browse all events →'}
            </Link>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {upcomingEvents.map(event => (
                <EventCard key={event.id} event={event} />
              ))}
            </div>
            <Pagination currentPage={page} totalPages={totalPages} buildHref={buildHref} />
          </>
        )}

        <div className="mt-12 max-w-3xl space-y-10">
          {venue.city && <ArtistsInCity city={venue.city} />}
          <SimilarArtists title="Popular right now" />
        </div>

        <div className="mt-12 max-w-2xl">
          <NewsletterInline source="venue" subject={venue.name} />
        </div>
      </div>
    </div>
  )
}
