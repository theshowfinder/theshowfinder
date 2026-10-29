export const revalidate = 1800
// A page render that takes longer than this has hit a database problem: stop and keep serving the cached copy
// instead of holding a function open for 5 minutes (29 Oct 2026 outage: 26,000 renders stuck for 300s each).
export const maxDuration = 60

// Shortened from the site's usual 1-hour ISR window specifically because
// this page now carries two date-sensitive sections — "Tonight" and "On
// Sale This Week" both need to roll over to the next London day/week
// promptly rather than serving a stale snapshot for up to an hour after
// midnight. 5 minutes bounds the worst-case staleness to a small,
// acceptable window without regenerating on every request.

import { listedEventsCount } from '@/lib/listedEvents'
import { fetchAllArtists } from '@/lib/allArtists'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import { createPublicClient } from '@/lib/supabase/public'
import EventCard from '@/components/EventCard'
import SearchBarWrapper from '@/components/SearchBarWrapper'
import { Suspense } from 'react'
import { dropNonUkNews } from '@/lib/newsFiltering'
import { saleBadgeText, groupDateCount } from '@/lib/on-sale'
import { CITIES } from '@/lib/cities'
import { rankVenues, splitPopular } from '@/lib/venueDiscovery'
import { fetchVenueEventRows, fetchNearbyRankedVenues } from '@/lib/venueData'
import VenueCard from '@/components/VenueCard'
import { citySlug, NATIONAL_SLUG } from '@/lib/cityNews'
import type { LocalBusiness, CityNews } from '@/lib/types/database'
import { jsonLdScript, buildBreadcrumbSchema, buildItemListSchema } from '@/lib/jsonld'
import { buildCityCollectionSchema, cityCanonicalUrl, cityPageDescription, cityPageTitle } from '@/lib/citySeo'
import CityNewsletterForm from '@/components/CityNewsletterForm'
import { fetchEventsThisWeek, fetchLocalEvents, fetchTopEvents, fetchNearbyEvents, fetchRecentlyAddedEvents, fetchCityCategoryCounts, fetchTonightEvents, fetchOnSaleThisWeek, attachTourDateCounts } from '@/lib/eventPools'
import { resolveCityEventCount } from '@/lib/cityEventCount'
import { CITY_GUIDE_INTROS } from '@/lib/cityGuides'
import NewsCardGrid from '@/components/NewsCardGrid'
import TonightEventCard from '@/components/TonightEventCard'
import WestEndStrip from '@/components/WestEndStrip'
import { pickNewsForCityPage, CITY_NEWS_MAX_AGE_DAYS } from '@/lib/newsPublishing'
import ScrollRail from '@/components/ScrollRail'
import CityIntro from '@/components/CityIntro'
import { CITY_HERO_IMAGES } from '@/lib/cityHeroImages'
import CalendarSubscribe from '@/components/CalendarSubscribe'
import { cityFeedPath } from '@/lib/calendarFeeds'
import { getNearbyAreas, getNeighbourCities, areasWithEvents, nearbyIntroSentence } from '@/lib/nearbyAreas'
import CityBrowse from '@/components/CityBrowse'
import CityTicketSources from '@/components/CityTicketSources'
import CityMorningEdition from '@/components/CityMorningEdition'
import { fetchCityEdition } from '@/lib/cityEdition'
import { buildEdition, editionHeadline, freshnessStamp } from '@/lib/cityBrief'
import { excludePreviouslyShown } from '@/lib/cityDisplayRows'
import { fetchStoriesForEventIds } from '@/lib/newsStoriesData'
import CityNewsMosaic from '@/components/CityNewsMosaic'
import LocalBusinessAds from '@/components/LocalBusinessAds'

// No city page is built at deploy time: each is generated on first request, then
// cached and refreshed in the background (see `revalidate`). Building all 40 cities
// during every deploy made a deploy depend on the database being fast: when it
// stalled, the 60-second page timeouts failed the whole build. Every other dynamic
// route on the site already works this way.
export async function generateStaticParams() {
  return []
}

export async function generateMetadata(
  { params }: { params: Promise<{ city: string }> }
): Promise<Metadata> {
  const { city } = await params
  const cityName  = decodeURIComponent(city)
  const canonical = cityCanonicalUrl(cityName)
  const title     = cityPageTitle(cityName)
  // Live count (head query only) so the search snippet reflects what is actually on.
  const { count: upcoming } = await listedEventsCount(createPublicClient(), { city: cityName })
  const desc      = cityPageDescription(cityName, upcoming)
  const ogImage   = 'https://www.theshowfinder.com/og-image.png'
  return {
    title,
    description: desc,
    alternates:  {
      canonical,
      types: { 'application/rss+xml': `https://www.theshowfinder.com/feeds/cities/${encodeURIComponent(cityName)}.xml` },
    },
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
}: {
  params: Promise<{ city: string }>
}) {
  const { city } = await params
  const requestedCityName = decodeURIComponent(city)

  const cityConfig = CITIES.find(c => c.name.toLowerCase() === requestedCityName.toLowerCase())
  if (!cityConfig) notFound()
  const cityName = cityConfig.name
  if (requestedCityName !== cityName) redirect(cityCanonicalUrl(cityName))

  // This route no longer paginates: the city page has its own focused pools
  // and the full event list lives at /events?city=. It deliberately does not
  // read searchParams (reading them forces dynamic rendering and disables the
  // CDN cache), so an old paginated URL such as /cities/London?page=2 just
  // renders this page, whose canonical tag points at the clean city URL.

  const supabase = createPublicClient()
  const now       = new Date()
  const nowISO    = now.toISOString()

  // Artists fetched up front — fetchOnSaleThisWeek
  // both group their pool by artist and need the list to do it, so neither
  // can run inside the Promise.all below alongside the query it groups.
  const artistsData = await fetchAllArtists(supabase)
  const artists = artistsData ?? []

  const nearbyAreas = getNearbyAreas(cityName)
  // The Around-<city> show strip also draws on neighbouring cities (Derby: Nottingham, Sheffield...).
  const stripAreas = [...nearbyAreas, ...getNeighbourCities(cityName)]

  const [
    tonightEvents,
    eventsThisWeek,
    localEventsRaw,
    topEvents,
    onsaleGroups,
    totalCountResult,
    venuesResult,
    localBusinessesResult,
    cityNewsResult,
    nationalNewsResult,
    nearbyEvents,
    categoryCounts,
    recentlyAdded,
    editionData,
  ] = await Promise.all([
    // Today only, Europe/London calendar day, soonest first — see
    // src/lib/tonight.ts for the exact rules (cancelled/postponed and
    // already-finished shows excluded).
    fetchTonightEvents(supabase, { city: cityName }),

    // Tomorrow through the following 7 London days, biggest venues first
    // — ticketed shows and hand-curated local events (markets, community
    // stuff) together in one list. Starts tomorrow, not today, so nothing
    // here duplicates a card already shown in Tonight above. Shared with
    // the homepage's national version of this section (src/lib/
    // eventPools.ts) so the two never drift the way the old per-page
    // copies did.
    fetchEventsThisWeek(supabase, { city: cityName, limit: 30 }),

    // Council / venue / tourist-board listings for this city over the next ~8 weeks (the "What's on locally" section).
    fetchLocalEvents(supabase, { city: cityName, limit: 16 }),

    // The biggest shows beyond this week, out to ~2 months — same shared
    // helper as the homepage's Top Events section.
    fetchTopEvents(supabase, { city: cityName, limit: 9 }),

    // On sale this week — the genuine public on-sale date (onsale_date)
    // falling within the current Monday-Sunday UK week, never the
    // presale window (kept as a separate section above), via the same
    // shared helper the homepage and /on-sale-this-week listing use —
    // this used to be a hand-rolled, differently-windowed query unique to
    // this page; routing it through fetchOnSaleThisWeek means this city
    // page can never drift from those again, and it now also gets the
    // same cancelled/postponed exclusion and per-series diversity cap
    // (capGroupsBySeries, on-sale.ts) those pages already have.
    fetchOnSaleThisWeek(supabase, artists, { city: cityName, limit: 6 }).then(g => attachTourDateCounts(supabase, g)),

    // Total upcoming count for the hero stat line — a head:true count query,
    // not a full events fetch (the "All Events" grid this used to feed has
    // been removed: with thousands of events in some cities it was more of a
    // wall to search through than a useful section).
    // listedEventsCount (src/lib/listedEvents.ts) is the one canonical count:
    // de-duplicated listings, live statuses, future only. Same helper feeds
    // the metadata description, the city cards and the category chips.
    listedEventsCount(supabase, { city: cityName, fromISO: nowISO }) as Promise<{ count: number | null; error: unknown }>,

    // Venues in this city sorted by capacity
    supabase
      .from('venues')
      .select('id, name, slug, capacity, address, image_url')
      .ilike('city', cityName)
      .order('capacity', { ascending: false, nullsFirst: false })
      .limit(20) as unknown as Promise<{ data: { id: string; name: string; slug: string; capacity: number | null; address: string; image_url: string | null }[] | null }>,

    // Local advertising placements for this city — Featured first. The
    // presentation layer enforces the commercial cap of 3 Featured + 6 Standard.
    supabase
      .from('local_businesses')
      .select('*')
      .ilike('city', cityName)
      .order('is_sponsored', { ascending: false })
      .order('display_order', { ascending: true })
      .limit(100) as unknown as Promise<{ data: LocalBusiness[] | null }>,

    // Local entertainment news for this city (newest 30; freshness is applied below)
    supabase
      .from('city_news')
      .select('*')
      .eq('city_slug', citySlug(cityName))
      .order('published_at', { ascending: false })
      .limit(30) as unknown as Promise<{ data: CityNews[] | null }>,

    // UK-wide entertainment news, used to top up a city with few fresh local stories
    supabase
      .from('city_news')
      .select('*')
      .eq('city_slug', NATIONAL_SLUG)
      .gte('published_at', new Date(now.getTime() - CITY_NEWS_MAX_AGE_DAYS * 86_400_000).toISOString())
      .order('published_at', { ascending: false })
      .limit(20) as unknown as Promise<{ data: CityNews[] | null }>,

    // Shows in the towns around this hub (none for cities without a nearby-areas
    // entry). They join this page rather than getting thin pages of their own.
    nearbyAreas.length > 0 ? fetchNearbyEvents(supabase, { areas: stripAreas, limit: 12 }) : Promise.resolve([]),

    // Per-type counts for the "browse by type" chips
    fetchCityCategoryCounts(supabase, cityName),

    // Shows first listed in the last 7 days: the page's own freshness signal
    fetchRecentlyAddedEvents(supabase, { city: cityName, limit: 12 }),

    // Everything the morning edition at the top of the page is built from.
    fetchCityEdition(supabase, cityName, now),
  ])

  const localBusinesses = localBusinessesResult.data ?? []

  const nearbyTowns = areasWithEvents(stripAreas, nearbyEvents)
  // The written intro gains one factual line naming the nearby towns that have
  // shows below (Derby's hand-written intro already says this itself).
  const baseIntro = CITY_GUIDE_INTROS[cityName]
  const introText = baseIntro && !baseIntro.includes('further down this page') && nearbyTowns.length
    ? `${baseIntro} ${nearbyIntroSentence(nearbyTowns)}`
    : baseIntro
  // Only stories from the last CITY_NEWS_MAX_AGE_DAYS days are ever shown. A city
  // with fewer than 3 fresh local stories is topped up with fresh UK-wide ones, so
  // the section is neither stale nor empty (and hides if nothing is fresh at all).
  const newsPick = pickNewsForCityPage(dropNonUkNews(cityNewsResult.data ?? []), dropNonUkNews(nationalNewsResult.data ?? []), now.getTime(), { limit: 8, minLocal: 3 })
  const cityNews = newsPick.items
  const cityStoryEventIds = [...new Set([...tonightEvents, ...eventsThisWeek, ...localEventsRaw, ...topEvents, ...recentlyAdded, ...editionData.onSaleToday, ...editionData.onSaleWeek, ...editionData.presaleOpen, ...editionData.top].map(event => event.id))]
  const cityStories = await fetchStoriesForEventIds(supabase, cityStoryEventIds)
  const newsIsLocal = newsPick.localCount >= 3

  // Morning edition: image-led tiles, a factual headline and a freshness stamp that only shows when
  // the city's data really was refreshed recently.
  // Today's shows have their own prominent Tonight row. Let the edition
  // choose other listings so its image tiles do not repeat those cards.
  const tonightIds = new Set(tonightEvents.map(event => event.id))
  const notTonight = <T extends { id: string }>(rows: T[]) => rows.filter(row => !tonightIds.has(row.id))
  const editionTiles = buildEdition({
    now,
    ...editionData,
    onSaleToday: notTonight(editionData.onSaleToday),
    onSaleWeek: notTonight(editionData.onSaleWeek),
    presaleOpen: notTonight(editionData.presaleOpen),
    top: notTonight(editionData.top),
  })
  const editionHeadlineText = editionHeadline({
    cityName,
    onSaleThisWeek: onsaleGroups.length,
    presaleLive: editionData.presaleOpen.length,
  })
  const editionStamp = freshnessStamp(editionData.lastSyncedAt, now)
  // Each event card gets one placement on the city page, in visual order.
  // The edition and Tonight take priority; lower rails do not repeat them.
  const shownEventIds = new Set([...editionTiles.map(tile => tile.event.id), ...tonightIds])
  const weekEvents = excludePreviouslyShown(eventsThisWeek, shownEventIds)
  const localEvents = excludePreviouslyShown(localEventsRaw, shownEventIds, 12)
  const newEvents = excludePreviouslyShown(recentlyAdded, shownEventIds)
  const upcomingTopEvents = excludePreviouslyShown(topEvents, shownEventIds)
  const editionNav = [
    tonightEvents.length > 0 && { href: '#tonight', label: 'Tonight' },
    weekEvents.length > 0 && { href: '#this-week', label: 'This week' },
    localEvents.length > 0 && { href: '#local', label: 'Local' },
    onsaleGroups.length > 0 && { href: '#on-sale', label: 'On sale' },
    cityNews.length > 0 && { href: '#news', label: 'News' },
  ].filter((x): x is { href: string; label: string } => !!x)

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
      listedEventsCount(supabase, { venueId: v.id, fromISO: nowISO }) as Promise<{ count: number | null }>
    )
  )

  // Build venue event count map and filter to venues with upcoming events
  const countByVenue: Record<string, number> = {}
  candidateVenues.forEach((v, i) => {
    countByVenue[v.id] = venueCountResults[i]?.count ?? 0
  })
  const cityVenues = candidateVenues.filter(v => countByVenue[v.id] > 0)

  // Venue discovery: rank by how much is on (not just room size), label each
  // venue with what it mostly hosts and its next show, and gather venues in the
  // surrounding towns (none for cities without a nearby-areas entry).
  const [venueRows, nearbyVenues] = await Promise.all([
    fetchVenueEventRows(supabase, cityVenues.map(v => v.id)),
    nearbyAreas.length > 0 ? fetchNearbyRankedVenues(supabase, nearbyAreas) : Promise.resolve([]),
  ])
  const rankedVenues = rankVenues(cityVenues, countByVenue, venueRows)
  const { popular: popularVenues, more: moreVenues } = splitPopular(rankedVenues)

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
    { name: 'Events', url: 'https://www.theshowfinder.com/events' },
    { name: cityName, url: canonical },
  ])
  const itemListSchema = buildItemListSchema(
    weekEvents.slice(0, 20).map(ev => ({
      name: ev.title,
      url:  `https://www.theshowfinder.com/events/${ev.slug}`,
    }))
  )
  const collectionSchema = buildCityCollectionSchema({
    cityName,
    url: canonical,
    name: cityPageTitle(cityName),
    description: cityPageDescription(cityName, totalCount),
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
        className="relative py-6 sm:py-14 px-4 sm:px-6 lg:px-8 overflow-hidden"
        style={{ backgroundColor: '#1A1A2E' }}
      >
        {(cityHeroImage || cityLandmarkImage) && (
          <>
            {cityHeroImage && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={cityHeroImage}
                alt={`${cityName} city centre`}
                className="absolute inset-0 w-full h-full object-cover"
              />
            )}
            {cityLandmarkImage && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={cityLandmarkImage}
                alt={`${cityName} landmark`}
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
          {/* Visible breadcrumb (matches the BreadcrumbList JSON-LD below). */}
          <nav aria-label="Breadcrumb" className="text-xs text-white/60 mb-4">
            <ol className="flex flex-wrap items-center gap-1.5">
              <li><Link href="/" className="hover:text-white underline-offset-2 hover:underline">Home</Link></li>
              <li aria-hidden="true">›</li>
              <li><Link href="/events" className="hover:text-white underline-offset-2 hover:underline">Events</Link></li>
              <li aria-hidden="true">›</li>
              <li aria-current="page" className="text-white/90">{cityName}</li>
            </ol>
          </nav>
          <p className="hidden sm:block text-5xl mb-4 select-none">{cityConfig.emoji}</p>
          <h1 className="text-2xl sm:text-4xl font-extrabold text-white mb-1 sm:mb-2">
            Concerts &amp; Live Events in {cityName}
          </h1>
          <p className="text-white/50 text-sm mb-4 sm:mb-8">
            {totalCount > 0
              ? `${totalCount}+ upcoming show${totalCount !== 1 ? 's' : ''}`
              : 'Browse upcoming shows'}
          </p>
          {/* On a phone the page leads with what is on; the site search stays in the header. */}
          <div className="hidden sm:block">
            <Suspense>
              <SearchBarWrapper />
            </Suspense>
          </div>
          <nav aria-label={`${cityName} event links`} className="flex flex-wrap gap-2 sm:gap-3 mt-3 sm:mt-6">
            <Link
              href={`/cities/${encodeURIComponent(cityName)}/this-week`}
              className="rounded-full bg-white/10 px-4 py-2 text-sm font-semibold text-white hover:bg-white/20"
            >
              Events this week
            </Link>
            <Link
              href={`/cities/${encodeURIComponent(cityName)}/this-weekend`}
              className="rounded-full bg-white/10 px-4 py-2 text-sm font-semibold text-white hover:bg-white/20"
            >
              This weekend
            </Link>
            <CalendarSubscribe path={cityFeedPath(cityName)} label={`${cityName} gigs in your calendar`} />
          </nav>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-12 flex flex-col gap-10 sm:gap-14">

        {/* ── LOCAL ENTERTAINMENT NEWS: image-led when city stories match ── */}
        {cityStories.length > 0 ? <CityNewsMosaic cityName={cityName} stories={cityStories} /> : cityNews.length > 0 && (
          <section id="news" className="scroll-mt-20 order-1">
            <div className="mb-7">
              <p className="font-bold text-xs uppercase tracking-widest mb-1" style={{ color: '#E8003D' }}>Latest event news</p>
              <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900">What&apos;s happening in {cityName}</h2>
              <p className="text-sm text-slate-500 mt-1">Recent stories about live events in {cityName}</p>
            </div>
            <NewsCardGrid items={cityNews} context={'city:' + city} scroll />
          </section>
        )}

        {/* ── MORNING EDITION: image-led, built from today's data ── */}
        <div className="order-10"><CityMorningEdition headline={editionHeadlineText} stamp={editionStamp} tiles={editionTiles} nav={editionNav} /></div>

        {/* ── CITY GUIDE INTRO (only renders for cities with a written entry) ── */}
        {CITY_GUIDE_INTROS[cityName] && (
          <div className="order-10"><CityIntro
            cityName={cityName}
            emoji={cityConfig.emoji}
            intro={introText}
            totalCount={totalCount}
            venueCount={cityVenues.length}
            venues={rankedVenues.map(v => ({ name: v.name, slug: v.slug, capacity: v.capacity }))}
          /></div>
        )}

        {/* ── NEWSLETTER (city-scoped) ── */}
        <div className="order-2"><CityNewsletterForm cityName={cityName} /></div>

        {/* ── BROWSE BY TYPE ── */}
        <div className="order-10"><CityBrowse cityName={cityName} counts={categoryCounts} /></div>

        {/* ── TONIGHT (hidden completely when there are no valid events) ── */}
        {tonightEvents.length > 0 && (
          <section id="tonight" className="scroll-mt-20 order-3">
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

        {/* ── WEST END (London only — the best-paying ticket category) ── */}
        {cityName === 'London' && <div className="order-10"><WestEndStrip inline /></div>}

        {/* ── EVENTS THIS WEEK (ticketed shows + local events, merged) ── */}
        {weekEvents.length > 0 && (
          <section id="this-week" className="scroll-mt-20 order-4">
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
            <ScrollRail label={`Events this week in ${cityName}`}>
              {weekEvents.map(event => (
                <EventCard key={event.id} event={event} />
              ))}
            </ScrollRail>
          </section>
        )}

        {/* ── WHAT'S ON LOCALLY: council / venue / tourist-board listings (hidden when none) ── */}
        {localEvents.length > 0 && (
          <section id="local" className="scroll-mt-20 order-10">
            <div className="mb-7">
              <p className="font-bold text-xs uppercase tracking-widest mb-1" style={{ color: '#E8003D' }}>
                Local listings
              </p>
              <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900">
                What&apos;s On Locally in {cityName}
              </h2>
              <p className="text-sm text-slate-500 mt-1">Markets, festivals, workshops and community nights from {cityName}&apos;s own event listings</p>
            </div>
            <ScrollRail label={`What's on locally in ${cityName}`}>
              {localEvents.map(event => (
                <EventCard key={event.id} event={event} />
              ))}
            </ScrollRail>
          </section>
        )}

        {/* ── JUST ADDED: shows first listed in the last 7 days (hidden when fewer than 3) ── */}
        {newEvents.length >= 3 && (
          <section className="order-10">
            <div className="mb-7">
              <p className="font-bold text-xs uppercase tracking-widest mb-1" style={{ color: '#E8003D' }}>
                New this week
              </p>
              <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900">
                Just Added in {cityName}
              </h2>
              <p className="text-sm text-slate-500 mt-1">Shows listed for the first time in the last 7 days</p>
            </div>
            <ScrollRail label={`Just added in ${cityName}`}>
              {newEvents.map(event => (
                <EventCard key={event.id} event={event} />
              ))}
            </ScrollRail>
          </section>
        )}

        {/* ── AROUND THE CITY: nearby towns' shows (hidden when none) ── */}
        {nearbyEvents.length > 0 && (
          <section className="order-10">
            <div className="mb-7">
              <p className="font-bold text-xs uppercase tracking-widest mb-1" style={{ color: '#E8003D' }}>
                Worth the trip
              </p>
              <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900">
                Around {cityName}
              </h2>
              <p className="text-sm text-slate-500 mt-1">
                Upcoming shows in {nearbyTowns.map(t => t.name).join(', ').replace(/, ([^,]*)$/, ' and $1')}
              </p>
            </div>
            <ScrollRail label={`Shows around ${cityName}`}>
              {nearbyEvents.map(event => (
                <EventCard key={event.id} event={event} />
              ))}
            </ScrollRail>
          </section>
        )}

        {/* ── ON SALE THIS WEEK (omit the whole block when empty so the page
             stays focused and does not present a thin empty section to users
             or crawlers) ── */}
        {onsaleGroups.length > 0 && <section id="on-sale" className="scroll-mt-20 order-5">
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
          <ScrollRail label={`On sale this week in ${cityName}`}>
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
                      🗓 {groupDateCount(group)} UK date{groupDateCount(group) !== 1 ? 's' : ''}
                    </p>
                    <div className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg bg-slate-100 text-slate-700">
                      🎟️ {saleBadgeText(group.saleType, group.onsale_date)}
                    </div>
                  </div>
                </Link>
              ))}
          </ScrollRail>
        </section>}

        {/* ── TOP EVENTS (beyond this week, up to ~2 months out) ── */}
        {upcomingTopEvents.length > 0 && (
          <section className="order-6">
            <div className="mb-7">
              <p className="font-bold text-xs uppercase tracking-widest mb-1" style={{ color: '#026CDF' }}>
                Coming up
              </p>
              <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900">
                Top Events in {cityName}
              </h2>
            </div>
            <ScrollRail label={`Top events in ${cityName}`}>
              {upcomingTopEvents.map(event => (
                <EventCard key={event.id} event={event} />
              ))}
            </ScrollRail>
          </section>
        )}

        {/* ── VENUES ── */}
        {cityVenues.length > 0 && (
          <section className="order-10">
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
            <ScrollRail label={`Venues in ${cityName}`} columns={4}>
              {popularVenues.map(venue => (
                <VenueCard key={venue.id} venue={venue} />
              ))}
            </ScrollRail>
            {moreVenues.length > 0 && (
              <div className="mt-6">
                <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-2.5">More venues with shows</p>
                <ul className="flex flex-wrap gap-2">
                  {moreVenues.map(v => (
                    <li key={v.id}>
                      <Link
                        href={`/venues/${v.slug}`}
                        className="inline-flex items-center min-h-[36px] rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 hover:border-slate-400 hover:text-slate-900"
                      >
                        {v.name} <span className="ml-1.5 text-slate-400 font-normal">{v.count}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        )}

        {/* ── VENUES AROUND THE CITY (nearby towns; hidden when none) ── */}
        {nearbyVenues.length > 0 && (
          <section className="order-10">
            <div className="mb-7">
              <p className="font-bold text-xs uppercase tracking-widest mb-1" style={{ color: '#026CDF' }}>
                Nearby
              </p>
              <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900">
                Venues around {cityName}
              </h2>
            </div>
            <ScrollRail label={`Venues around ${cityName}`} columns={4}>
              {nearbyVenues.map(venue => (
                <VenueCard key={venue.id} venue={venue} town={venue.town} />
              ))}
            </ScrollRail>
          </section>
        )}

        {/* ── HOW TICKET COMPARISON WORKS ── */}
        <div className="order-10"><CityTicketSources cityName={cityName} /></div>

        {/* ── GETTING THERE & STAYING (hidden entirely if neither affiliate
             template env var is configured — see hasBookingAffiliate/
             hasTrainlineAffiliate above: an untracked placeholder link is
             never shown in its place) ── */}
        {(hasBookingAffiliate || hasTrainlineAffiliate) && (
          <section className="order-10">
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

        {/* ── LOCAL ADVERTISING (hidden until placements are added) ── */}
        <div className="order-10"><LocalBusinessAds cityName={cityName} businesses={localBusinesses} /></div>

      </div>
    </div>
  )
}
