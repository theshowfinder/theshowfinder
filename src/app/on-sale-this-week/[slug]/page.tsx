export const revalidate = 21600
// A page render that takes longer than this has hit a database problem: stop and keep serving the cached copy
// instead of holding a function open for 5 minutes (29 Oct 2026 outage: 26,000 renders stuck for 300s each).
export const maxDuration = 60

// Opt this dynamic route into on-demand static generation: no pages are built
// ahead of time, but each page is generated on first request, then cached on
// the CDN and refreshed in the background (see `revalidate` above).
export async function generateStaticParams() {
  return []
}

import { fetchAllArtists } from '@/lib/allArtists'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import { createPublicClient } from '@/lib/supabase/public'
import { groupEventsByArtist, fmtOnSaleLabel, mergeEventsById, mergeTourDates } from '@/lib/on-sale'
import { fetchOnSaleThisWeekEvents, fetchPresalesOpenNowEvents, fetchOtherTourDates } from '@/lib/eventPools'
import { TrackedTicketLink } from '@/components/TrackedTicketLink'
import FollowButton from '@/components/FollowButton'
import SaveButton from '@/components/SaveButton'
import ShareButton from '@/components/ShareButton'
import { ArtistsInCity, SimilarArtists } from '@/components/RelatedArtists'
import { buildArtistShareText } from '@/lib/shareText'
import { isBareProviderHomepage } from '@/lib/intelligence'
import type { EventWithVenue } from '@/lib/types/database'
import { ticketmasterOutLink, outLink } from '@/lib/affiliate'

interface PageProps {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug }  = await params
  const supabase  = createPublicClient()

  // Resolves against the UNION of the same two pools that produce the
  // "On Sale This Week" and "Presales Open Now" cards elsewhere on the site
  // (home/city pages), via the shared helpers in eventPools.ts. Previously
  // this page ran its own narrower, differently-sorted query, so a card
  // that was correctly shown elsewhere (e.g. a presale opened 4-21 days ago,
  // which only "Presales Open Now" looks back that far for) could 404 here.
  // See src/lib/on-sale.ts for the window/merge helpers.
  const [onSaleEvents, presaleEvents, arResult] = await Promise.all([
    fetchOnSaleThisWeekEvents(supabase, { fetchLimit: 1000 }),
    fetchPresalesOpenNowEvents(supabase, { fetchLimit: 1000 }),
    fetchAllArtists(supabase).then(data => ({ data })),
  ])

  const merged = mergeEventsById(onSaleEvents, presaleEvents)
  const group  = groupEventsByArtist(merged, arResult.data ?? []).find(g => g.slug === slug)
  if (!group) return { title: 'On Sale This Week' }

  const title       = `${group.artistName} — On Sale This Week`
  const socialTitle = `${title} | TheShowFinder`
  const description = `${group.events.length} UK date${group.events.length !== 1 ? 's' : ''} going on sale ${fmtOnSaleLabel(group.onsale_date)}`
  const canonical    = `https://www.theshowfinder.com/on-sale-this-week/${slug}`
  const ogImage      = 'https://www.theshowfinder.com/og-image.png'

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      title: socialTitle,
      description,
      type:   'website',
      url:    canonical,
      images: [{ url: ogImage, width: 1200, height: 630, alt: title }],
    },
    twitter: {
      card: 'summary_large_image',
      title: socialTitle,
      description,
      images: [ogImage],
    },
  }
}

export default async function OnSaleArtistPage({ params }: PageProps) {
  const { slug }   = await params
  const supabase   = createPublicClient()
  const nowISO     = new Date().toISOString()

  // Resolves against the UNION of the "On Sale This Week" pool (public
  // onsale/presale opening within the -3d/+7d window) and the "Presales
  // Open Now" pool (presale opened within the last 21 days and still open)
  // via the shared helpers in src/lib/eventPools.ts — the same pools that
  // produce the cards on the homepage and city pages. This page used to run
  // its own hand-rolled, narrower (-3d only) query sorted by a different
  // column with a lossy ILIKE title-reconstruction fallback, which meant a
  // card shown correctly elsewhere (e.g. a presale opened 4-21 days ago)
  // could 404 here. See src/lib/on-sale.ts for onSaleThisWeekWindow /
  // presaleOpenNowWindow / mergeEventsById.
  const [onSaleEvents, presaleEvents, arResult] = await Promise.all([
    fetchOnSaleThisWeekEvents(supabase, { fetchLimit: 1000 }),
    fetchPresalesOpenNowEvents(supabase, { fetchLimit: 1000 }),
    fetchAllArtists(supabase).then(data => ({ data })),
  ])

  const groups = groupEventsByArtist(mergeEventsById(onSaleEvents, presaleEvents), arResult.data ?? [])
  const group  = groups.find(g => g.slug === slug)
  if (!group) notFound()

  const { artistName, image_url, onsale_date, saleType, dbArtist } = group

  // The pools above only hold dates whose sale starts this week. Pull in the
  // artist's other upcoming dates too, so the page shows the whole tour.
  // Same helper the cards use for their "N UK dates", so the tile and this list always agree.
  const otherEvents: EventWithVenue[] = (await fetchOtherTourDates(supabase, [group], '*')).get(group.slug) ?? []
  const { events, newIds } = mergeTourDates(group.events, otherEvents)
  const newCount = events.filter(e => newIds.has(e.id)).length
  const onSaleLabel = fmtOnSaleLabel(onsale_date)
  const isPresale   = saleType === 'presale'

  const firstTicketUrl = events[0]?.tickets_url ?? null

  // Secondary market links using artist name
  const secondaryMarket = [
    dbArtist?.gigsberg_url && !isBareProviderHomepage(dbArtist.gigsberg_url) ? { name: 'Gigsberg', bg: '#1a1f6e', href: outLink('gb', dbArtist.gigsberg_url) } : null,
    dbArtist?.viagogo_url && !isBareProviderHomepage(dbArtist.viagogo_url) ? { name: 'Viagogo', bg: '#00a650', href: outLink('vg', dbArtist.viagogo_url) } : null,
    dbArtist?.stubhub_url && !isBareProviderHomepage(dbArtist.stubhub_url) ? { name: 'StubHub', bg: '#400078', href: outLink('sh', dbArtist.stubhub_url) } : null,
    dbArtist?.vivid_seats_url && !isBareProviderHomepage(dbArtist.vivid_seats_url) ? { name: 'Vivid Seats', bg: '#02044a', href: outLink('vs', dbArtist.vivid_seats_url) } : null,
  ].filter((offer): offer is { name: string; bg: string; href: string } => offer !== null)

  return (
    <div className="min-h-screen bg-[#F5F5F0]">

      {/* Hero */}
      <div className="relative h-[50vh] min-h-[380px] overflow-hidden bg-slate-900">
        {image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={image_url}
            alt={artistName}
            className="w-full h-full object-cover object-top"
            style={{ filter: 'brightness(0.55)' }}
          />
        ) : (
          <div className="w-full h-full" style={{ background: 'linear-gradient(135deg, #1A1A2E, #E8003D)' }} />
        )}
        <div className="absolute inset-0 flex flex-col justify-end">
          <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 pb-10">
            <p className="text-white/70 text-sm font-semibold uppercase tracking-widest mb-2">
              {dbArtist?.tour_name ?? 'On Sale This Week'}
            </p>
            <h1 className="text-5xl sm:text-6xl font-extrabold text-white leading-tight mb-3">
              {artistName}
            </h1>
            <div className="flex flex-wrap items-start gap-3">
              <span className="inline-flex items-center gap-2 text-sm font-bold px-4 min-h-[44px] rounded-full text-white" style={{ backgroundColor: isPresale ? '#E8003D' : '#026CDF' }}>
                🎟️ {isPresale ? 'Presale opens' : 'On sale'} {onSaleLabel}
              </span>
              {dbArtist?.slug && (
                <FollowButton kind="artist" slug={dbArtist.slug} name={artistName} source="onsale" />
              )}
              <ShareButton
                url={dbArtist?.slug ? `https://www.theshowfinder.com/artists/${dbArtist.slug}` : `https://www.theshowfinder.com/on-sale-this-week/${slug}`}
                title={`${artistName} tickets`}
                text={buildArtistShareText(artistName, events.length)}
                itemId={dbArtist?.slug ?? slug}
                contentType="artist"
                variant="dark"
                label="Share"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="lg:grid lg:grid-cols-3 lg:gap-10">

          {/* Events list */}
          <div className="lg:col-span-2">
            {dbArtist?.description && (
              <div className="bg-white rounded-2xl p-6 mb-8 shadow-sm border border-slate-200">
                <p className="text-slate-700 leading-relaxed">{dbArtist.description}</p>
              </div>
            )}

            <h2 className="text-xl font-extrabold text-slate-900 mb-1">
              {events.length} UK Date{events.length !== 1 ? 's' : ''}
            </h2>
            <p className="text-sm text-slate-500 mb-5">
              {newCount === events.length
                ? `All dates ${isPresale ? 'in presale' : 'on sale'} ${onSaleLabel}.`
                : `${newCount} newly ${isPresale ? 'in presale' : 'on sale'} (marked New) — plus the rest of the tour.`}
            </p>

            <div className="space-y-3">
              {events.map(event => {
                const dt     = new Date(event.start_date)
                const isPast = event.start_date < nowISO
                return (
                  <div
                    key={event.id}
                    className={`bg-white rounded-2xl border border-slate-200 shadow-sm px-6 py-4 flex items-center gap-6 ${isPast ? 'opacity-50' : ''}`}
                  >
                    {/* Date block */}
                    <div className="text-center w-14 shrink-0">
                      <div className="text-xs font-bold uppercase tracking-wider text-slate-400">
                        {dt.toLocaleDateString('en-GB', { timeZone: 'Europe/London', month: 'short' })}
                      </div>
                      <div className="text-3xl font-extrabold text-slate-900 leading-none">
                        {dt.getDate()}
                      </div>
                      <div className="text-xs text-slate-400">
                        {dt.toLocaleDateString('en-GB', { timeZone: 'Europe/London', weekday: 'short' })}
                      </div>
                    </div>

                    {/* Venue info */}
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-slate-900 truncate">
                        {event.venue_name}
                        {newIds.has(event.id) && newCount !== events.length && (
                          <span className="ml-2 align-middle text-[10px] font-extrabold uppercase tracking-wide text-white px-1.5 py-0.5 rounded" style={{ backgroundColor: '#E8003D' }}>New</span>
                        )}
                      </p>
                      <p className="text-sm text-slate-500">{event.venue_city}</p>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {dt.toLocaleTimeString('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>

                    <SaveButton slug={event.slug} title={event.title} variant="card" />

                    {/* Price + ticket link */}
                    <div className="shrink-0 text-right">
                      {event.price_from && (
                        <p className="text-sm font-bold text-slate-800 mb-1">
                          {event.currency === 'GBP' ? '£' : event.currency}{event.price_from}
                          {event.price_to && event.price_to !== event.price_from
                            ? `–${event.currency === 'GBP' ? '£' : event.currency}${event.price_to}`
                            : ''}
                        </p>
                      )}
                      {event.tickets_url && !isPast ? (
                        <TrackedTicketLink
                          href={ticketmasterOutLink(event.tickets_url)}
                          provider="Ticketmaster"
                          section="primary"
                          context={slug}
                          className="inline-block text-xs font-bold text-white px-3 py-1.5 rounded-lg hover:opacity-90 transition-opacity"
                          style={{ backgroundColor: '#E8003D' }}
                        >
                          Get Tickets
                        </TrackedTicketLink>
                      ) : (
                        <Link
                          href={`/events/${event.slug}`}
                          className="inline-block text-xs font-bold text-white px-3 py-1.5 rounded-lg hover:opacity-90 transition-opacity"
                          style={{ backgroundColor: '#E8003D' }}
                        >
                          View
                        </Link>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="mt-10 space-y-10">
              {events[0]?.venue_city && <ArtistsInCity city={events[0].venue_city} excludeArtistIds={dbArtist ? [dbArtist.id] : []} />}
              <SimilarArtists genre={dbArtist?.genre ?? null} excludeArtistIds={dbArtist ? [dbArtist.id] : []} />
            </div>
          </div>

          {/* Sidebar */}
          <div className="mt-10 lg:mt-0">
            <div className="sticky top-6 space-y-4">

              {/* Primary ticket sources */}
              {(dbArtist?.tickets_url ?? firstTicketUrl) && (
                <TrackedTicketLink
                  href={ticketmasterOutLink(dbArtist?.tickets_url ?? firstTicketUrl!)}
                  provider="Ticketmaster"
                  section="primary"
                  context={slug}
                  className="block w-full text-center font-bold text-white py-4 px-6 rounded-2xl text-lg shadow-lg hover:opacity-90 transition-opacity"
                  style={{ backgroundColor: '#E8003D' }}
                >
                  Get Tickets
                </TrackedTicketLink>
              )}
              {dbArtist?.see_tickets_url && (
                <TrackedTicketLink href={outLink('st', dbArtist.see_tickets_url)} provider="See Tickets" section="primary" context={slug}
                  className="block w-full text-center font-bold text-white py-4 px-6 rounded-2xl text-lg shadow-lg hover:opacity-90 transition-opacity"
                  style={{ backgroundColor: '#e4022d' }}>
                  See Tickets
                </TrackedTicketLink>
              )}
              {dbArtist?.eventim_url && (
                <TrackedTicketLink href={outLink('ev', dbArtist.eventim_url)} provider="Eventim" section="primary" context={slug}
                  className="block w-full text-center font-bold text-white py-4 px-6 rounded-2xl text-lg shadow-lg hover:opacity-90 transition-opacity"
                  style={{ backgroundColor: '#00a4e0' }}>
                  Eventim
                </TrackedTicketLink>
              )}
              {dbArtist?.axs_url && (
                <TrackedTicketLink href={dbArtist.axs_url} provider="AXS" section="primary" context={slug}
                  className="block w-full text-center font-bold text-white py-4 px-6 rounded-2xl text-lg shadow-lg hover:opacity-90 transition-opacity"
                  style={{ backgroundColor: '#000000' }}>
                  AXS
                </TrackedTicketLink>
              )}
              {dbArtist?.gigantic_url && (
                <TrackedTicketLink href={dbArtist.gigantic_url} provider="Gigantic" section="primary" context={slug}
                  className="block w-full text-center font-bold text-white py-4 px-6 rounded-2xl text-lg shadow-lg hover:opacity-90 transition-opacity"
                  style={{ backgroundColor: '#e4022d' }}>
                  Gigantic
                </TrackedTicketLink>
              )}

              {/* Tour info box */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
                <h3 className="font-bold text-slate-900">Tour Info</h3>
                {dbArtist?.tour_name && (
                  <div>
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Tour</p>
                    <p className="text-slate-900 font-medium">{dbArtist.tour_name}</p>
                  </div>
                )}
                <div>
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{isPresale ? 'Presale' : 'On Sale'}</p>
                  <p className="text-slate-900 font-medium">{onSaleLabel}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">UK Dates</p>
                  <p className="text-slate-900 font-medium">{events.length} show{events.length !== 1 ? 's' : ''}</p>
                </div>
              </div>

              {/* Secondary market */}
              {secondaryMarket.length > 0 && <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                <h3 className="font-bold text-slate-900 mb-0.5">Available Now</h3>
                <p className="text-xs text-slate-400 mb-4">Tickets available on secondary market</p>
                <div className="space-y-2">
                  {secondaryMarket.map(({ name, bg, href }) => (
                    <TrackedTicketLink
                      key={name}
                      href={href}
                      provider={name}
                      section="secondary_market"
                      context={slug}
                      className="block w-full text-center font-bold text-white py-2.5 px-4 rounded-xl text-sm hover:opacity-90 transition-opacity"
                      style={{ backgroundColor: bg }}
                    >
                      {name}
                    </TrackedTicketLink>
                  ))}
                </div>
              </div>}

              {dbArtist?.slug && (
                <Link
                  href={`/artists/${dbArtist.slug}`}
                  className="block text-center text-sm font-bold py-3 px-5 rounded-xl bg-slate-900 text-white hover:bg-slate-700 transition-colors"
                >
                  All {artistName} dates &amp; tickets →
                </Link>
              )}
              <Link
                href="/on-sale-this-week"
                className="block text-center text-sm font-semibold py-3 px-5 rounded-xl border-2 border-slate-200 text-slate-600 hover:border-slate-400 transition-colors"
              >
                ← All on sale this week
              </Link>
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
