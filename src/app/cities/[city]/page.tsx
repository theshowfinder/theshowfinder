export const revalidate = 300

// Shortened from the site's usual 1-hour ISR window specifically because
// this page now carries two date-sensitive sections — "Tonight" and "On
// Sale This Week" both need to roll over to the next London day/week
// promptly rather than serving a stale snapshot for up to an hour after
// midnight. 5 minutes bounds the worst-case staleness to a small,
// acceptable window without regenerating on every request.

import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import EventCard from '@/components/EventCard'
import SearchBarWrapper from '@/components/SearchBarWrapper'
import { Suspense } from 'react'
import type { Artist } from '@/lib/types/database'
import { fmtOnSaleLabel } from '@/lib/on-sale'
import { CITIES } from '@/lib/cities'
import { venueCardBlurb } from '@/lib/venueBlurb'
import { citySlug } from '@/lib/cityNews'
import type { LocalBusiness, CityNews } from '@/lib/types/database'
import { jsonLdScript, buildBreadcrumbSchema, buildItemListSchema } from '@/lib/jsonld'
import { buildCityCollectionSchema, cityCanonicalUrl, cityPageDescription, cityPageTitle } from '@/lib/citySeo'
import CityNewsletterForm from '@/components/CityNewsletterForm'
import { fetchEventsThisWeek, fetchTopEvents, fetchPresalesOpenNow, fetchTonightEvents, fetchOnSaleThisWeek, LIVE_EVENT_STATUSES } from '@/lib/eventPools'
import { resolveCityEventCount, normalizeCityFilterValue } from '@/lib/cityEventCount'
import { CITY_GUIDE_INTROS } from '@/lib/cityGuides'
import PresaleGrid from '@/components/PresaleGrid'
import NewsCardGrid from '@/components/NewsCardGrid'
import TonightEventCard from '@/components/TonightEventCard'
import { rankCityNewsForDisplay } from '@/lib/newsPublishing'
import { CITY_HERO_IMAGES } from '@/lib/cityHeroImages'

export async function generateStaticParams() {
  return CITIES.map(c => ({ city: c.name }))
}

export async function generateMetadata(
  { params }: { params: Promise<{ city: string }> }
): Promise<Metadata> {
  const { city } = await params
  const cityName  = decodeURIComponent(city)
  const canonical = cityCanonicalUrl(cityName)
  const title     = cityPageTitle(cityName)
  const desc      = cityPageDescription(cityName)
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


// Wraps a plain travel/hotel link in an affiliate tracking template once one
// is configured, so the site can go from placeholder links to earning
// commission by setting a single Vercel env var (no code change / no
// redeploy-by-Claude needed). The env var's value is the affiliate network's
// full click-tracking URL with `{url}` where the destination should go, e.g.
// CJ Affiliate for Booking.com: BOOKING_AFFILIATE_TEMPLATE=
//   "https://www.anrdoezrs.net/click-XXXXXXX-XXXXXXX?url={url}"
// Until that env var is set (CJ/Awin approval still pending as of writing),
// this returns the plain destination link unchanged.
function affiliateUrl(directUrl: string, envVar: string): string {
  const template = process.env[envVar]
  if (!template) return directUrl
  return template.replace('{url}', encodeURIComponent(directUrl))
}

export default async function CityPage({
  params,
  searchParams,
}: {
  params: Promise<{ city: string }>
  searchParams: Promise<{ page?: string }>
}) {
  const { city } = await params
  const requestedCityName = decodeURIComponent(city)

  const cityConfig = CITIES.find(c => c.name.toLowerCase() === requestedCityName.toLowerCase())
  if (!cityConfig) notFound()
  const cityName = cityConfig.name
  if (requestedCityName !== cityName) redirect(cityCanonicalUrl(cityName))

  // This route no longer paginates: the city page has its own focused pools
  // and the full event list lives at /events?city=. Old paginated city URLs
  // should resolve to the canonical city page instead of looking like a
  // successful but empty page to crawlers.
  const { page } = await searchParams
  if (page) redirect(cityCanonicalUrl(cityName))

  const supabase = await createClient()
  const now       = new Date()
  const nowISO    = now.toISOString()

  // Artists fetched up front — fetchPresalesOpenNow and fetchOnSaleThisWeek
  // both group their pool by artist and need the list to do it, so neither
  // can run inside the Promise.all below alongside the query it groups.
  const { data: artistsData } = await supabase.from('artists').select('*') as unknown as { data: Artist[] | null }
  const artists = artistsData ?? []

  const [
    tonightEvents,
    eventsThisWeek,
    topEvents,
    presaleGroups,
    onsaleGroups,
    totalCountResult,
    venuesResult,
    localBusinessesResult,
    cityNewsResult,
  ] = await Promise.all([
    // Today only, Europe/London calendar day, soonest first — see
    // src/lib/tonight.ts for the exact rules (cancelled/postponed and
    // already-finished shows excluded).
    fetchTonightEvents(supabase, { city: cityName, fetchLimit: 50 }),

    // Tomorrow through the following 7 London days, biggest venues first
    // — ticketed shows and hand-curated local events (markets, community
    // stuff) together in one list. Starts tomorrow, not today, so nothing
    // here duplicates a card already shown in Tonight above. Shared with
    // the homepage's national version of this section (src/lib/
    // eventPools.ts) so the two never drift the way the old per-page
    // copies did.
    fetchEventsThisWeek(supabase, { city: cityName, limit: 30 }),

    // The biggest shows beyond this week, out to ~2 months — same shared
    // helper as the homepage's Top Events section.
    fetchTopEvents(supabase, { city: cityName, limit: 9 }),

    // Presales open right now — presale_start already passed and presale_end
    // (if the sync gave us one) hasn't. Distinct from "On Sale This Week"
    // below, which tracks the public on-sale date, not the presale window —
    // kept as two separate queries/sections on purpose so an artist in an
    // active presale isn't shown twice.
    fetchPresalesOpenNow(supabase, artists, { city: cityName, limit: 6 }),

    // On sale this week — the genuine public on-sale date (onsale_date)
    // falling within the current Monday-Sunday UK week, never the
    // presale window (kept as a separate section above), via the same
    // shared helper the homepage and /on-sale-this-week listing use —
    // this used to be a hand-rolled, differently-windowed query unique to
    // this page; routing it through fetchOnSaleThisWeek means this city
    // page can never drift from those again, and it now also gets the
    // same cancelled/postponed exclusion and per-series diversity cap
    // (capGroupsBySeries, on-sale.ts) those pages already have.
    fetchOnSaleThisWeek(supabase, artists, { city: cityName, limit: 6 }),

    // Total upcoming count for the hero stat line — a head:true count query,
    // not a full events fetch (the "All Events" grid this used to feed has
    // been removed: with thousands of events in some cities it was more of a
    // wall to search through than a useful section).
    supabase
      .from('events_with_venue')
      .select('*', { count: 'exact', head: true })
      .ilike('venue_city', normalizeCityFilterValue(cityName))
      // Same live-status criteria as the shared event-pool helpers above
      // (Tonight/This Week/Top Events/On Sale) — see cityEventCount.ts.
      .in('status', LIVE_EVENT_STATUSES)
      .gte('start_date', nowISO) as unknown as Promise<{ count: number | null; error: unknown }>,

    // Venues in this city sorted by capacity
    supabase
      .from('venues')
      .select('id, name, slug, capacity, address, image_url')
      .ilike('city', cityName)
      .order('capacity', { ascending: false, nullsFirst: false })
      .limit(20) as unknown as Promise<{ data: { id: string; name: string; slug: string; capacity: number | null; address: string; image_url: string | null }[] | null }>,

    // Local guide listings for this city — sponsored first
    supabase
      .from('local_businesses')
      .select('*')
      .ilike('city', cityName)
      .order('is_sponsored', { ascending: false })
      .order('display_order', { ascending: true })
      .limit(24) as unknown as Promise<{ data: LocalBusiness[] | null }>,

    // Local entertainment news for this city
    supabase
      .from('city_news')
      .select('*')
      .eq('city_slug', citySlug(cityName))
      .order('published_at', { ascending: false })
      .limit(5) as unknown as Promise<{ data: CityNews[] | null }>,
  ])

  const localBusinesses = localBusinessesResult.data ?? []
  // Re-applies the same recency ranking the query above already expresses
  // (.order('published_at', {ascending:false}).limit(5)) as an explicit,
  // unit-tested contract — see rankCityNewsForDisplay in newsPublishing.ts
  // for why an editorial story's published_at is the Showfinder publish
  // time, not the source article's own date, and why that's what lets it
  // compete fairly (not permanently) against RSS rows for one of these 5
  // slots.
  const cityNews = rankCityNewsForDisplay(cityNewsResult.data ?? [], 5)
  // A query error must not be presented the same way as a genuine
  // zero-event city — see cityEventCount.ts for the intermittent
  // "Coming soon"-style bug this was found causing on the navigation
  // card (CitiesGrid.tsx), which this hero count shares the exact same
  // query shape with.
  const totalCountOutcome = resolveCityEventCount(totalCountResult)
  const totalCount        = totalCountOutcome.ok ? totalCountOutcome.count : 0

  // Exact upcoming-event counts for each candidate venue, queried one venue
  // at a time with count:'exact', head:true rather than sampling all of the
  // city's events into a capped, unordered array. The old sampling query
  // silently dropped major arenas (The O2, Wembley Stadium) from big cities'
  // Venues sections once a city had more upcoming event rows than the sample
  // cap, or whenever a duplicate zero-event venue row happened to be the one
  // counted. A per-venue exact count is correct regardless of how many rows
  // the city has or how many duplicate venue rows exist.
  const candidateVenues = venuesResult.data ?? []

  // City hero/card photo — the highest-capacity venue in this city that has
  // a real (Ticketmaster-sourced) image, same images already trusted and
  // displayed elsewhere on the site. No image for this city yet → falls
  // back to the solid colour + emoji treatment.
  const cityHeroImage = candidateVenues.find(v => v.image_url)?.image_url ?? null
  const cityLandmarkImage = CITY_HERO_IMAGES[cityName] ?? null
  const venueCountResults = await Promise.all(
    candidateVenues.map(v =>
      supabase
        .from('events_with_venue')
        .select('venue_id', { count: 'exact', head: true })
        .eq('venue_id', v.id)
        .gte('start_date', nowISO) as unknown as Promise<{ count: number | null }>
    )
  )

  // Build venue event count map and filter to venues with upcoming events
  const countByVenue: Record<string, number> = {}
  candidateVenues.forEach((v, i) => {
    countByVenue[v.id] = venueCountResults[i]?.count ?? 0
  })
  const cityVenues = candidateVenues.filter(v => countByVenue[v.id] > 0)

  // Booking.com/Trainline cards (Getting There & Staying, below) are
  // gated on their own affiliate template being configured — showing
  // either as a live, clickable link before the tracking template exists
  // would send real visitors through an untracked destination with no
  // commission and no disclosure. See affiliateUrl()'s own comment for
  // how the template env var is set once an application is approved.
  const hasBookingAffiliate   = !!process.env.BOOKING_AFFILIATE_TEMPLATE
  const hasTrainlineAffiliate = !!process.env.TRAINLINE_AFFILIATE_TEMPLATE

  const canonical = `https://www.theshowfinder.com/cities/${encodeURIComponent(cityName)}`
  const breadcrumbSchema = buildBreadcrumbSchema([
    { name: 'Home', url: 'https://www.theshowfinder.com' },
    { name: cityName, url: canonical },
  ])
  const itemListSchema = buildItemListSchema(
    eventsThisWeek.slice(0, 20).map(ev => ({
      name: ev.title,
      url:  `https://www.theshowfinder.com/events/${ev.slug}`,
    }))
  )
  const collectionSchema = buildCityCollectionSchema({
    cityName,
    url: canonical,
    name: cityPageTitle(cityName),
    description: cityPageDescription(cityName),
  })

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
      <div
        className="relative py-14 px-4 sm:px-6 lg:px-8 overflow-hidden"
        style={{ backgroundColor: '#1A1A2E' }}
      >
        {(cityHeroImage || cityLandmarkImage) && (
          <>
            {cityHeroImage && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={cityHeroImage}
                alt=""
                aria-hidden="true"
                className="absolute inset-0 w-full h-full object-cover"
              />
            )}
            {cityLandmarkImage && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={cityLandmarkImage}
                alt=""
                aria-hidden="true"
                className="absolute inset-0 w-full h-full object-cover opacity-55"
              />
            )}
            <div
              className="absolute inset-0"
              style={{ background: 'linear-gradient(180deg, rgba(26,26,46,0.58) 0%, rgba(26,26,46,0.82) 66%, #1A1A2E 100%)' }}
            />
          </>
        )}
        <div className="relative max-w-7xl mx-auto">
          <p className="text-5xl mb-4 select-none">{cityConfig.emoji}</p>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-white mb-2">
            Concerts &amp; Live Events in {cityName}
          </h1>
          <p className="text-white/50 text-sm mb-8">
            {totalCount > 0
              ? `${totalCount}+ upcoming show${totalCount !== 1 ? 's' : ''}`
              : 'Browse upcoming shows'}
          </p>
          <Suspense>
            <SearchBarWrapper />
          </Suspense>
          <nav aria-label={`${cityName} event links`} className="flex flex-wrap gap-3 mt-6">
            <Link
              href={`/cities/${encodeURIComponent(cityName)}/this-week`}
              className="rounded-full bg-white/10 px-4 py-2 text-sm font-semibold text-white hover:bg-white/20"
            >
              Events this week
            </Link>
          </nav>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-14">

        {/* ── CITY GUIDE INTRO (only renders for cities with a written entry) ── */}
        {CITY_GUIDE_INTROS[cityName] && (
          <section>
            <p className="font-bold text-xs uppercase tracking-widest mb-1" style={{ color: '#026CDF' }}>
              About {cityName}
            </p>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 mb-4">
              {cityName}&rsquo;s Live Scene
            </h2>
            <p className="text-slate-600 leading-relaxed max-w-3xl">
              {CITY_GUIDE_INTROS[cityName]}
            </p>
          </section>
        )}

        {/* ── NEWSLETTER (city-scoped) ── */}
        <CityNewsletterForm cityName={cityName} />

        {/* ── TONIGHT (hidden completely when there are no valid events) ── */}
        {tonightEvents.length > 0 && (
          <section>
            <div className="mb-7">
              <p className="font-bold text-xs uppercase tracking-widest mb-1" style={{ color: '#E8003D' }}>
                Happening now
              </p>
              <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900">
                Tonight in {cityName}
              </h2>
            </div>
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm divide-y divide-slate-100">
              {tonightEvents.map(event => (
                <TonightEventCard key={event.id} event={event} artists={artists} />
              ))}
            </div>
          </section>
        )}

        {/* ── EVENTS THIS WEEK (ticketed shows + local events, merged) ── */}
        {eventsThisWeek.length > 0 && (
          <section>
            <div className="flex items-end justify-between mb-7">
              <div>
                <p className="font-bold text-xs uppercase tracking-widest mb-1" style={{ color: '#E8003D' }}>
                  Next 7 days
                </p>
                <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900">
                  Events This Week in {cityName}
                </h2>
              </div>
              <Link
                href={`/cities/${encodeURIComponent(cityName)}/this-week`}
                className="text-sm font-semibold whitespace-nowrap hover:underline"
                style={{ color: '#E8003D' }}
              >
                See all →
              </Link>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {eventsThisWeek.map(event => (
                <EventCard key={event.id} event={event} />
              ))}
            </div>
          </section>
        )}

        {/* ── LOCAL ENTERTAINMENT NEWS (hidden if no rows yet) ── */}
        {cityNews.length > 0 && (
          <section>
            <div className="mb-7">
              <p className="font-bold text-xs uppercase tracking-widest mb-1" style={{ color: '#E8003D' }}>
                In the news
              </p>
              <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900">
                {cityName} Entertainment News
              </h2>
            </div>
            <NewsCardGrid items={cityNews} context={`city:${city}`} />
          </section>
        )}

        {/* ── PRESALES OPEN NOW ── */}
        {presaleGroups.length > 0 && (
          <section>
            <div className="mb-7">
              <p className="font-bold text-xs uppercase tracking-widest mb-1" style={{ color: '#FFB800' }}>
                Buy before everyone else
              </p>
              <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900">
                Presales Open Now in {cityName}
              </h2>
            </div>
            <PresaleGrid groups={presaleGroups} />
          </section>
        )}

        {/* ── ON SALE THIS WEEK (omit the whole block when empty so the page
             stays focused and does not present a thin empty section to users
             or crawlers) ── */}
        {onsaleGroups.length > 0 && <section>
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
        </section>}

        {/* ── TOP EVENTS (beyond this week, up to ~2 months out) ── */}
        {topEvents.length > 0 && (
          <section>
            <div className="mb-7">
              <p className="font-bold text-xs uppercase tracking-widest mb-1" style={{ color: '#026CDF' }}>
                Coming up
              </p>
              <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900">
                Top Events in {cityName}
              </h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {topEvents.map(event => (
                <EventCard key={event.id} event={event} />
              ))}
            </div>
          </section>
        )}

        {/* ── VENUES ── */}
        {cityVenues.length > 0 && (
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
                  <p className="text-sm text-slate-500 mb-1 truncate">{venue.address}</p>
                  <p className="text-xs text-slate-400 mb-3 leading-relaxed">
                    {venueCardBlurb(venue.capacity, countByVenue[venue.id] ?? 0, cityName)}
                  </p>
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

        {/* ── GETTING THERE & STAYING (hidden entirely if neither affiliate
             template env var is configured — see hasBookingAffiliate/
             hasTrainlineAffiliate above: an untracked placeholder link is
             never shown in its place) ── */}
        {(hasBookingAffiliate || hasTrainlineAffiliate) && (
          <section>
            <div className="mb-7">
              <p className="font-bold text-xs uppercase tracking-widest mb-1" style={{ color: '#E8003D' }}>
                Plan your trip
              </p>
              <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900">
                Getting to {cityName} & Staying Over
              </h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              {hasBookingAffiliate && (
                <a
                  href={affiliateUrl(`https://www.booking.com/searchresults.html?ss=${encodeURIComponent(`${cityName}, United Kingdom`)}`, 'BOOKING_AFFILIATE_TEMPLATE')}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 p-6"
                >
                  <div>
                    <p className="font-extrabold text-slate-900 text-lg mb-1">🏨 Hotels in {cityName}</p>
                    <p className="text-sm text-slate-500">Staying over for the show? Search hotels via Booking.com</p>
                  </div>
                  <span className="text-xl text-slate-300">→</span>
                </a>
              )}
              {hasTrainlineAffiliate && (
                <a
                  href={affiliateUrl('https://www.thetrainline.com/', 'TRAINLINE_AFFILIATE_TEMPLATE')}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 p-6"
                >
                  <div>
                    <p className="font-extrabold text-slate-900 text-lg mb-1">🚆 Trains to {cityName}</p>
                    <p className="text-sm text-slate-500">Book UK train tickets via Trainline</p>
                  </div>
                  <span className="text-xl text-slate-300">→</span>
                </a>
              )}
            </div>
          </section>
        )}

        {/* ── LOCAL GUIDE (hidden until businesses are added) ── */}
        {localBusinesses.length > 0 && (
          <section>
            <div className="mb-7">
              <p className="font-bold text-xs uppercase tracking-widest mb-1" style={{ color: '#026CDF' }}>
                Local guide
              </p>
              <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900">
                Recommended in {cityName}
              </h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {localBusinesses.map(biz => {
                const card = (
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 p-5 h-full">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-slate-100 text-slate-600">
                        {biz.category}
                      </span>
                      {biz.is_sponsored && (
                        <span className="text-xs font-bold uppercase tracking-wider px-2.5 py-1 rounded-full text-white" style={{ backgroundColor: '#E8003D' }}>
                          Sponsored
                        </span>
                      )}
                      {biz.is_lusso_client && (
                        <span className="text-xs font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-blue-50 text-blue-700">
                          Lusso Client
                        </span>
                      )}
                    </div>
                    <h3 className="font-bold text-slate-900 text-base leading-snug mb-1">{biz.name}</h3>
                    {biz.description && <p className="text-sm text-slate-500">{biz.description}</p>}
                  </div>
                )
                return biz.website_url ? (
                  <a key={biz.id} href={biz.website_url} target="_blank" rel="noopener noreferrer" className="block">
                    {card}
                  </a>
                ) : (
                  <div key={biz.id}>{card}</div>
                )
              })}
            </div>
          </section>
        )}

      </div>
    </div>
  )
}
