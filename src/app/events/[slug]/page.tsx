// Cached on the CDN and refreshed in the background (was force-dynamic, which
// rebuilt the page from the database on every request).
export const revalidate = 600

// Opt this dynamic route into on-demand static generation: no pages are built
// ahead of time, but each page is generated on first request, then cached on
// the CDN and refreshed in the background (see `revalidate` above).
export async function generateStaticParams() {
  return []
}

import { cache } from 'react'
import { notFound, redirect } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import type { Metadata } from 'next'
import { createPublicClient } from '@/lib/supabase/public'
import type { EventCategory, EventStatus } from '@/lib/types/database'
import {
  getTicketmasterAffiliateLink, getViagogoAffiliateLink,
  getStubHubAffiliateLink, getGigsbergAffiliateLink, getSeeTicketsAffiliateLink,
} from '@/lib/affiliate'
import { CopyLinkButton } from '@/components/CopyLinkButton'
import { TrackedTicketLink } from '@/components/TrackedTicketLink'
import { jsonLdScript, buildEventSchema, buildBreadcrumbSchema } from '@/lib/jsonld'
import { ticketPurchaseDisabledStatus, LIVE_EVENT_STATUSES } from '@/lib/eventPools'
import { isBareProviderHomepage } from '@/lib/intelligence'
import { getEventSeoAlias } from '@/lib/seoAliases'
import { eventImageUrl } from '@/lib/eventImages'
import { cityPagePath } from '@/lib/cities'
import { createAdminClient } from '@/lib/supabase/admin'
import { pickSeeTicketsPrice, type CatalogueRowPrice } from '@/lib/seeTicketsPrice'
import NewsletterInline from '@/components/NewsletterInline'
import { buildEventFaq, type EventDetails, type VenueDetails } from '@/lib/eventDetails'
import { toArtistEventRows, type ArtistEventLink, type ArtistEventRow } from '@/lib/artistEvents'

// ── Types ──────────────────────────────────────────────────────────────────

interface ArtistRow {
  is_headliner: boolean
  order: number
  artist: { id: string; name: string; genre: string | null; image_url: string | null } | null
}

interface EventDetail {
  id: string
  title: string
  slug: string
  description: string | null
  category: EventCategory
  start_date: string
  end_date: string | null
  doors_time: string | null
  details: EventDetails | null
  image_url: string | null
  price_from: number | null
  price_to: number | null
  currency: string
  tickets_url: string | null
  own_ticket_url: string | null
  viagogo_url: string | null
  stubhub_url: string | null
  gigsberg_url: string | null
  gigsberg_affiliate_url: string | null
  see_tickets_affiliate_url: string | null
  gigsberg_highlighted: boolean
  gigsberg_highlight_until: string | null
  gigsberg_inventory_status: string | null
  status: EventStatus
  tags: string[] | null
  venue: {
    id: string; name: string; slug: string | null; address: string; city: string; postcode: string; website: string | null
    details: VenueDetails | null
  } | null
  artists: ArtistRow[]
}

// ── Data fetching ───────────────────────────────────────────────────────────

const eventSelect = (withDetails: boolean) => `
      id, title, slug, description, category,
      start_date, end_date, doors_time,${withDetails ? ' details,' : ''}
      image_url, price_from, price_to, currency,
      tickets_url, own_ticket_url, viagogo_url, stubhub_url, gigsberg_url, gigsberg_affiliate_url, see_tickets_affiliate_url,
      gigsberg_highlighted, gigsberg_highlight_until, gigsberg_inventory_status, status, tags,
      venue:venues(id, name, slug, address, city, postcode, website${withDetails ? ', details' : ''}),
      artists:event_artists(
        is_headliner, order,
        artist:artists(id, name, genre, image_url)
      )
    `

const getEvent = cache(async (slug: string): Promise<EventDetail | null> => {
  const supabase = createPublicClient()
  let { data, error } = await supabase.from('events').select(eventSelect(true)).eq('slug', slug).single()
  // "details" columns come from migration 049. If that has not been applied
  // yet the query errors; fall back to the original columns so event pages
  // keep working (PGRST116 just means "no such event").
  if (error && error.code !== 'PGRST116') {
    ;({ data, error } = await supabase.from('events').select(eventSelect(false)).eq('slug', slug).single())
  }

  if (error || !data) return null
  const event = data as unknown as EventDetail
  event.details = event.details ?? null
  if (event.venue) event.venue.details = event.venue.details ?? null

  // Ticketmaster's UK feed almost never supplies a price. When this event is
  // matched to a See Tickets listing, use that listing's face-value minimum so
  // the page can say "From £x" (and the Event schema can carry a real price).
  // The catalogue table is not publicly readable, hence the server-side client;
  // any failure just leaves the price blank.
  if (event.price_from == null && event.see_tickets_affiliate_url) {
    try {
      const { data: rows } = await createAdminClient()
        .from('see_tickets_catalogue_events')
        .select('min_price, max_price')
        .eq('matched_event_id', event.id) as unknown as { data: CatalogueRowPrice[] | null }
      const price = pickSeeTicketsPrice(rows)
      if (price) {
        event.price_from = price.from
        event.price_to = price.to
        event.currency = 'GBP'
      }
    } catch (err) {
      console.error('[event] See Tickets price lookup failed', err)
    }
  }
  return event
})

// ── Related events (internal links) ─────────────────────────────────────────

const getRelatedEvents = cache(async (event: EventDetail, headlinerId: string | null) => {
  const supabase = createPublicClient()
  const nowISO = new Date().toISOString()
  const [venueRes, artistRes] = await Promise.all([
    event.venue
      ? supabase
          .from('events')
          .select('id, slug, title, start_date, status')
          .eq('venue_id', event.venue.id)
          .neq('id', event.id)
          .gte('start_date', nowISO)
          .in('status', LIVE_EVENT_STATUSES)
          .order('start_date', { ascending: true })
          .limit(6)
      : Promise.resolve({ data: [] as { id: string; slug: string; title: string; start_date: string; status: string }[] }),
    headlinerId
      ? supabase
          .from('event_artists')
          .select('events!inner(id, slug, title, start_date, status, venue:venues(name, city))')
          .eq('artist_id', headlinerId)
          .neq('events.id', event.id)
          .gte('events.start_date', nowISO)
          .in('events.status', LIVE_EVENT_STATUSES)
          .limit(40)
      : Promise.resolve({ data: [] }),
  ])
  const venueEvents = (venueRes.data ?? []) as { id: string; slug: string; title: string; start_date: string }[]
  const artistEvents: ArtistEventRow[] = toArtistEventRows(artistRes.data as unknown as ArtistEventLink[]).slice(0, 8)
  return { venueEvents, artistEvents }
})

// ── Ticket providers ────────────────────────────────────────────────────────

function buildProviders(event: Pick<EventDetail, 'tickets_url' | 'viagogo_url' | 'stubhub_url' | 'gigsberg_url' | 'gigsberg_affiliate_url' | 'see_tickets_affiliate_url' | 'gigsberg_inventory_status'>) {
  const mainPrimary = event.tickets_url
    ? [{ name: 'Ticketmaster', tagline: 'Official UK tickets', bg: '#026CDF', href: getTicketmasterAffiliateLink(event.tickets_url) }]
    : event.gigsberg_affiliate_url
      ? [{ name: 'Gigsberg', tagline: event.gigsberg_inventory_status === 'available' ? 'Secondary-market tickets via Gigsberg' : 'Check availability on Gigsberg', bg: '#1a1f6e', href: event.gigsberg_affiliate_url }]
    : []
  // See Tickets is an official booking agent (primary, not resale), and it is
  // the only affiliate partner for West End runs — list it with the primary
  // sellers so those pages lead with it.
  const seeTickets = event.see_tickets_affiliate_url
    ? [{ name: 'See Tickets', tagline: 'Official booking agent', bg: '#E4022D', href: getSeeTicketsAffiliateLink(event.see_tickets_affiliate_url) }]
    : []
  const primary = [...mainPrimary, ...seeTickets]
  const resale = [
    ...(event.tickets_url && event.gigsberg_affiliate_url ? [{ name: 'Gigsberg', bg: '#1a1f6e', href: event.gigsberg_affiliate_url }] : []),
    ...(!event.tickets_url && !event.gigsberg_affiliate_url && event.gigsberg_url && !isBareProviderHomepage(event.gigsberg_url) ? [{ name: 'Gigsberg', bg: '#1a1f6e', href: getGigsbergAffiliateLink(event.gigsberg_url) }] : []),
    ...(event.viagogo_url && !isBareProviderHomepage(event.viagogo_url) ? [{ name: 'Viagogo', bg: '#00a650', href: getViagogoAffiliateLink(event.viagogo_url) }] : []),
    ...(event.stubhub_url && !isBareProviderHomepage(event.stubhub_url) ? [{ name: 'StubHub', bg: '#400078', href: getStubHubAffiliateLink(event.stubhub_url) }] : []),
  ]
  return { primary, resale }
}

function isGigsbergUrl(url: string | null) {
  return Boolean(url && /(^|:)\/\/([^/]+\.)?gigsberg\.com(?:\/|$)/i.test(url))
}

// ── Helpers ─────────────────────────────────────────────────────────────────

const categoryLabel: Record<string, string> = {
  concert: 'Concert', theatre: 'Theatre', comedy: 'Comedy', sports: 'Sports', family: 'Family',
}
const categoryEmoji: Record<string, string> = {
  concert: '🎵', theatre: '🎭', comedy: '😂', sports: '⚽', family: '🎠',
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { timeZone: 'Europe/London',
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit' })
}
function fmtPrice(from: number | null, to: number | null, currency: string) {
  if (!from) return null
  const sym = currency === 'GBP' ? '£' : currency
  return to && to !== from ? `${sym}${from} – ${sym}${to}` : `From ${sym}${from}`
}

// ── Metadata ────────────────────────────────────────────────────────────────

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const event    = await getEvent(slug)
  if (!event) return { title: 'Event Not Found' }

  const venue     = event.venue
  const venueStr  = venue ? `${venue.name}, ${venue.city}` : null
  const dateStr   = new Date(event.start_date).toLocaleDateString('en-GB', { timeZone: 'Europe/London',
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })

  // Short date keeps repeat performances (same show, same venue) distinct in
  // search results instead of N identical titles.
  const shortDate = new Date(event.start_date).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/London',
  })
  const title = venueStr
    ? `${event.title} at ${venueStr} – ${shortDate}`
    : `${event.title} – ${shortDate}`

  const description = venue
    ? `Get tickets for ${event.title} at ${venue.name} in ${venue.city} on ${dateStr}. Compare prices from Ticketmaster, See Tickets, Viagogo, StubHub and more.`
    : event.description ?? `${event.title} — find tickets on TheShowFinder`

  const ogImagePath = eventImageUrl(event.image_url, event.category, event.title)
  const ogImage   = new URL(ogImagePath, 'https://www.theshowfinder.com').toString()
  const canonical = `https://www.theshowfinder.com/events/${slug}`

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
        alt:    event.title,
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

// ── Page ────────────────────────────────────────────────────────────────────

export default async function EventPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const seoAlias = getEventSeoAlias(slug)
  if (seoAlias) redirect(`/events/${seoAlias}`)

  const event    = await getEvent(slug)
  if (!event) notFound()

  // Daily Intelligence investigation, 2 Oct 2026: this used to be
  // `status === 'sold_out' || status === 'cancelled'`, which left a
  // postponed event's buy flow fully live (identical to a normal
  // on-sale show) everywhere on this page. Now the same shared
  // predicate every other call site uses (eventPools.ts).
  const isSoldOut  = ticketPurchaseDisabledStatus(event.status)
  // Narrower than isSoldOut (which also covers genuinely sold_out) —
  // gates the sections where resale/our-own-stock genuinely makes no
  // sense at all: Buy Direct, More Options (resale), Also Available.
  // A sold_out show still shows all three; a cancelled/postponed one
  // shows none of them.
  const isCancelledOrPostponed = event.status === 'cancelled' || event.status === 'postponed'
  const priceLabel = fmtPrice(event.price_from, event.price_to, event.currency)
  const imageUrl = eventImageUrl(event.image_url, event.category, event.title)
  const { primary, resale } = buildProviders(event)
  const ownTicketUrl = event.own_ticket_url && !isGigsbergUrl(event.own_ticket_url) ? event.own_ticket_url : null
  const highlightActive = event.gigsberg_highlighted && event.gigsberg_inventory_status === 'available' && (!event.gigsberg_highlight_until || new Date(event.gigsberg_highlight_until) > new Date())
  const headliners = event.artists
    .filter(a => a.is_headliner && a.artist)
    .sort((a, b) => a.order - b.order)

  const doorsLabel = event.doors_time ? fmtTime(event.doors_time) : null
  const venue = event.venue
  const directionsUrl = venue
    ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${venue.name}, ${venue.address}, ${venue.city} ${venue.postcode}`)}`
    : null
  const extraFacts = [
    event.details?.support?.length ? { label: 'Also on the bill', value: event.details.support.join(', ') } : null,
    event.details?.promoter ? { label: 'Promoter', value: event.details.promoter } : null,
    event.details?.age ? { label: 'Age restrictions', value: event.details.age } : null,
    event.details?.ticketLimit ? { label: 'Ticket limit', value: event.details.ticketLimit } : null,
  ].filter((f): f is { label: string; value: string } => !!f)
  const { venueEvents, artistEvents } = await getRelatedEvents(event, headliners[0]?.artist?.id ?? null)
  const faq = buildEventFaq({
    title: event.title,
    venueName: venue?.name ?? null,
    venueAddress: venue ? `${venue.address}, ${venue.postcode}` : null,
    city: venue?.city ?? null,
    dateLabel: fmtDate(event.start_date),
    startLabel: fmtTime(event.start_date),
    doorsLabel,
    status: event.status,
    details: event.details,
    venueDetails: venue?.details ?? null,
    providerNames: [...primary, ...resale].map(p => p.name),
  })
  const shortWhen = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { timeZone: 'Europe/London', weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })

  const canonicalUrl = `https://www.theshowfinder.com/events/${event.slug}`
  const eventSchema = buildEventSchema({
    name:          event.title,
    url:           canonicalUrl,
    startDate:     event.start_date,
    endDate:       event.end_date,
    description:   event.description,
    image:         imageUrl,
    status:        event.status,
    venue:         event.venue,
    priceFrom:     event.price_from,
    priceCurrency: event.currency,
    offerUrl:      primary[0]?.href ?? canonicalUrl,
    performers:    headliners.map(h => h.artist?.name).filter((n): n is string => !!n),
  })
  const breadcrumbSchema = buildBreadcrumbSchema([
    { name: 'Home',   url: 'https://www.theshowfinder.com' },
    { name: 'Events', url: 'https://www.theshowfinder.com/events' },
    ...(event.venue && cityPagePath(event.venue.city) ? [{ name: event.venue.city, url: `https://www.theshowfinder.com${cityPagePath(event.venue.city)}` }] : []),
    { name: event.title, url: canonicalUrl },
  ])

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(eventSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(breadcrumbSchema) }}
      />
      {/* ── HERO ──────────────────────────────────────────────── */}
      <section className="relative text-white overflow-hidden" style={{ backgroundColor: '#1A1A2E' }}>
        {imageUrl && (
          <>
            <Image src={imageUrl} alt={event.title} fill className="object-cover opacity-20" priority />
            <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, #1A1A2E 40%, transparent)' }} />
          </>
        )}

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 md:py-20">
          {/* Breadcrumb */}
          <nav className="text-sm text-white/50 mb-6 flex flex-wrap gap-1 items-center">
            <Link href="/" className="hover:text-white transition-colors">Home</Link>
            <span className="mx-1">/</span>
            <Link href="/events" className="hover:text-white transition-colors">Events</Link>
            <span className="mx-1">/</span>
            <Link href={`/events?category=${event.category}`} className="hover:text-white transition-colors capitalize">
              {categoryLabel[event.category]}
            </Link>
          </nav>

          <div className="flex flex-wrap gap-2 mb-5">
            <span className="text-xs font-bold uppercase tracking-wider text-white px-3 py-1 rounded-full" style={{ backgroundColor: '#E8003D' }}>
              {categoryEmoji[event.category]} {categoryLabel[event.category]}
            </span>
            {event.status === 'on_sale'   && <span className="text-xs font-bold uppercase tracking-wider bg-emerald-500 text-white px-3 py-1 rounded-full">On Sale</span>}
            {event.status === 'sold_out'  && <span className="text-xs font-bold uppercase tracking-wider bg-red-600 text-white px-3 py-1 rounded-full">Sold Out</span>}
            {event.status === 'cancelled' && <span className="text-xs font-bold uppercase tracking-wider bg-red-600 text-white px-3 py-1 rounded-full">Cancelled</span>}
            {event.status === 'postponed' && <span className="text-xs font-bold uppercase tracking-wider bg-orange-500 text-white px-3 py-1 rounded-full">Postponed</span>}
            {highlightActive && <span className="text-xs font-bold uppercase tracking-wider bg-emerald-500 text-white px-3 py-1 rounded-full">Tickets available via Gigsberg</span>}
          </div>

          <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold leading-tight mb-6 max-w-3xl">
            {event.title}
          </h1>

          <div className="flex flex-col sm:flex-row gap-4 sm:gap-8 text-white/80 text-sm mb-8">
            <span className="flex items-center gap-2">📅 <span>{fmtDate(event.start_date)}</span></span>
            {event.venue && <span className="flex items-center gap-2">📍 <span>{event.venue.name}, {event.venue.city}</span></span>}
            {priceLabel && <span className="flex items-center gap-2">💷 <span className="font-bold text-white">{priceLabel}</span></span>}
          </div>

          {/* Desktop primary CTA */}
          {!isSoldOut ? (
            primary[0] ? (
              <TrackedTicketLink
                href={primary[0].href}
                provider={primary[0].name}
                section="hero_cta"
                context={event.slug}
                className="hidden md:inline-flex items-center gap-2 text-white font-extrabold text-lg px-8 py-4 rounded-xl hover:opacity-90 transition-opacity shadow-lg"
                style={{ backgroundColor: '#E8003D' }}
              >
                {primary[0].name === 'Gigsberg' ? 'View tickets on Gigsberg ↗' : 'Get Tickets ↗'}
              </TrackedTicketLink>
            ) : (
              <a
                href="#tickets"
                className="hidden md:inline-flex items-center gap-2 text-white font-extrabold text-lg px-8 py-4 rounded-xl hover:opacity-90 transition-opacity shadow-lg"
                style={{ backgroundColor: '#E8003D' }}
              >
                Get Tickets ↗
              </a>
            )
          ) : event.status === 'cancelled' ? (
            <div className="hidden md:inline-flex items-center bg-slate-700 text-white/60 font-bold text-lg px-8 py-4 rounded-xl cursor-not-allowed">
              Event Cancelled
            </div>
          ) : event.status === 'postponed' ? (
            <div className="hidden md:inline-flex items-center bg-slate-700 text-white/60 font-bold text-lg px-8 py-4 rounded-xl cursor-not-allowed">
              Event Postponed
            </div>
          ) : resale.length > 0 ? (
            <TrackedTicketLink
              href={resale[0].href}
              provider={resale[0].name}
              section="hero_cta"
              context={event.slug}
              className="hidden md:inline-flex items-center gap-2 text-white font-extrabold text-lg px-8 py-4 rounded-xl hover:opacity-90 transition-opacity shadow-lg"
              style={{ backgroundColor: resale[0].bg }}
            >
              Find Resale Tickets ↗
            </TrackedTicketLink>
          ) : (
            <div className="hidden md:inline-flex items-center bg-slate-700 text-white/60 font-bold text-lg px-8 py-4 rounded-xl cursor-not-allowed">
              Sold Out
            </div>
          )}
        </div>
      </section>

      {/* ── MOBILE STICKY BAR ─────────────────────────────────── */}
      {!isSoldOut && (
        <div className="md:hidden fixed bottom-0 inset-x-0 z-50 bg-white border-t-2 px-4 py-3 flex items-center gap-3 shadow-2xl" style={{ borderColor: '#E8003D' }}>
          {priceLabel && (
            <div className="flex-1 min-w-0">
              <p className="text-xs text-slate-500 leading-none mb-0.5">Tickets from</p>
              <p className="text-base font-extrabold text-slate-900 truncate">{priceLabel}</p>
            </div>
          )}
          {primary[0] ? (
            <TrackedTicketLink
              href={primary[0].href}
              provider={primary[0].name}
              section="hero_cta"
              context={event.slug}
              className="flex-none text-white font-extrabold px-6 py-3.5 rounded-xl hover:opacity-90 transition-opacity min-h-[52px] flex items-center text-sm"
              style={{ backgroundColor: '#E8003D' }}
            >
              {primary[0].name === 'Gigsberg' ? 'View tickets on Gigsberg ↗' : 'Get Tickets ↗'}
            </TrackedTicketLink>
          ) : (
            <a
              href="#tickets"
              className="flex-none text-white font-extrabold px-6 py-3.5 rounded-xl hover:opacity-90 transition-opacity min-h-[52px] flex items-center text-sm"
              style={{ backgroundColor: '#E8003D' }}
            >
              Get Tickets ↗
            </a>
          )}
        </div>
      )}
      {event.status === 'sold_out' && resale.length > 0 && (
        <div className="md:hidden fixed bottom-0 inset-x-0 z-50 bg-white border-t-2 px-4 py-3 flex items-center gap-3 shadow-2xl" style={{ borderColor: resale[0].bg }}>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-slate-500 leading-none mb-0.5">Sold out</p>
            <p className="text-base font-extrabold text-slate-900 truncate">Check resale</p>
          </div>
          <TrackedTicketLink
            href={resale[0].href}
            provider={resale[0].name}
            section="hero_cta"
            context={event.slug}
            className="flex-none text-white font-extrabold px-6 py-3.5 rounded-xl hover:opacity-90 transition-opacity min-h-[52px] flex items-center text-sm"
            style={{ backgroundColor: resale[0].bg }}
          >
            Find Resale ↗
          </TrackedTicketLink>
        </div>
      )}

      {/* ── MAIN CONTENT ──────────────────────────────────────── */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 pb-28 md:pb-10" style={{ backgroundColor: '#F5F5F0' }}>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">

          {/* Left */}
          <div className="lg:col-span-2 space-y-10">
            {event.description && (
              <div>
                <h2 className="text-xl font-extrabold text-slate-900 mb-3">About this event</h2>
                <p className="text-slate-600 leading-relaxed whitespace-pre-line">{event.description}</p>
              </div>
            )}

            {headliners.length > 0 && (
              <div>
                <h2 className="text-xl font-extrabold text-slate-900 mb-4">
                  {headliners.length === 1 ? 'Artist' : 'Artists'}
                </h2>
                <div className="flex flex-wrap gap-3">
                  {headliners.map(({ artist }) => artist && (
                    <div key={artist.id} className="flex items-center gap-3 bg-white border border-slate-200 rounded-xl px-4 py-3 shadow-sm">
                      <div className="w-10 h-10 rounded-full flex items-center justify-center text-lg font-extrabold text-white" style={{ backgroundColor: '#E8003D' }}>
                        {artist.name[0]}
                      </div>
                      <div>
                        <p className="font-bold text-slate-900 text-sm">{artist.name}</p>
                        {artist.genre && <p className="text-xs text-slate-500">{artist.genre}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div>
              <h2 className="text-xl font-extrabold text-slate-900 mb-4">Event details</h2>
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="bg-white border border-slate-200 rounded-xl p-4">
                  <dt className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">Date</dt>
                  <dd className="font-semibold text-slate-800">{fmtDate(event.start_date)}</dd>
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-4">
                  <dt className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">Start time</dt>
                  <dd className="font-semibold text-slate-800">{fmtTime(event.start_date)}</dd>
                </div>
                {event.doors_time && (
                  <div className="bg-white border border-slate-200 rounded-xl p-4">
                    <dt className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">Doors open</dt>
                    <dd className="font-semibold text-slate-800">{fmtTime(event.doors_time)}</dd>
                  </div>
                )}
                {extraFacts.map(f => (
                  <div key={f.label} className="bg-white border border-slate-200 rounded-xl p-4 sm:col-span-2">
                    <dt className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">{f.label}</dt>
                    <dd className="text-sm font-semibold text-slate-800">{f.value}</dd>
                  </div>
                ))}
                {event.venue && (
                  <div className="bg-white border border-slate-200 rounded-xl p-4 sm:col-span-2">
                    <dt className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">Venue</dt>
                    <dd className="font-semibold text-slate-800">
                      {event.venue.slug ? (
                        <Link href={`/venues/${event.venue.slug}`} className="hover:underline" style={{ color: '#1A1A2E' }}>
                          {event.venue.name}
                        </Link>
                      ) : event.venue.name}
                    </dd>
                    <dd className="text-sm text-slate-500 mt-0.5">
                      {event.venue.address}, {event.venue.city}, {event.venue.postcode}
                    </dd>
                  </div>
                )}
              </dl>
            </div>

            {(directionsUrl || venue?.details?.parking || venue?.details?.accessibleSeating || venue?.details?.boxOffice || event.details?.seatmapUrl) && (
              <div>
                <h2 className="text-xl font-extrabold text-slate-900 mb-4">Getting there &amp; venue info</h2>
                <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3 text-sm text-slate-600 leading-relaxed">
                  {venue && (
                    <p>
                      <span className="font-semibold text-slate-800">{venue.name}</span>, {venue.address}, {venue.city} {venue.postcode}.
                    </p>
                  )}
                  {venue?.details?.parking && <p><span className="font-semibold text-slate-800">Parking: </span>{venue.details.parking}</p>}
                  {(event.details?.accessibility || venue?.details?.accessibleSeating) && (
                    <p><span className="font-semibold text-slate-800">Accessibility: </span>{[event.details?.accessibility, venue?.details?.accessibleSeating].filter(Boolean).join(' ')}</p>
                  )}
                  {venue?.details?.generalRule && <p><span className="font-semibold text-slate-800">Venue rules: </span>{venue.details.generalRule}</p>}
                  {venue?.details?.boxOffice && <p><span className="font-semibold text-slate-800">Box office: </span>{venue.details.boxOffice}</p>}
                  <div className="flex flex-wrap gap-4 pt-1 font-semibold">
                    {directionsUrl && <a href={directionsUrl} target="_blank" rel="noopener nofollow" style={{ color: '#E8003D' }}>Get directions →</a>}
                    {event.details?.seatmapUrl && <a href={event.details.seatmapUrl} target="_blank" rel="noopener nofollow" style={{ color: '#E8003D' }}>View seating map →</a>}
                  </div>
                </div>
              </div>
            )}

            {faq.length > 0 && (
              <div>
                <h2 className="text-xl font-extrabold text-slate-900 mb-4">Good to know</h2>
                <div className="space-y-5">
                  {faq.map(item => (
                    <div key={item.q}>
                      <h3 className="font-bold text-slate-900 mb-1">{item.q}</h3>
                      <p className="text-slate-600 leading-relaxed">{item.a}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {artistEvents.length > 0 && (
              <div>
                <h2 className="text-xl font-extrabold text-slate-900 mb-4">
                  {headliners[0]?.artist ? `More ${headliners[0].artist.name} dates` : 'More dates'}
                </h2>
                <ul className="divide-y divide-slate-100 bg-white border border-slate-200 rounded-xl">
                  {artistEvents.map(e => (
                    <li key={e.id}>
                      <Link href={`/events/${e.slug}`} className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-slate-50">
                        <span className="font-semibold text-slate-800 text-sm">{e.venueName ?? e.title}{e.venueCity ? `, ${e.venueCity}` : ''}</span>
                        <span className="text-sm text-slate-500 whitespace-nowrap">{shortWhen(e.startDate)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {venue && venueEvents.length > 0 && (
              <div>
                <h2 className="text-xl font-extrabold text-slate-900 mb-4">
                  More at {venue.slug ? <Link href={`/venues/${venue.slug}`} className="hover:underline">{venue.name}</Link> : venue.name}
                </h2>
                <ul className="divide-y divide-slate-100 bg-white border border-slate-200 rounded-xl">
                  {venueEvents.map(e => (
                    <li key={e.id}>
                      <Link href={`/events/${e.slug}`} className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-slate-50">
                        <span className="font-semibold text-slate-800 text-sm">{e.title}</span>
                        <span className="text-sm text-slate-500 whitespace-nowrap">{shortWhen(e.start_date)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <NewsletterInline
              source="event"
              subject={headliners[0]?.artist?.name ?? event.title}
            />
          </div>

          {/* Right: tickets ─────────────────────────────────────── */}
          <div id="tickets" className="space-y-5 lg:sticky lg:top-24 self-start">
            {/* Buy Direct — our own listing, shown above the standard provider sections */}
            {ownTicketUrl && !isCancelledOrPostponed && (
              <div className="relative bg-white border-2 rounded-2xl p-5 pt-6 shadow-sm" style={{ borderColor: '#E8003D' }}>
                <span
                  className="absolute -top-3 left-5 text-[10px] font-extrabold uppercase tracking-widest text-white px-3 py-1 rounded-full"
                  style={{ backgroundColor: '#E8003D' }}
                >
                  Direct
                </span>
                <h3 className="text-xs font-extrabold uppercase tracking-widest mb-1" style={{ color: '#E8003D' }}>
                  Buy Direct
                </h3>
                <p className="text-xs text-slate-400 mb-4">We hold tickets for this event</p>
                <TrackedTicketLink
                  href={ownTicketUrl}
                  provider="TheShowFinder Direct"
                  section="buy_direct"
                  context={event.slug}
                  className="flex items-center justify-center font-extrabold text-white rounded-xl px-5 py-4 hover:opacity-90 transition-opacity min-h-[56px] mb-3"
                  style={{ backgroundColor: '#E8003D' }}
                >
                  Buy Direct →
                </TrackedTicketLink>
                <div className="flex justify-center">
                  <CopyLinkButton
                    link={`https://theshowfinder.com/go/${event.slug}`}
                    label="Copy shareable link"
                  />
                </div>
              </div>
            )}

            {/* Primary tickets */}
            {isSoldOut ? (
              <div className="bg-slate-100 border border-slate-200 rounded-2xl p-6 text-center">
                <p className="text-4xl mb-3">😔</p>
                <p className="font-bold text-slate-700 text-lg">
                  {event.status === 'cancelled'  ? 'Event Cancelled'
                    : event.status === 'postponed' ? 'Event Postponed'
                    : 'Sold Out'}
                </p>
                <p className="text-slate-500 text-sm mt-2">Check below for resale options</p>
              </div>
            ) : (
              <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
                <h3 className="text-xs font-extrabold uppercase tracking-widest text-slate-400 mb-4">{event.tickets_url ? 'Official Tickets' : 'Ticket Marketplace'}</h3>
                <div className="flex flex-col gap-3">
                  {primary.map(({ name, tagline, bg, href }) => (
                    <div key={name}>
                      <TrackedTicketLink
                        href={href}
                        provider={name}
                        section="primary"
                        context={event.slug}
                        className="flex items-center justify-between text-white rounded-xl px-5 py-4 hover:opacity-90 transition-opacity min-h-[60px]"
                        style={{ backgroundColor: bg }}
                      >
                        <div>
                          <p className="font-extrabold text-base leading-none">{name}</p>
                          <p className="text-xs mt-0.5 opacity-70">{tagline}</p>
                        </div>
                        <span className="text-xl ml-3">→</span>
                      </TrackedTicketLink>
                      {(name === 'Ticketmaster' || name === 'See Tickets') && (
                        <div className="mt-2 flex justify-end">
                          <CopyLinkButton link={href} label="Share with friends" />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Additional ticket marketplaces — Ticketmaster stays primary
                whenever it exists; Gigsberg and other providers appear below
                as clearly separated alternatives. */}
            {!isCancelledOrPostponed && resale.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
              <h3 className="text-xs font-extrabold uppercase tracking-widest text-slate-400 mb-1">More Ticket Options</h3>
              <p className="text-xs text-slate-400 mb-4">Compare availability across ticket marketplaces</p>
              <div className="grid grid-cols-2 gap-3">
                {resale.map(({ name, bg, href }) => (
                  <TrackedTicketLink
                    key={name}
                    href={href}
                    provider={name}
                    section="more_options"
                    context={event.slug}
                    className="flex items-center justify-center font-bold text-sm text-white rounded-xl py-3.5 hover:opacity-90 transition-opacity min-h-[48px]"
                    style={{ backgroundColor: bg }}
                  >
                    {name}
                  </TrackedTicketLink>
                ))}
              </div>
              <p className="text-xs text-slate-400 mt-4 leading-relaxed">
                Resale tickets may be priced above face value. Always check the seller&apos;s terms.
              </p>
            </div>
            )}

            {event.tags && event.tags.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {event.tags.map(tag => (
                  <span key={tag} className="text-xs bg-slate-100 text-slate-600 px-3 py-1.5 rounded-full font-medium">
                    #{tag}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
