export const dynamic = 'force-dynamic'

import { cache } from 'react'
import { notFound } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import type { EventCategory, EventStatus } from '@/lib/types/database'

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
  image_url: string | null
  price_from: number | null
  price_to: number | null
  currency: string
  tickets_url: string | null
  status: EventStatus
  tags: string[] | null
  venue: {
    id: string; name: string; address: string; city: string; postcode: string; website: string | null
  } | null
  artists: ArtistRow[]
}

// ── Data fetching ───────────────────────────────────────────────────────────

const getEvent = cache(async (slug: string): Promise<EventDetail | null> => {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('events')
    .select(`
      id, title, slug, description, category,
      start_date, end_date, doors_time,
      image_url, price_from, price_to, currency,
      tickets_url, status, tags,
      venue:venues(id, name, address, city, postcode, website),
      artists:event_artists(
        is_headliner, order,
        artist:artists(id, name, genre, image_url)
      )
    `)
    .eq('slug', slug)
    .single()

  if (error || !data) return null
  return data as unknown as EventDetail
})

// ── Ticket providers ────────────────────────────────────────────────────────

function buildProviders(title: string, directUrl: string | null) {
  const q = encodeURIComponent(title)
  const primary = [
    { name: 'Ticketmaster', tagline: 'Official UK tickets', bg: '#026CDF', href: directUrl ?? `https://www.ticketmaster.co.uk/search?q=${q}` },
    { name: 'See Tickets',  tagline: 'Official tickets',    bg: '#e4022d', href: 'https://www.seetickets.com' },
    { name: 'Eventim',      tagline: 'Book direct',         bg: '#00a4e0', href: 'https://www.eventim.co.uk' },
  ]
  const resale = [
    { name: 'Viagogo',     bg: '#00a650', href: `https://www.viagogo.co.uk/ww/SearchResults?q=${q}` },
    { name: 'StubHub',     bg: '#400078', href: `https://www.stubhub.co.uk/srp/?q=${q}` },
    { name: 'Gigsberg',    bg: '#1a1f6e', href: `https://www.gigsberg.com/tickets?q=${q}` },
    { name: 'Vivid Seats', bg: '#02044a', href: `https://www.vividseats.com/search?searchTerm=${q}` },
  ]
  const also = [
    { name: 'Eventbrite',  bg: '#f05537',              href: `https://www.eventbrite.co.uk/d/united-kingdom/${q}/` },
    { name: 'Skiddle',     bg: '#ffcc00', color: '#111111', href: 'https://www.skiddle.com' },
    { name: 'Seat Unique', bg: '#1e3a5f', href: `https://www.seatunique.com/search?q=${q}` },
  ]
  return { primary, resale, also }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

const categoryLabel: Record<string, string> = {
  concert: 'Concert', theatre: 'Theatre', comedy: 'Comedy', sports: 'Sports', family: 'Family',
}
const categoryEmoji: Record<string, string> = {
  concert: '🎵', theatre: '🎭', comedy: '😂', sports: '⚽', family: '🎠',
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
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

  const description = event.description ?? `${event.title} — find tickets on TheShowFinder`
  const ogImage     = event.image_url ?? 'https://www.theshowfinder.com/og-image.png'

  return {
    title:       event.title,
    description,
    openGraph: {
      title:       `${event.title} | TheShowFinder`,
      description,
      type:        'website',
      images: [{
        url:    ogImage,
        width:  1200,
        height: 630,
        alt:    event.title,
      }],
    },
    twitter: {
      card:        'summary_large_image',
      title:       `${event.title} | TheShowFinder`,
      description,
      images:      [ogImage],
    },
  }
}

// ── Page ────────────────────────────────────────────────────────────────────

export default async function EventPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const event    = await getEvent(slug)
  if (!event) notFound()

  const isSoldOut  = event.status === 'sold_out' || event.status === 'cancelled'
  const priceLabel = fmtPrice(event.price_from, event.price_to, event.currency)
  const { primary, resale, also } = buildProviders(event.title, event.tickets_url)
  const headliners = event.artists
    .filter(a => a.is_headliner && a.artist)
    .sort((a, b) => a.order - b.order)

  return (
    <>
      {/* ── HERO ──────────────────────────────────────────────── */}
      <section className="relative text-white overflow-hidden" style={{ backgroundColor: '#1A1A2E' }}>
        {event.image_url && (
          <>
            <Image src={event.image_url} alt={event.title} fill className="object-cover opacity-20" priority />
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
            {event.status === 'on_sale'  && <span className="text-xs font-bold uppercase tracking-wider bg-emerald-500 text-white px-3 py-1 rounded-full">On Sale</span>}
            {event.status === 'sold_out' && <span className="text-xs font-bold uppercase tracking-wider bg-red-600 text-white px-3 py-1 rounded-full">Sold Out</span>}
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
            <a
              href={event.tickets_url ?? '#tickets'}
              target={event.tickets_url ? '_blank' : undefined}
              rel={event.tickets_url ? 'noopener noreferrer' : undefined}
              className="hidden md:inline-flex items-center gap-2 text-white font-extrabold text-lg px-8 py-4 rounded-xl hover:opacity-90 transition-opacity shadow-lg"
              style={{ backgroundColor: '#E8003D' }}
            >
              Get Tickets ↗
            </a>
          ) : (
            <div className="hidden md:inline-flex items-center bg-slate-700 text-white/60 font-bold text-lg px-8 py-4 rounded-xl cursor-not-allowed">
              {event.status === 'cancelled' ? 'Event Cancelled' : 'Sold Out'}
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
          <a
            href={event.tickets_url ?? '#tickets'}
            target={event.tickets_url ? '_blank' : undefined}
            rel={event.tickets_url ? 'noopener noreferrer' : undefined}
            className="flex-none text-white font-extrabold px-6 py-3.5 rounded-xl hover:opacity-90 transition-opacity min-h-[52px] flex items-center text-sm"
            style={{ backgroundColor: '#E8003D' }}
          >
            Get Tickets ↗
          </a>
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
                {event.venue && (
                  <div className="bg-white border border-slate-200 rounded-xl p-4 sm:col-span-2">
                    <dt className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">Venue</dt>
                    <dd className="font-semibold text-slate-800">{event.venue.name}</dd>
                    <dd className="text-sm text-slate-500 mt-0.5">
                      {event.venue.address}, {event.venue.city}, {event.venue.postcode}
                    </dd>
                  </div>
                )}
              </dl>
            </div>
          </div>

          {/* Right: tickets ─────────────────────────────────────── */}
          <div id="tickets" className="space-y-5 lg:sticky lg:top-24 self-start">
            {/* Primary tickets */}
            {isSoldOut ? (
              <div className="bg-slate-100 border border-slate-200 rounded-2xl p-6 text-center">
                <p className="text-4xl mb-3">😔</p>
                <p className="font-bold text-slate-700 text-lg">
                  {event.status === 'cancelled' ? 'Event Cancelled' : 'Sold Out'}
                </p>
                <p className="text-slate-500 text-sm mt-2">Check below for resale options</p>
              </div>
            ) : (
              <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
                <h3 className="text-xs font-extrabold uppercase tracking-widest text-slate-400 mb-4">Primary Tickets</h3>
                <div className="flex flex-col gap-3">
                  {primary.map(({ name, tagline, bg, href }) => (
                    <a
                      key={name}
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-between text-white rounded-xl px-5 py-4 hover:opacity-90 transition-opacity min-h-[60px]"
                      style={{ backgroundColor: bg }}
                    >
                      <div>
                        <p className="font-extrabold text-base leading-none">{name}</p>
                        <p className="text-xs mt-0.5 opacity-70">{tagline}</p>
                      </div>
                      <span className="text-xl ml-3">→</span>
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* Resale */}
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
              <h3 className="text-xs font-extrabold uppercase tracking-widest text-slate-400 mb-1">More Options</h3>
              <p className="text-xs text-slate-400 mb-4">Compare prices across resale platforms</p>
              <div className="grid grid-cols-2 gap-3">
                {resale.map(({ name, bg, href }) => (
                  <a
                    key={name}
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center font-bold text-sm text-white rounded-xl py-3.5 hover:opacity-90 transition-opacity min-h-[48px]"
                    style={{ backgroundColor: bg }}
                  >
                    {name}
                  </a>
                ))}
              </div>
              <p className="text-xs text-slate-400 mt-4 leading-relaxed">
                Resale tickets may be priced above face value. Always check the seller&apos;s terms.
              </p>
            </div>

            {/* Also available */}
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
              <h3 className="text-xs font-extrabold uppercase tracking-widest text-slate-400 mb-4">Also Available</h3>
              <div className="grid grid-cols-2 gap-3">
                {also.map(({ name, bg, color, href }) => (
                  <a
                    key={name}
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center font-bold text-sm rounded-xl py-3.5 hover:opacity-90 transition-opacity min-h-[48px]"
                    style={{ backgroundColor: bg, color: color ?? '#ffffff' }}
                  >
                    {name}
                  </a>
                ))}
              </div>
            </div>

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
