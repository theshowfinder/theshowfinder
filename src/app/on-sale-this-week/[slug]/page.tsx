export const revalidate = 3600

import { notFound } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { groupEventsByArtist, fmtOnSaleLabel } from '@/lib/on-sale'
import type { EventWithVenue, Artist } from '@/lib/types/database'

interface PageProps {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  const supabase     = await createClient()
  const titlePrefix  = slug.replace(/-/g, ' ')
  const now          = new Date()
  const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString()
  const weekAhead    = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString()
  const onSaleOrPresaleFilter = `and(public_onsale_start.gte.${threeDaysAgo},public_onsale_start.lte.${weekAhead}),and(presale_start.gte.${threeDaysAgo},presale_start.lte.${weekAhead})`

  // Queries public_onsale_start / presale_start directly — see the main page
  // component below for why this doesn't use the flag columns.
  const [broadResult, targetedResult, arResult] = await Promise.all([
    supabase.from('events_with_venue').select('*')
      .or(onSaleOrPresaleFilter)
      .limit(500) as unknown as Promise<{ data: EventWithVenue[] | null }>,
    supabase.from('events_with_venue').select('*')
      .or(onSaleOrPresaleFilter)
      .ilike('title', `${titlePrefix}%`)
      .order('start_date', { ascending: true })
      .limit(200) as unknown as Promise<{ data: EventWithVenue[] | null }>,
    supabase.from('artists').select('*') as unknown as Promise<{ data: Artist[] | null }>,
  ])

  const merged = mergeEventResults(broadResult.data, targetedResult.data)
  const group  = groupEventsByArtist(merged, arResult.data ?? []).find(g => g.slug === slug)
  if (!group) return { title: 'On Sale This Week' }
  return {
    title: `${group.artistName} — On Sale This Week | TheShowFinder`,
    description: `${group.events.length} UK date${group.events.length !== 1 ? 's' : ''} going on sale ${fmtOnSaleLabel(group.onsale_date)}`,
  }
}

// Merge two event result arrays, deduplicating by id and sorting by start_date.
// The broad query catches near-future shows; the targeted query catches far-future
// shows that fall beyond PostgREST's row limit when ordered by start_date.
function mergeEventResults(
  broad:    EventWithVenue[] | null,
  targeted: EventWithVenue[] | null,
): EventWithVenue[] {
  const map = new Map<string, EventWithVenue>()
  for (const e of (broad    ?? [])) map.set(e.id, e)
  for (const e of (targeted ?? [])) map.set(e.id, e)
  return [...map.values()].sort((a, b) => a.start_date.localeCompare(b.start_date))
}

export default async function OnSaleArtistPage({ params }: PageProps) {
  const { slug } = await params
  const supabase     = await createClient()
  const now          = new Date()
  const nowISO       = now.toISOString()
  const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString()
  const weekAhead    = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString()
  // Convert slug to an approximate title prefix for ILIKE matching.
  // "gracie-abrams" → "gracie abrams" → matches "Gracie Abrams: The Look at My Life Tour"
  const titlePrefix = slug.replace(/-/g, ' ')
  const onSaleOrPresaleFilter = `and(public_onsale_start.gte.${threeDaysAgo},public_onsale_start.lte.${weekAhead}),and(presale_start.gte.${threeDaysAgo},presale_start.lte.${weekAhead})`

  // Queries public_onsale_start / presale_start directly rather than the
  // on_sale_this_week / presale_this_week flag columns: those are meant to
  // be kept current by a nightly DB function, but it isn't actually running
  // (checked live — events with a presale_start due this week are still
  // flagged false), so they're stuck permanently false. A -3d lookback keeps
  // an event visible for a few days after its window opens rather than
  // vanishing the instant "now" passes it, and checking presale_start too
  // means presale-only windows show up, not just public on-sale.
  const [broadResult, targetedResult, arResult] = await Promise.all([
    // Broad query: catches artists with near-future shows (within the row limit)
    supabase
      .from('events_with_venue')
      .select('*')
      .or(onSaleOrPresaleFilter)
      .order('start_date', { ascending: true })
      .limit(500) as unknown as Promise<{ data: EventWithVenue[] | null }>,
    // Targeted query: catches artists with far-future shows (e.g. 2027 tours)
    // that fall beyond the row limit when the broad query orders by start_date.
    supabase
      .from('events_with_venue')
      .select('*')
      .or(onSaleOrPresaleFilter)
      .ilike('title', `${titlePrefix}%`)
      .order('start_date', { ascending: true })
      .limit(200) as unknown as Promise<{ data: EventWithVenue[] | null }>,
    supabase
      .from('artists')
      .select('*') as unknown as Promise<{ data: Artist[] | null }>,
  ])

  const groups   = groupEventsByArtist(mergeEventResults(broadResult.data, targetedResult.data), arResult.data ?? [])
  const group    = groups.find(g => g.slug === slug)
  if (!group) notFound()

  const { artistName, image_url, onsale_date, saleType, events, dbArtist } = group
  const onSaleLabel = fmtOnSaleLabel(onsale_date)
  const isPresale   = saleType === 'presale'

  const firstTicketUrl = events[0]?.tickets_url ?? null

  // Secondary market links using artist name
  const secondaryMarket = [
    { name: 'Gigsberg',    bg: '#1a1f6e', href: dbArtist?.gigsberg_url    ?? `https://www.gigsberg.com/search?q=${encodeURIComponent(artistName)}` },
    { name: 'Viagogo',     bg: '#00a650', href: dbArtist?.viagogo_url     ?? `https://www.viagogo.co.uk/ww/SearchResults?q=${encodeURIComponent(artistName)}` },
    { name: 'StubHub',     bg: '#400078', href: dbArtist?.stubhub_url     ?? `https://www.stubhub.co.uk/srp/?q=${encodeURIComponent(artistName)}` },
    { name: 'Vivid Seats', bg: '#02044a', href: dbArtist?.vivid_seats_url ?? `https://www.vividseats.com/search?searchTerm=${encodeURIComponent(artistName)}` },
  ]

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
            <span className="inline-flex items-center gap-2 text-sm font-bold px-4 py-2 rounded-full text-white" style={{ backgroundColor: isPresale ? '#E8003D' : '#026CDF' }}>
              🎟️ {isPresale ? 'Presale opens' : 'On sale'} {onSaleLabel}
            </span>
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

            <h2 className="text-xl font-extrabold text-slate-900 mb-5">
              {events.length} UK Date{events.length !== 1 ? 's' : ''} Going On Sale
            </h2>

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
                      <p className="font-bold text-slate-900 truncate">{event.venue_name}</p>
                      <p className="text-sm text-slate-500">{event.venue_city}</p>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {dt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>

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
                        <a
                          href={event.tickets_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-block text-xs font-bold text-white px-3 py-1.5 rounded-lg hover:opacity-90 transition-opacity"
                          style={{ backgroundColor: '#E8003D' }}
                        >
                          Get Tickets
                        </a>
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
          </div>

          {/* Sidebar */}
          <div className="mt-10 lg:mt-0">
            <div className="sticky top-6 space-y-4">

              {/* Primary ticket sources */}
              {(dbArtist?.tickets_url ?? firstTicketUrl) && (
                <a
                  href={dbArtist?.tickets_url ?? firstTicketUrl!}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block w-full text-center font-bold text-white py-4 px-6 rounded-2xl text-lg shadow-lg hover:opacity-90 transition-opacity"
                  style={{ backgroundColor: '#E8003D' }}
                >
                  Get Tickets
                </a>
              )}
              {dbArtist?.see_tickets_url && (
                <a href={dbArtist.see_tickets_url} target="_blank" rel="noopener noreferrer"
                  className="block w-full text-center font-bold text-white py-4 px-6 rounded-2xl text-lg shadow-lg hover:opacity-90 transition-opacity"
                  style={{ backgroundColor: '#e4022d' }}>
                  See Tickets
                </a>
              )}
              {dbArtist?.eventim_url && (
                <a href={dbArtist.eventim_url} target="_blank" rel="noopener noreferrer"
                  className="block w-full text-center font-bold text-white py-4 px-6 rounded-2xl text-lg shadow-lg hover:opacity-90 transition-opacity"
                  style={{ backgroundColor: '#00a4e0' }}>
                  Eventim
                </a>
              )}
              {dbArtist?.axs_url && (
                <a href={dbArtist.axs_url} target="_blank" rel="noopener noreferrer"
                  className="block w-full text-center font-bold text-white py-4 px-6 rounded-2xl text-lg shadow-lg hover:opacity-90 transition-opacity"
                  style={{ backgroundColor: '#000000' }}>
                  AXS
                </a>
              )}
              {dbArtist?.gigantic_url && (
                <a href={dbArtist.gigantic_url} target="_blank" rel="noopener noreferrer"
                  className="block w-full text-center font-bold text-white py-4 px-6 rounded-2xl text-lg shadow-lg hover:opacity-90 transition-opacity"
                  style={{ backgroundColor: '#e4022d' }}>
                  Gigantic
                </a>
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
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                <h3 className="font-bold text-slate-900 mb-0.5">Available Now</h3>
                <p className="text-xs text-slate-400 mb-4">Tickets available on secondary market</p>
                <div className="space-y-2">
                  {secondaryMarket.map(({ name, bg, href }) => (
                    <a
                      key={name}
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block w-full text-center font-bold text-white py-2.5 px-4 rounded-xl text-sm hover:opacity-90 transition-opacity"
                      style={{ backgroundColor: bg }}
                    >
                      {name}
                    </a>
                  ))}
                </div>
              </div>

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
