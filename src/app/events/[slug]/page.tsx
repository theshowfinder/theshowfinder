// Cached on the CDN and refreshed in the background (was force-dynamic, which
// rebuilt the page from the database on every request).
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

import { cache } from 'react'
import { notFound, permanentRedirect, redirect } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import type { Metadata } from 'next'
import { createPublicClient } from '@/lib/supabase/public'
import { isRepeatPerformance } from '@/lib/repeatPerformances'
import { idTailPattern, slugIdTail } from '@/lib/renamedEvents'
import type { EventCategory, EventStatus } from '@/lib/types/database'
import { ticketmasterOutLink, isTicketmasterCommissionEligible, outLink } from '@/lib/affiliate'
import { CopyLinkButton } from '@/components/CopyLinkButton'
import { TrackedTicketLink } from '@/components/TrackedTicketLink'
import { jsonLdScript, buildEventSchema, buildBreadcrumbSchema, earliestOnSale } from '@/lib/jsonld'
import { ticketPurchaseDisabledStatus, LIVE_EVENT_STATUSES, fetchCityEventsAhead } from '@/lib/eventPools'
import { isBareProviderHomepage } from '@/lib/intelligence'
import { getEventSeoAlias } from '@/lib/seoAliases'
import { eventImageUrl, artistPhotoUrl } from '@/lib/eventImages'
import { cityPagePath } from '@/lib/cities'
import { createAdminClient } from '@/lib/supabase/admin'
import { pickSeeTicketsPrice, type CatalogueRowPrice } from '@/lib/seeTicketsPrice'
import NewsletterInline from '@/components/NewsletterInline'
import ShareButton from '@/components/ShareButton'
import { ArtistsInCity, SimilarArtists } from '@/components/RelatedArtists'
import SaveButton from '@/components/SaveButton'
import EventReminder from '@/components/EventReminder'
import { canRemind } from '@/lib/reminders'
import { reissuedEventIds } from '@/lib/onsaleReissued'
import { formatShareWhen } from '@/lib/shareText'
import EventCard from '@/components/EventCard'
import { buildShareText } from '@/lib/shareText'
import { googleCalendarUrl } from '@/lib/ics'
import { displayTitle, londonTimeSuffix, londonTimeOrNull, venueLabel } from '@/lib/displayTitle'
import { buildEventFaq, cleanBoxOffice, cleanVenueNote, type EventDetails, type VenueDetails } from '@/lib/eventDetails'
import ShowDatesList from '@/components/ShowDatesList'
import BeforeTheShow from '@/components/BeforeTheShow'
import { monetisedOwnLink } from '@/lib/ownLinkAffiliate'
import { PLACEMENT_COLUMNS, pickForPage, type Placement } from '@/lib/localPlacements'
import type { ShowDate } from '@/lib/showDates'
import { toArtistEventRows, type ArtistEventLink, type ArtistEventRow } from '@/lib/artistEvents'
import { dropDuplicateEvents } from '@/lib/listedEvents'
import { isSeeTicketsRunPage } from '@/lib/seeTicketsWestEnd'
import { isEventPast } from '@/lib/pastEvents'
import { buildSiblingOffers, type SiblingEvent, type SiblingOffer } from '@/lib/eventOffers'

// ── Types ──────────────────────────────────────────────────────────────────

interface ArtistRow {
  is_headliner: boolean
  order: number
  artist: { id: string; name: string; slug: string | null; genre: string | null; image_url: string | null } | null
}

interface EventDetail {
  id: string
  // Migration 090: set when this listing was merged into another copy of the same show (another room / venue
  // record of the same building, or a council copy). Its page then redirects there.
  merged_into?: string | null
  // Council / tourism listing pages of merged copies: shown only when the event has no seller at all.
  info_links?: { source: string | null; url: string }[] | null
  title: string
  slug: string
  description: string | null
  category: EventCategory
  start_date: string
  end_date: string | null
  onsale_date: string | null
  presale_start: string | null
  public_onsale_start: string | null
  doors_time: string | null
  details: EventDetails | null
  image_url: string | null
  price_from: number | null
  price_to: number | null
  // Migration 097: where the price came from (See Tickets feed, or typed in admin) and the Gigsberg resale floor.
  price_source?: string | null
  price_checked_at?: string | null
  resale_from?: number | null
  resale_source?: string | null
  // Migration 100: Theatre Tickets Direct show page and its from-price (London theatre).
  ttd_url?: string | null
  ttd_price?: number | null
  currency: string
  tickets_url: string | null
  own_ticket_url: string | null
  source: string | null
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
    lat?: number | null; lng?: number | null
    details: VenueDetails | null
  } | null
  artists: ArtistRow[]
}

// ── Data fetching ───────────────────────────────────────────────────────────

const eventSelect = (withDetails: boolean) => `
      id, title, slug, description, category,
      start_date, end_date, onsale_date, presale_start, public_onsale_start, doors_time,${withDetails ? ' details, merged_into, info_links,' : ''}
      image_url, price_from, price_to, currency, price_source, price_checked_at, resale_from, resale_source, ttd_url, ttd_price,
      tickets_url, own_ticket_url, source, viagogo_url, stubhub_url, gigsberg_url, gigsberg_affiliate_url, see_tickets_affiliate_url,
      gigsberg_highlighted, gigsberg_highlight_until, gigsberg_inventory_status, status, tags,
      venue:venues(id, name, slug, address, city, postcode, website, lat, lng${withDetails ? ', details' : ''}),
      artists:event_artists(
        is_headliner, order,
        artist:artists(id, name, slug, genre, image_url)
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
        .eq('matched_event_id', event.id)
        .is('gone_at', null) as unknown as { data: CatalogueRowPrice[] | null }
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

// ── Canonical grouping ──────────────────────────────────────────────────────
// Premium / lounge / VIP packages and repeat source records for the same
// artist + venue + day are grouped under ONE canonical event (migration
// 055/056, event_canonical_map). A duplicate's URL still resolves, but it
// points search engines at the canonical event and stays out of the index;
// the canonical page shows the duplicates' ticket links as extra options.
// An event the map has not seen yet (imported since the last refresh) is
// treated as its own canonical event.
const getCanonicalInfo = cache(async (eventId: string, own: { tickets_url: string | null; see_tickets_affiliate_url: string | null; gigsberg_affiliate_url: string | null }) => {
  const supabase = createPublicClient()
  const none = { canonicalSlug: null as string | null, offers: [] as SiblingOffer[] }
  try {
    const { data: m } = await supabase
      .from('event_canonical_map')
      .select('canonical_id, is_canonical')
      .eq('id', eventId)
      .maybeSingle() as unknown as { data: { canonical_id: string; is_canonical: boolean } | null }
    if (!m) return none
    if (!m.is_canonical) {
      const { data: c } = await supabase.from('events').select('slug').eq('id', m.canonical_id).maybeSingle()
      return { canonicalSlug: (c as { slug: string } | null)?.slug ?? null, offers: [] as SiblingOffer[] }
    }
    const { data: members } = await supabase
      .from('event_canonical_map')
      .select('id, is_package')
      .eq('canonical_id', eventId)
      .neq('id', eventId)
      .limit(40) as unknown as { data: { id: string; is_package: boolean }[] | null }
    const ids = (members ?? []).map(r => r.id)
    if (!ids.length) return none
    const pkg = new Map((members ?? []).map(r => [r.id, r.is_package]))
    const { data: rows } = await supabase
      .from('events')
      .select('id, slug, title, start_date, source, tickets_url, see_tickets_affiliate_url, gigsberg_affiliate_url')
      .in('id', ids)
      .is('merged_into', null)   // a merged copy's seller links were already moved onto this event
      .in('status', LIVE_EVENT_STATUSES)
      .gte('start_date', new Date().toISOString())
    const siblings: SiblingEvent[] = ((rows ?? []) as unknown as Omit<SiblingEvent, 'is_package'>[])
      .map(r => ({ ...r, is_package: pkg.get(r.id) ?? false }))
    return { canonicalSlug: null as string | null, offers: buildSiblingOffers(own, siblings) }
  } catch (err) {
    console.error('[event] canonical grouping lookup failed', err)
    return none
  }
})

// ── Related events (internal links) ─────────────────────────────────────────

const getRelatedEvents = cache(async (event: EventDetail, headlinerId: string | null) => {
  const supabase = createPublicClient()
  const nowISO = new Date().toISOString()
  const [venueRes, artistRes] = await Promise.all([
    event.venue
      ? supabase
          .from('listed_events_with_venue')
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
  const artistEvents: ArtistEventRow[] = (await dropDuplicateEvents(supabase, toArtistEventRows(artistRes.data as unknown as ArtistEventLink[]))).slice(0, 8)
  return { venueEvents, artistEvents }
})

// ── Ticket providers ────────────────────────────────────────────────────────

function buildProviders(event: Pick<EventDetail, 'slug' | 'ttd_url' | 'ttd_price' | 'price_from' | 'price_source' | 'resale_from' | 'presale_start' | 'public_onsale_start' | 'onsale_date' | 'tickets_url' | 'viagogo_url' | 'stubhub_url' | 'gigsberg_url' | 'gigsberg_affiliate_url' | 'see_tickets_affiliate_url' | 'gigsberg_inventory_status'>) {
  const mainPrimary = event.tickets_url
    ? [{ name: 'Ticketmaster', tagline: 'Official UK tickets', bg: '#026CDF', href: ticketmasterOutLink(event.tickets_url, `evt-${event.slug}`) }]
    : event.gigsberg_affiliate_url
      ? [{ name: 'Gigsberg', tagline: event.gigsberg_inventory_status === 'available' ? `Secondary-market tickets via Gigsberg${event.resale_from ? ` · from ${money(event.resale_from, '£')}` : ''}` : 'Check availability on Gigsberg', bg: '#1a1f6e', href: outLink('gb', event.gigsberg_affiliate_url) }]
    : []
  // See Tickets is an official booking agent (primary, not resale), and it is
  // the only affiliate partner for West End runs — list it with the primary
  // sellers so those pages lead with it.
  const stPrice = event.price_source === 'See Tickets' && event.price_from ? ` · from ${money(event.price_from, '£')}` : ''
  const seeTickets = event.see_tickets_affiliate_url
    ? [{ name: 'See Tickets', tagline: (isSeeTicketsRunPage(event.see_tickets_affiliate_url) ? 'Official booking agent · pick your date on their page' : 'Official booking agent') + stPrice, bg: '#E4022D', href: outLink('st', event.see_tickets_affiliate_url, `evt-${event.slug}`) }]
    : []
  // Ticketmaster pays no commission during presale and the first 24 hours of
  // general on-sale. In that window, when See Tickets (the official booking agent,
  // which does pay) also has this show, list it first. Ticketmaster stays right
  // there as the second option, so fans can still get presale access.
  // Theatre Tickets Direct: official London theatre agent (STAR member), from-price from its feed.
  const theatreTicketsDirect = event.ttd_url
    ? [{ name: 'Theatre Tickets Direct', tagline: `Official theatre agent${event.ttd_price ? ` · from ${money(event.ttd_price, '£')}` : ''}`, bg: '#7b1e3a', href: outLink('td', event.ttd_url, `evt-${event.slug}`) }]
    : []
  const primary = !isTicketmasterCommissionEligible(event) && seeTickets.length
    ? [...seeTickets, ...mainPrimary, ...theatreTicketsDirect]
    : [...mainPrimary, ...seeTickets, ...theatreTicketsDirect]
  const resale = [
    ...(event.tickets_url && event.gigsberg_affiliate_url ? [{ name: 'Gigsberg', bg: '#1a1f6e', href: outLink('gb', event.gigsberg_affiliate_url), price: event.resale_from ? `from ${money(event.resale_from, '£')}` : undefined }] : []),
    ...(!event.tickets_url && !event.gigsberg_affiliate_url && event.gigsberg_url && !isBareProviderHomepage(event.gigsberg_url) ? [{ name: 'Gigsberg', bg: '#1a1f6e', href: outLink('gb', event.gigsberg_url) }] : []),
    ...(event.viagogo_url && !isBareProviderHomepage(event.viagogo_url) ? [{ name: 'Viagogo', bg: '#00a650', href: outLink('vg', event.viagogo_url) }] : []),
    ...(event.stubhub_url && !isBareProviderHomepage(event.stubhub_url) ? [{ name: 'StubHub', bg: '#400078', href: outLink('sh', event.stubhub_url) }] : []),
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
// null when the time is not known (midnight London): never show a made-up "00:00".
function fmtTime(iso: string): string | null {
  return londonTimeOrNull(iso)
}
const money = (n: number, sym: string) => `${sym}${Number.isInteger(Number(n)) ? Number(n) : Number(n).toFixed(2)}`
function fmtPrice(from: number | null, to: number | null, currency: string) {
  if (!from) return null
  const sym = currency === 'GBP' || !currency ? '£' : currency
  return to && to !== from ? `${money(from, sym)} – ${money(to, sym)}` : `From ${money(from, sym)}`
}

// ── Metadata ────────────────────────────────────────────────────────────────

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const event    = await getEvent(slug)
  if (!event) return { title: 'Event Not Found' }

  const venue     = event.venue
  const venueStr  = venue ? venueLabel(venue.name, venue.city) : null
  const dateStr   = new Date(event.start_date).toLocaleDateString('en-GB', { timeZone: 'Europe/London',
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })

  // Short date keeps repeat performances (same show, same venue) distinct in
  // search results instead of N identical titles.
  const shortDate = new Date(event.start_date).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/London',
  })
  const title = venueStr
    ? `${displayTitle(event.title)} at ${venueStr} – ${shortDate}`
    : `${displayTitle(event.title)} – ${shortDate}`

  const description = venue
    ? `Get tickets for ${event.title} at ${venue.name} in ${venue.city} on ${dateStr}. Find tickets from official sellers.`
    : event.description ?? `${event.title} — find tickets on TheShowFinder`

  // Branded share card (artwork + date + venue) so a pasted link says where and
  // when, not just who. Falls back to the plain artwork inside the route.
  const ogImage   = `https://www.theshowfinder.com/api/share-image/${encodeURIComponent(slug)}`
  let canonical = `https://www.theshowfinder.com/events/${slug}`

  // A package / duplicate record points at its canonical event and is kept out
  // of search so it never competes with (or thins out) the main listing.
  const grouping = await getCanonicalInfo(event.id, event)
  const isDuplicate = !!grouping.canonicalSlug && grouping.canonicalSlug !== slug
  if (isDuplicate) canonical = `https://www.theshowfinder.com/events/${grouping.canonicalSlug}`

  // Long runs list one event per performance. Only the soonest few are indexed;
  // later dates stay available to visitors but out of search (see repeatPerformances.ts).
  let repeat = false
  if (venue?.id) {
    const { count } = await createPublicClient()
      .from('events')
      .select('id', { count: 'exact', head: true })
      .eq('venue_id', venue.id)
      .eq('title', event.title)
      .in('status', LIVE_EVENT_STATUSES)
      .gte('start_date', new Date().toISOString())
      .lt('start_date', event.start_date)
    repeat = isRepeatPerformance(count ?? 0)
  }

  return {
    title,
    description,
    alternates: { canonical },
    ...(repeat || isDuplicate || isEventPast(event.start_date) || event.status === 'cancelled' ? { robots: { index: false, follow: true } } : {}),
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
  if (!event) {
    // Ticketmaster renamed the show after this link was made: find it by its id tail and send the visitor on.
    const tail = slugIdTail(slug)
    if (tail) {
      const { data: found } = await createPublicClient().from('events').select('slug, ticketmaster_id').like('ticketmaster_id', idTailPattern(tail)).limit(5) as unknown as { data: Array<{ slug: string; ticketmaster_id: string | null }> | null }
      const hits = (found ?? []).filter(e => e.ticketmaster_id?.endsWith(tail) && e.slug !== slug)
      if (hits.length === 1) permanentRedirect(`/events/${hits[0].slug}`)
    }
    notFound()
  }

  // Merged into another listing of the same show (src/lib/venueFamilyMerge.ts): send visitors and search engines
  // there, while that listing is still live. If it is not, this page stands on its own again.
  if (event.merged_into) {
    const { data: kept } = await createPublicClient().from('events').select('slug, status, start_date').eq('id', event.merged_into).maybeSingle() as unknown as { data: { slug: string; status: string; start_date: string } | null }
    if (kept && kept.slug !== slug && LIVE_EVENT_STATUSES.includes(kept.status) && !isEventPast(kept.start_date)) permanentRedirect(`/events/${kept.slug}`)
  }

  // A show that has already happened: say so plainly and point at what is still on,
  // instead of selling tickets that no longer exist.
  if (isEventPast(event.start_date)) {
    const pastHeadliner = event.artists.filter(a => a.is_headliner && a.artist).sort((a, b) => a.order - b.order)[0]?.artist ?? null
    const supabase = createPublicClient()
    const { data: sameShow } = await supabase
      .from('listed_events_with_venue')
      .select('id, slug, title, start_date, venue_name, venue_city')
      .eq('title', event.title)
      .gte('start_date', new Date().toISOString())
      .in('status', LIVE_EVENT_STATUSES)
      .order('start_date', { ascending: true })
      .limit(6) as unknown as { data: { id: string; slug: string; title: string; start_date: string; venue_name: string | null; venue_city: string | null }[] | null }
    const { venueEvents: otherAtVenue, artistEvents: otherDates } = await getRelatedEvents(event, pastHeadliner?.id ?? null)
    const upcoming = (sameShow ?? []).length > 0
      ? (sameShow ?? []).map(e => ({ id: e.id, slug: e.slug, title: e.title, start_date: e.start_date, where: venueLabel(e.venue_name, e.venue_city) }))
      : otherDates.slice(0, 6).map(e => ({ id: e.id, slug: e.slug, title: e.title, start_date: e.startDate, where: venueLabel(e.venueName, e.venueCity) }))
    const more = upcoming.length === 0
      ? otherAtVenue.slice(0, 6).map(e => ({ id: e.id, slug: e.slug, title: e.title, start_date: e.start_date, where: event.venue ? venueLabel(event.venue.name, event.venue.city) : '' }))
      : []
    const list = upcoming.length > 0 ? upcoming : more
    return (
      <section className="max-w-3xl mx-auto px-4 sm:px-6 py-14">
        <p className="inline-block text-xs font-bold uppercase tracking-wider text-white px-3 py-1 rounded-full mb-4" style={{ backgroundColor: '#64748b' }}>This event has passed</p>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 mb-3">{displayTitle(event.title)}</h1>
        <p className="text-slate-600 mb-8">
          {fmtDate(event.start_date)}{event.venue ? ` · ${venueLabel(event.venue.name, event.venue.city)}` : ''}. Tickets for this date are no longer on sale.
        </p>
        {list.length > 0 && (
          <div className="mb-8">
            <h2 className="text-lg font-extrabold text-slate-900 mb-3">{upcoming.length > 0 ? 'Upcoming dates' : 'Also coming up at this venue'}</h2>
            <ul className="divide-y divide-slate-100 border border-slate-200 rounded-2xl bg-white">
              {list.map(e => (
                <li key={e.id}>
                  <Link href={`/events/${e.slug}`} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 px-4 py-3 hover:bg-slate-50">
                    <span className="font-semibold text-slate-900">{displayTitle(e.title)}</span>
                    <span className="text-sm text-slate-500">{fmtDate(e.start_date)}{e.where ? ` · ${e.where}` : ''}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="flex flex-wrap gap-3 text-sm font-semibold">
          {pastHeadliner?.slug && <Link href={`/artists/${pastHeadliner.slug}`} className="underline text-slate-700">All dates for {pastHeadliner.name} →</Link>}
          {event.venue && cityPagePath(event.venue.city) && <Link href={cityPagePath(event.venue.city) as string} className="underline text-slate-700">More in {event.venue.city} →</Link>}
          <Link href="/events" className="underline text-slate-700">Browse all events →</Link>
        </div>
      </section>
    )
  }

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
  // Sold out at Ticketmaster but Gigsberg has it: that is where we send people (and earn).
  const soldOutGigsberg = event.status === 'sold_out' ? resale.find(r => r.name === 'Gigsberg') ?? null : null
  const moreOptions = soldOutGigsberg ? resale.filter(r => r.name !== 'Gigsberg') : resale
  const grouping = await getCanonicalInfo(event.id, event)
  // Local events (council / tourism-board listings: Visit Bristol, Visit Leicester...) keep their listing page in
  // own_ticket_url. That is the organiser's information page, not tickets we hold, so it is never shown as
  // "Buy Direct": it gets a plain "Event details & booking" link below any real ticket sellers instead.
  const isLocalListing = event.category === 'local' || /_council$/.test(event.source ?? '')
  const ownLink = event.own_ticket_url && !isGigsbergUrl(event.own_ticket_url) ? event.own_ticket_url : null
  const ownTicketUrl = isLocalListing ? null : ownLink
  // A merged council / tourism copy's page is kept in info_links: offered only when no seller sells this show.
  const infoLink = !primary.length && !resale.length && !ownTicketUrl ? (event.info_links ?? []).find(l => /^https?:\/\//.test(l.url))?.url ?? null : null
  const localListingUrl = isLocalListing ? ownLink ?? infoLink : infoLink
  const localListingHost = localListingUrl ? (() => { try { return new URL(localListingUrl).hostname.replace(/^www\./, '') } catch { return 'the organiser' } })() : null
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
  // Featured local businesses in this city (paid placement; only live listings are readable).
  let placements: Placement[] = []
  if (venue?.city && event.status !== 'cancelled' && event.status !== 'postponed') {
    try {
      const { data } = await createPublicClient().from('local_businesses').select(PLACEMENT_COLUMNS)
        .ilike('city', venue.city).eq('package', 'featured').limit(30) as unknown as { data: Placement[] | null }
      placements = pickForPage(data ?? [], event.id)
    } catch (err) {
      console.error('[event] local placements lookup failed', err)
    }
  }
  // Every upcoming date of this same show (a tour across towns, or a long run), grouped by city in the browser.
  const SHOW_DATES_LIMIT = 150
  let showDates: ShowDate[] = []
  try {
    const { data } = await (createPublicClient() as unknown as { rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: ShowDate[] | null }> })
      .rpc('show_dates', { p_event_id: event.id, p_limit: SHOW_DATES_LIMIT })
    showDates = data ?? []
  } catch (err) {
    console.error('[event] show_dates lookup failed', err)
  }
  const showAllDates = showDates.length > 1
  const cityEvents = venue?.city
    ? await fetchCityEventsAhead(createPublicClient(), {
        city: venue.city,
        days: 14,
        limit: 6,
        excludeIds: [event.id, ...venueEvents.map(e => e.id), ...artistEvents.map(e => e.id)],
        excludeTitle: event.title,
      }).catch(() => [])
    : []
  const cityHasPage = venue?.city ? cityPagePath(venue.city) : null
  const canShare = event.status !== 'cancelled' && event.status !== 'postponed'
  // Ticketmaster sometimes lists a later "public on-sale" for a show that has long been on sale (held seats re-released); not a first sale, so no "goes on sale" banner or reminder.
  const saleDateUnreliable = (await reissuedEventIds(createPublicClient(), [event.id])).has(event.id)
  const remindable = !saleDateUnreliable && canRemind(event.onsale_date, event.status)
  const onSaleWhen = remindable ? formatShareWhen(event.onsale_date) : null
  const shareText = buildShareText({
    title: event.title,
    venueName: venue?.name ?? null,
    city: venue?.city ?? null,
    startISO: event.start_date,
    status: event.status,
  })
  const calendarLocation = venue ? [venue.name, venue.address, venue.city, venue.postcode].filter(Boolean).join(', ') : null
  const googleCalUrl = googleCalendarUrl({
    uid: event.slug,
    title: event.title,
    startISO: event.start_date,
    location: calendarLocation,
    description: 'Find tickets on TheShowFinder',
    url: `https://www.theshowfinder.com/events/${event.slug}`,
  })
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
  const shortWhen = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { timeZone: 'Europe/London', weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) + londonTimeSuffix(iso)

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
    offerUrl:      canonicalUrl,
    validFrom:     saleDateUnreliable ? earliestOnSale(event.presale_start) : earliestOnSale(event.presale_start, event.public_onsale_start, event.onsale_date),
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
            {displayTitle(event.title)}
          </h1>

          <div className="flex flex-col sm:flex-row gap-4 sm:gap-8 text-white/80 text-sm mb-8">
            <span className="flex items-center gap-2">📅 <span>{fmtDate(event.start_date)}</span></span>
            {event.venue && <span className="flex items-center gap-2">📍 <span>{venueLabel(event.venue.name, event.venue.city)}</span></span>}
            {priceLabel && <span className="flex items-center gap-2">💷 <span className="font-bold text-white">{priceLabel}</span>{event.price_source && <span className="text-white/60 text-xs">{event.price_source} price{event.tickets_url && event.price_source === 'See Tickets' ? ' guide' : ''}</span>}</span>}
          </div>

          {/* Primary CTA — ONE element: a button in the hero on desktop, and the same
              element pinned to the bottom of the screen on phones (so the page carries a
              single "Get Tickets" link, not a desktop copy plus a mobile copy). */}
          {!isSoldOut ? (
            <div
              className="fixed bottom-0 inset-x-0 z-50 bg-white border-t-2 px-4 py-3 flex items-center gap-3 shadow-2xl md:static md:inset-auto md:z-auto md:bg-transparent md:border-0 md:p-0 md:shadow-none md:block"
              style={{ borderColor: '#E8003D' }}
            >
              {priceLabel && (
                <div className="flex-1 min-w-0 md:hidden">
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
                  className="flex-none text-white font-extrabold px-6 py-3.5 rounded-xl hover:opacity-90 transition-opacity min-h-[52px] flex items-center text-sm md:inline-flex md:gap-2 md:text-lg md:px-8 md:py-4 md:min-h-0 md:shadow-lg"
                  style={{ backgroundColor: '#E8003D' }}
                >
                  {primary[0].name === 'Gigsberg' ? 'View tickets on Gigsberg ↗' : 'Get Tickets ↗'}
                </TrackedTicketLink>
              ) : (
                <a
                  href="#tickets"
                  className="flex-none text-white font-extrabold px-6 py-3.5 rounded-xl hover:opacity-90 transition-opacity min-h-[52px] flex items-center text-sm md:inline-flex md:gap-2 md:text-lg md:px-8 md:py-4 md:min-h-0 md:shadow-lg"
                  style={{ backgroundColor: '#E8003D' }}
                >
                  {localListingUrl ? 'Event details & booking ↓' : 'Get Tickets ↗'}
                </a>
              )}
            </div>
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
              {resale[0].name === 'Gigsberg' ? 'Find tickets on Gigsberg ↗' : 'Find Resale Tickets ↗'}
            </TrackedTicketLink>
          ) : (
            <div className="hidden md:inline-flex items-center bg-slate-700 text-white/60 font-bold text-lg px-8 py-4 rounded-xl cursor-not-allowed">
              Sold Out
            </div>
          )}

          {/* Share / calendar */}
          {canShare && (
            <div className="mt-5 flex flex-wrap items-start gap-3">
              <ShareButton
                url={`https://www.theshowfinder.com/events/${event.slug}`}
                title={event.title}
                text={shareText}
                itemId={event.slug}
                variant="dark"
              />
              <SaveButton slug={event.slug} title={event.title} variant="dark" />
              <a
                href={`/events/${event.slug}/calendar.ics`}
                rel="nofollow"
                className="inline-flex items-center justify-center gap-2 min-h-[44px] px-5 rounded-xl border bg-white/10 border-white/30 text-white hover:bg-white/20 text-sm font-bold transition-colors"
              >
                <span aria-hidden="true">📅</span> Add to calendar
              </a>
              <a
                href={googleCalUrl}
                target="_blank"
                rel="noopener nofollow"
                className="inline-flex items-center justify-center min-h-[44px] px-3 text-sm font-semibold text-white/70 hover:text-white underline-offset-2 hover:underline"
              >
                Google Calendar
              </a>
            </div>
          )}
        </div>
      </section>

      {/* The mobile bar for live events is the hero CTA above (one element). */}
      {event.status === 'sold_out' && resale.length > 0 && (
        <div className="md:hidden fixed bottom-0 inset-x-0 z-50 bg-white border-t-2 px-4 py-3 flex items-center gap-3 shadow-2xl" style={{ borderColor: resale[0].bg }}>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-slate-500 leading-none mb-0.5">Sold out</p>
            <p className="text-base font-extrabold text-slate-900 truncate">{resale[0].name === 'Gigsberg' ? 'Tickets on Gigsberg' : 'Check resale'}</p>
          </div>
          <TrackedTicketLink
            href={resale[0].href}
            provider={resale[0].name}
            section="hero_cta"
            context={event.slug}
            className="flex-none text-white font-extrabold px-6 py-3.5 rounded-xl hover:opacity-90 transition-opacity min-h-[52px] flex items-center text-sm"
            style={{ backgroundColor: resale[0].bg }}
          >
            {resale[0].name === 'Gigsberg' ? 'Find tickets ↗' : 'Find Resale ↗'}
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
                    artist.slug ? (
                      <Link
                        key={artist.id}
                        href={`/artists/${artist.slug}`}
                        className="group flex items-center gap-3 bg-white border border-slate-200 rounded-xl px-4 py-3 shadow-sm hover:border-slate-400 hover:shadow-md transition"
                      >
                        <div className="w-10 h-10 rounded-full flex items-center justify-center text-lg font-extrabold text-white overflow-hidden" style={{ backgroundColor: '#E8003D' }}>
                          {artistPhotoUrl(artist.name, artist.image_url) ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={artistPhotoUrl(artist.name, artist.image_url) ?? ''} alt="" className="h-full w-full object-cover object-top" />
                          ) : artist.name[0]}
                        </div>
                        <div>
                          <p className="font-bold text-slate-900 text-sm group-hover:text-red-600 transition-colors">{artist.name}</p>
                          <p className="text-xs text-slate-500">{artist.genre ? `${artist.genre} · ` : ''}All dates &amp; info →</p>
                        </div>
                      </Link>
                    ) : (
                      <div key={artist.id} className="flex items-center gap-3 bg-white border border-slate-200 rounded-xl px-4 py-3 shadow-sm">
                        <div className="w-10 h-10 rounded-full flex items-center justify-center text-lg font-extrabold text-white" style={{ backgroundColor: '#E8003D' }}>
                          {artist.name[0]}
                        </div>
                        <div>
                          <p className="font-bold text-slate-900 text-sm">{artist.name}</p>
                          {artist.genre && <p className="text-xs text-slate-500">{artist.genre}</p>}
                        </div>
                      </div>
                    )
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
                {fmtTime(event.start_date) && (
                  <div className="bg-white border border-slate-200 rounded-xl p-4">
                    <dt className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">Start time</dt>
                    <dd className="font-semibold text-slate-800">{fmtTime(event.start_date)}</dd>
                  </div>
                )}
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

            {(directionsUrl || cleanVenueNote(venue?.details?.parking) || cleanVenueNote(venue?.details?.accessibleSeating) || cleanBoxOffice(venue?.details?.boxOffice) || event.details?.seatmapUrl) && (
              <div>
                <h2 className="text-xl font-extrabold text-slate-900 mb-4">Getting there &amp; venue info</h2>
                <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3 text-sm text-slate-600 leading-relaxed">
                  {venue && (
                    <p>
                      <span className="font-semibold text-slate-800">{venue.name}</span>, {venue.address}, {venue.city} {venue.postcode}.
                    </p>
                  )}
                  {cleanVenueNote(venue?.details?.parking) && <p><span className="font-semibold text-slate-800">Parking: </span>{cleanVenueNote(venue?.details?.parking)}</p>}
                  {(cleanVenueNote(event.details?.accessibility) || cleanVenueNote(venue?.details?.accessibleSeating)) && (
                    <p><span className="font-semibold text-slate-800">Accessibility: </span>{[cleanVenueNote(event.details?.accessibility), cleanVenueNote(venue?.details?.accessibleSeating)].filter(Boolean).join(' ')}</p>
                  )}
                  {venue?.details?.generalRule && <p><span className="font-semibold text-slate-800">Venue rules: </span>{venue.details.generalRule}</p>}
                  {cleanBoxOffice(venue?.details?.boxOffice) && <p><span className="font-semibold text-slate-800">Box office: </span>{cleanBoxOffice(venue?.details?.boxOffice)}</p>}
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

            {showAllDates && <ShowDatesList dates={showDates} currentId={event.id} truncated={showDates.length >= SHOW_DATES_LIMIT} />}

            {!showAllDates && artistEvents.length > 0 && (
              <div>
                <div className="flex items-baseline justify-between gap-4 mb-4">
                  <h2 className="text-xl font-extrabold text-slate-900">
                    {headliners[0]?.artist ? `More ${headliners[0].artist.name} dates` : 'More dates'}
                  </h2>
                  {headliners[0]?.artist?.slug && (
                    <Link href={`/artists/${headliners[0].artist.slug}`} className="text-sm font-semibold underline text-slate-600 whitespace-nowrap">See all dates →</Link>
                  )}
                </div>
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

            {venue && cityEvents.length >= 3 && (
              <div>
                <h2 className="text-xl font-extrabold text-slate-900 mb-4">
                  More in {venue.city} over the next two weeks
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  {cityEvents.map(e => <EventCard key={e.id} event={e} />)}
                </div>
                {cityHasPage && (
                  <div className="flex flex-wrap gap-x-6 gap-y-2 mt-5 text-sm font-semibold">
                    <Link href={`/cities/${encodeURIComponent(venue.city)}/this-weekend`} style={{ color: '#E8003D' }}>
                      Everything on this weekend in {venue.city} →
                    </Link>
                    <Link href={`/cities/${encodeURIComponent(venue.city)}/this-week`} style={{ color: '#E8003D' }}>
                      Everything on this week in {venue.city} →
                    </Link>
                  </div>
                )}
              </div>
            )}

            {venue?.city && (
              <ArtistsInCity city={venue.city} excludeArtistIds={headliners.map(h => h.artist?.id).filter((id): id is string => !!id)} />
            )}
            <SimilarArtists
              genre={headliners[0]?.artist?.genre ?? null}
              excludeArtistIds={headliners.map(h => h.artist?.id).filter((id): id is string => !!id)}
            />

            <NewsletterInline
              source="event"
              subject={headliners[0]?.artist?.name ?? event.title}
            />
          </div>

          {/* Right: tickets ─────────────────────────────────────── */}
          <div id="tickets" className="space-y-5 lg:sticky lg:top-24 self-start">
            {remindable && (
              <EventReminder
                slug={event.slug}
                heading="Not on sale yet? Get an email before it is"
                blurb={`Tickets go on sale ${onSaleWhen ?? 'soon'}. Popular shows can sell out in minutes, so we'll tell you up to a day before.`}
              />
            )}

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
                  href={monetisedOwnLink(ownTicketUrl, `evt-${event.slug}`) ?? ownTicketUrl}
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
            {soldOutGigsberg ? (
              <div className="bg-white border-2 rounded-2xl p-5 shadow-sm" style={{ borderColor: '#1a1f6e' }}>
                <p className="text-xs font-extrabold uppercase tracking-widest text-red-600 mb-1">Sold out at Ticketmaster</p>
                <p className="font-extrabold text-slate-900 text-lg leading-snug mb-4">
                  {event.gigsberg_inventory_status === 'available' ? 'Tickets are still available on Gigsberg' : 'Check ticket availability on Gigsberg'}
                </p>
                <TrackedTicketLink
                  href={soldOutGigsberg.href}
                  provider="Gigsberg"
                  section="primary"
                  context={event.slug}
                  className="flex items-center justify-between text-white rounded-xl px-5 py-4 hover:opacity-90 transition-opacity min-h-[60px]"
                  style={{ backgroundColor: soldOutGigsberg.bg }}
                >
                  <div>
                    <p className="font-extrabold text-base leading-none">Gigsberg</p>
                    <p className="text-xs mt-0.5 opacity-70">Resale marketplace</p>
                  </div>
                  <span className="text-xl ml-3">→</span>
                </TrackedTicketLink>
                <p className="text-xs text-slate-400 mt-3 leading-relaxed">Resale tickets may be priced above face value. Always check the seller&apos;s terms.</p>
              </div>
            ) : isSoldOut ? (
              <div className="bg-slate-100 border border-slate-200 rounded-2xl p-6 text-center">
                <p className="text-4xl mb-3">😔</p>
                <p className="font-bold text-slate-700 text-lg">
                  {event.status === 'cancelled'  ? 'Event Cancelled'
                    : event.status === 'postponed' ? 'Event Postponed'
                    : 'Sold Out'}
                </p>
                <p className="text-slate-500 text-sm mt-2">Check below for resale options</p>
              </div>
            ) : primary.length === 0 && localListingUrl ? null : (
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
                    </div>
                  ))}
                </div>
                {(event.price_source || event.resale_from) && (
                  <p className="text-xs text-slate-400 mt-3 leading-relaxed">
                    Prices shown come from {[event.price_source, event.resale_from ? event.resale_source ?? 'Gigsberg' : null].filter(Boolean).join(' and ')}{event.price_checked_at ? `, checked ${new Date(event.price_checked_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Europe/London' })}` : ''}. Prices can change; the seller shows the final price before you pay.
                  </p>
                )}
              </div>
            )}

            {/* Additional ticket marketplaces — Ticketmaster stays primary
                whenever it exists; Gigsberg and other providers appear below
                as clearly separated alternatives. */}
            {!isCancelledOrPostponed && moreOptions.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
              <h3 className="text-xs font-extrabold uppercase tracking-widest text-slate-400 mb-1">More Ticket Options</h3>
              <p className="text-xs text-slate-400 mb-4">Other ticket marketplaces</p>
              <div className="grid grid-cols-2 gap-3">
                {moreOptions.map(({ name, bg, href, price }: { name: string; bg: string; href: string; price?: string }) => (
                  <TrackedTicketLink
                    key={name}
                    href={href}
                    provider={name}
                    section="more_options"
                    context={event.slug}
                    className="flex flex-col items-center justify-center font-bold text-sm text-white rounded-xl py-3 hover:opacity-90 transition-opacity min-h-[48px]"
                    style={{ backgroundColor: bg }}
                  >
                    <span>{name}</span>
                    {price && <span className="text-[11px] font-semibold opacity-80">{price}</span>}
                  </TrackedTicketLink>
                ))}
              </div>
              <p className="text-xs text-slate-400 mt-4 leading-relaxed">
                Resale tickets may be priced above face value. Always check the seller&apos;s terms.
              </p>
            </div>
            )}

            {/* Local listing (council / tourism board): the organiser's page for times, prices and booking. */}
            {localListingUrl && !isCancelledOrPostponed && (
              <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
                <h3 className="text-xs font-extrabold uppercase tracking-widest text-slate-400 mb-1">Event details &amp; booking</h3>
                <p className="text-xs text-slate-400 mb-4">Listed by {localListingHost}. Times, prices and how to book are on their page.</p>
                <TrackedTicketLink
                  href={monetisedOwnLink(localListingUrl, `evt-${event.slug}`) ?? localListingUrl}
                  provider={`Local listing (${localListingHost})`}
                  section="also_available"
                  context={event.slug}
                  className="flex items-center justify-between rounded-xl px-5 py-4 border-2 border-slate-900 text-slate-900 font-extrabold hover:bg-slate-50 transition-colors min-h-[56px]"
                >
                  <span>Open on {localListingHost}</span>
                  <span className="text-xl ml-3">↗</span>
                </TrackedTicketLink>
              </div>
            )}

            {/* Package / extra-session ticket links merged into this canonical event. */}
            {!isCancelledOrPostponed && grouping.offers.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
              <h3 className="text-xs font-extrabold uppercase tracking-widest text-slate-400 mb-1">Choose Your Ticket Type</h3>
              <p className="text-xs text-slate-400 mb-4">Standard tickets are above. Premium, lounge and VIP options for this same event:</p>
              <div className="grid grid-cols-2 gap-3">
                {grouping.offers.map(o => {
                  const href = o.kind === 'see_tickets'
                    ? outLink('st', o.url, `evt-${event.slug}`)
                    : o.kind === 'gigsberg'
                      ? outLink('gb', o.url)
                      : ticketmasterOutLink(o.url, `evt-${o.fromSlug}`)
                  const bg = o.kind === 'see_tickets' ? '#E4022D' : o.kind === 'gigsberg' ? '#1a1f6e' : '#026CDF'
                  return (
                    <TrackedTicketLink
                      key={o.key}
                      href={href}
                      provider={o.kind === 'see_tickets' ? 'See Tickets' : o.kind === 'gigsberg' ? 'Gigsberg' : 'Ticketmaster'}
                      section="more_options"
                      context={event.slug}
                      className="flex items-center justify-center text-center font-bold text-sm text-white rounded-xl px-2 py-3.5 hover:opacity-90 transition-opacity min-h-[48px]"
                      style={{ backgroundColor: bg }}
                    >
                      {o.label}
                    </TrackedTicketLink>
                  )
                })}
              </div>
            </div>
            )}

            {/* Featured local partners right under the ticket buttons: the moment people plan the rest of the night. */}
            {venue?.city && (
              <BeforeTheShow
                businesses={placements}
                city={venue.city}
                eventId={event.id}
                venue={{ name: venue.name, lat: venue.lat ?? null, lng: venue.lng ?? null }}
              />
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
