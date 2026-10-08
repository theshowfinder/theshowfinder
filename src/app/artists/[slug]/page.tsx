import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import type { Artist, Tour, TourDate } from '@/lib/types/database'
import {
  getTicketmasterAffiliateLink, getSeeTicketsAffiliateLink, getViagogoAffiliateLink,
  getStubHubAffiliateLink, getGigsbergAffiliateLink, getVividSeatsAffiliateLink,
} from '@/lib/affiliate'
import { CopyLinkButton } from '@/components/CopyLinkButton'
import { TrackedTicketLink } from '@/components/TrackedTicketLink'
import { jsonLdScript, buildBreadcrumbSchema } from '@/lib/jsonld'
import { isBareProviderHomepage } from '@/lib/intelligence'
import { getArtistSeoAlias } from '@/lib/seoAliases'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  const supabase  = await createClient()
  const { data: artist } = await supabase
    .from('artists')
    .select('name, bio, image_url')
    .eq('slug', slug)
    .single() as unknown as { data: Pick<Artist, 'name' | 'bio' | 'image_url'> | null }

  if (!artist) return { title: 'Artist Not Found' }

  const title       = `${artist.name} UK Tour Dates & Tickets`
  const description = `Find all ${artist.name} UK tour dates and compare ticket prices from all major providers including Ticketmaster, See Tickets and resale sites.`
  const ogImage     = artist.image_url ?? 'https://www.theshowfinder.com/og-image.png'
  const canonical   = `https://www.theshowfinder.com/artists/${slug}`

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      title:       `${title} | TheShowFinder`,
      description,
      type:        'website',
      url:         canonical,
      images: [{
        url:    ogImage,
        width:  1200,
        height: 630,
        alt:    artist.name,
      }],
    },
    twitter: {
      card:        'summary_large_image',
      title:       `${title} | TheShowFinder`,
      description,
      images:      [ogImage],
    },
  }
}

export default async function ArtistPage({ params }: PageProps) {
  const { slug } = await params
  const seoAlias = getArtistSeoAlias(slug)
  if (seoAlias) redirect(`/artists/${seoAlias}`)

  const supabase = await createClient()

  const { data: artist } = await supabase
    .from('artists')
    .select('*')
    .eq('slug', slug)
    .single() as unknown as { data: Artist | null }

  if (!artist) notFound()

  const { data: tours } = await supabase
    .from('tours')
    .select('*')
    .eq('artist_id', artist.id)
    .order('created_at', { ascending: false })
    .limit(1) as unknown as { data: Tour[] | null }

  const tour = tours?.[0] ?? null

  const { data: tourDates } = tour
    ? await supabase
        .from('tour_dates')
        .select('*')
        .eq('tour_id', tour.id)
        .order('date', { ascending: true }) as unknown as { data: TourDate[] | null }
    : { data: [] as TourDate[] }

  const dates = tourDates ?? []
  const now = new Date().toISOString()
  const upcoming = dates.filter(d => d.date >= now)

  const onSaleLabel = artist.onsale_date
    ? new Date(artist.onsale_date).toLocaleDateString('en-GB', {
        weekday: 'long', day: 'numeric', month: 'long',
        hour: '2-digit', minute: '2-digit',
      }).replace(',', '') + ' GMT'
    : null

  const canonicalUrl = `https://www.theshowfinder.com/artists/${artist.slug}`
  const artistTicketUrl = artist.tickets_url ? getTicketmasterAffiliateLink(artist.tickets_url) : canonicalUrl

  // One MusicEvent per upcoming date, bundled under a single @graph — this is
  // what lets an artist page surface as a rich "tour dates" result in Google.
  const tourEventsSchema = upcoming.map(d => ({
    '@type':    'MusicEvent',
    name:       `${artist.name} — ${d.venue_name}`,
    url:        canonicalUrl,
    startDate:  d.date,
    eventStatus: d.status === 'cancelled' ? 'https://schema.org/EventCancelled' : 'https://schema.org/EventScheduled',
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    location: {
      '@type':  'Place',
      name:     d.venue_name,
      address:  { '@type': 'PostalAddress', addressLocality: d.city, addressCountry: 'GB' },
    },
    // Same rationale as buildEventSchema in src/lib/jsonld.ts: the venue is
    // the best available proxy for "organizer" (no promoter data in the DB),
    // and offers is always present since every tour date has a ticket link
    // to fall back to (the artist's own ticket URL, or the artist page
    // itself) — only `price` stays omitted, since we don't have per-date
    // pricing and won't fabricate a number.
    organizer: { '@type': 'Organization', name: d.venue_name },
    performer: { '@type': 'MusicGroup', name: artist.name },
    offers: {
      '@type':       'Offer',
      url:            artist.tickets_url ? artistTicketUrl : canonicalUrl,
      priceCurrency:  'GBP',
      availability:   'https://schema.org/InStock',
    },
  }))

  const breadcrumbSchema = buildBreadcrumbSchema([
    { name: 'Home',    url: 'https://www.theshowfinder.com' },
    { name: 'On Sale', url: 'https://www.theshowfinder.com/on-sale-this-week' },
    { name: artist.name, url: canonicalUrl },
  ])

  return (
    <div className="min-h-screen bg-[#F5F5F0]">
      {tourEventsSchema.length > 0 && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLdScript({ '@context': 'https://schema.org', '@graph': tourEventsSchema }) }}
        />
      )}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(breadcrumbSchema) }}
      />
      {/* Hero */}
      <div className="relative h-[50vh] min-h-[380px] overflow-hidden bg-slate-900">
        {artist.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={artist.image_url}
            alt={artist.name}
            className="w-full h-full object-cover object-top"
            style={{ filter: 'brightness(0.55)' }}
          />
        ) : (
          <div className="w-full h-full" style={{ background: 'linear-gradient(135deg, #1A1A2E, #E8003D)' }} />
        )}
        <div className="absolute inset-0 flex flex-col justify-end">
          <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 pb-10">
            {artist.tour_name && (
              <p className="text-white/70 text-sm font-semibold uppercase tracking-widest mb-2">
                {artist.tour_name}
              </p>
            )}
            <h1 className="text-5xl sm:text-6xl font-extrabold text-white leading-tight mb-3">
              {artist.name}
            </h1>
            {onSaleLabel && (
              <span className="inline-flex items-center gap-2 text-sm font-bold px-4 py-2 rounded-full text-white" style={{ backgroundColor: '#026CDF' }}>
                🎟️ On sale {onSaleLabel}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="lg:grid lg:grid-cols-3 lg:gap-10">

          {/* Tour dates */}
          <div className="lg:col-span-2">
            {artist.description && (
              <div className="bg-white rounded-2xl p-6 mb-8 shadow-sm border border-slate-200">
                <p className="text-slate-700 leading-relaxed">{artist.description}</p>
              </div>
            )}

            <h2 className="text-xl font-extrabold text-slate-900 mb-5">
              {upcoming.length > 0 ? `${upcoming.length} UK Date${upcoming.length !== 1 ? 's' : ''}` : 'Tour Dates'}
            </h2>

            {dates.length === 0 ? (
              <div className="bg-white rounded-2xl p-8 text-center border border-slate-200 shadow-sm">
                <p className="text-slate-400 text-4xl mb-3">🗓</p>
                <p className="text-slate-500">No dates announced yet — check back soon.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {dates.map(d => {
                  const dt = new Date(d.date)
                  const isPast = d.date < now
                  return (
                    <div
                      key={d.id}
                      className={`bg-white rounded-2xl border border-slate-200 shadow-sm px-6 py-4 flex items-center gap-6 ${isPast ? 'opacity-50' : ''}`}
                    >
                      {/* Date block */}
                      <div className="text-center w-14 shrink-0">
                        <div className="text-xs font-bold uppercase tracking-wider text-slate-400">
                          {dt.toLocaleDateString('en-GB', { month: 'short' })}
                        </div>
                        <div className="text-3xl font-extrabold text-slate-900 leading-none">
                          {dt.getDate()}
                        </div>
                        <div className="text-xs text-slate-400">
                          {dt.toLocaleDateString('en-GB', { weekday: 'short' })}
                        </div>
                      </div>

                      {/* Venue info */}
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-slate-900 truncate">{d.venue_name}</p>
                        <p className="text-sm text-slate-500">{d.city}</p>
                      </div>

                      {/* Status / time */}
                      <div className="text-right shrink-0">
                        <p className="text-sm text-slate-400">
                          {dt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                        </p>
                        {d.status !== 'upcoming' && (
                          <span className="text-xs font-semibold text-orange-600 capitalize">{d.status}</span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="mt-10 lg:mt-0">
            <div className="sticky top-6 space-y-4">
              {artist.tickets_url && (
                <div>
                  <TrackedTicketLink
                    href={getTicketmasterAffiliateLink(artist.tickets_url)}
                    provider="Ticketmaster"
                    section="primary"
                    context={artist.slug}
                    className="block w-full text-center font-bold text-white py-4 px-6 rounded-2xl text-lg shadow-lg hover:opacity-90 transition-opacity"
                    style={{ backgroundColor: '#E8003D' }}
                  >
                    Get Tickets
                  </TrackedTicketLink>
                  <div className="mt-2 flex justify-center">
                    <CopyLinkButton link={getTicketmasterAffiliateLink(artist.tickets_url)} label="Share with friends" />
                  </div>
                </div>
              )}
              {artist.see_tickets_url && (
                <div>
                  <TrackedTicketLink
                    href={getSeeTicketsAffiliateLink(artist.see_tickets_url)}
                    provider="See Tickets"
                    section="primary"
                    context={artist.slug}
                    className="block w-full text-center font-bold text-white py-4 px-6 rounded-2xl text-lg shadow-lg hover:opacity-90 transition-opacity"
                    style={{ backgroundColor: '#e4022d' }}
                  >
                    See Tickets
                  </TrackedTicketLink>
                  <div className="mt-2 flex justify-center">
                    <CopyLinkButton link={getSeeTicketsAffiliateLink(artist.see_tickets_url)} label="Share with friends" />
                  </div>
                </div>
              )}
              {artist.eventim_url && (
                <TrackedTicketLink
                  href={artist.eventim_url}
                  provider="Eventim"
                  section="primary"
                  context={artist.slug}
                  className="block w-full text-center font-bold text-white py-4 px-6 rounded-2xl text-lg shadow-lg hover:opacity-90 transition-opacity"
                  style={{ backgroundColor: '#00a4e0' }}
                >
                  Eventim
                </TrackedTicketLink>
              )}
              {artist.axs_url && (
                <TrackedTicketLink
                  href={artist.axs_url}
                  provider="AXS"
                  section="primary"
                  context={artist.slug}
                  className="block w-full text-center font-bold text-white py-4 px-6 rounded-2xl text-lg shadow-lg hover:opacity-90 transition-opacity"
                  style={{ backgroundColor: '#000000' }}
                >
                  AXS
                </TrackedTicketLink>
              )}
              {artist.gigantic_url && (
                <TrackedTicketLink
                  href={artist.gigantic_url}
                  provider="Gigantic"
                  section="primary"
                  context={artist.slug}
                  className="block w-full text-center font-bold text-white py-4 px-6 rounded-2xl text-lg shadow-lg hover:opacity-90 transition-opacity"
                  style={{ backgroundColor: '#e4022d' }}
                >
                  Gigantic
                </TrackedTicketLink>
              )}

              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
                <h3 className="font-bold text-slate-900">Tour Info</h3>
                {artist.tour_name && (
                  <div>
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Tour</p>
                    <p className="text-slate-900 font-medium">{artist.tour_name}</p>
                  </div>
                )}
                {onSaleLabel && (
                  <div>
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">On Sale</p>
                    <p className="text-slate-900 font-medium">{onSaleLabel}</p>
                  </div>
                )}
                {upcoming.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">UK Dates</p>
                    <p className="text-slate-900 font-medium">{upcoming.length} show{upcoming.length !== 1 ? 's' : ''}</p>
                  </div>
                )}
              </div>

              {/* Secondary market */}
              {[
                artist.gigsberg_url && !isBareProviderHomepage(artist.gigsberg_url) ? { name: 'Gigsberg', bg: '#1a1f6e', href: getGigsbergAffiliateLink(artist.gigsberg_url) } : null,
                artist.viagogo_url && !isBareProviderHomepage(artist.viagogo_url) ? { name: 'Viagogo', bg: '#00a650', href: getViagogoAffiliateLink(artist.viagogo_url) } : null,
                artist.stubhub_url && !isBareProviderHomepage(artist.stubhub_url) ? { name: 'StubHub', bg: '#400078', href: getStubHubAffiliateLink(artist.stubhub_url) } : null,
                artist.vivid_seats_url && !isBareProviderHomepage(artist.vivid_seats_url) ? { name: 'Vivid Seats', bg: '#02044a', href: getVividSeatsAffiliateLink(artist.vivid_seats_url) } : null,
              ].filter(Boolean).length > 0 && <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                <h3 className="font-bold text-slate-900 mb-0.5">Available Now</h3>
                <p className="text-xs text-slate-400 mb-4">Tickets available on secondary market</p>
                <div className="space-y-2">
                  {[
                    ...(artist.gigsberg_url && !isBareProviderHomepage(artist.gigsberg_url) ? [{ name: 'Gigsberg', bg: '#1a1f6e', href: getGigsbergAffiliateLink(artist.gigsberg_url) }] : []),
                    ...(artist.viagogo_url && !isBareProviderHomepage(artist.viagogo_url) ? [{ name: 'Viagogo', bg: '#00a650', href: getViagogoAffiliateLink(artist.viagogo_url) }] : []),
                    ...(artist.stubhub_url && !isBareProviderHomepage(artist.stubhub_url) ? [{ name: 'StubHub', bg: '#400078', href: getStubHubAffiliateLink(artist.stubhub_url) }] : []),
                    ...(artist.vivid_seats_url && !isBareProviderHomepage(artist.vivid_seats_url) ? [{ name: 'Vivid Seats', bg: '#02044a', href: getVividSeatsAffiliateLink(artist.vivid_seats_url) }] : []),
                  ].map(({ name, bg, href }) => (
                    <TrackedTicketLink
                      key={name}
                      href={href}
                      provider={name}
                      section="secondary_market"
                      context={artist.slug}
                      className="block w-full text-center font-bold text-white py-2.5 px-4 rounded-xl text-sm hover:opacity-90 transition-opacity"
                      style={{ backgroundColor: bg }}
                    >
                      {name}
                    </TrackedTicketLink>
                  ))}
                </div>
              </div>}

              <Link
                href="/on-sale-this-week"
                className="block text-center text-sm font-semibold py-3 px-5 rounded-xl border-2 border-slate-200 text-slate-600 hover:border-slate-400 transition-colors"
              >
                ← All on-sale this week
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
