import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import type { Artist, Tour, TourDate } from '@/lib/types/database'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ slug: string }>
}

export default async function ArtistPage({ params }: PageProps) {
  const { slug } = await params
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

  return (
    <div className="min-h-screen bg-[#F5F5F0]">
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
                <a
                  href={artist.tickets_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block w-full text-center font-bold text-white py-4 px-6 rounded-2xl text-lg shadow-lg hover:opacity-90 transition-opacity"
                  style={{ backgroundColor: '#E8003D' }}
                >
                  Get Tickets
                </a>
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
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                <h3 className="font-bold text-slate-900 mb-0.5">Available Now</h3>
                <p className="text-xs text-slate-400 mb-4">Tickets available on secondary market</p>
                <div className="space-y-2">
                  {[
                    { name: 'Gigsberg',    bg: '#1a1f6e', href: `https://www.gigsberg.com/search?q=${encodeURIComponent(artist.name)}` },
                    { name: 'Viagogo',     bg: '#e4002b', href: `https://www.viagogo.com/Concert-Tickets/search?q=${encodeURIComponent(artist.name)}` },
                    { name: 'StubHub',     bg: '#400078', href: `https://www.stubhub.com/find/s/?q=${encodeURIComponent(artist.name)}` },
                    { name: 'Vivid Seats', bg: '#01b569', href: `https://www.vividseats.com/search?searchTerm=${encodeURIComponent(artist.name)}` },
                  ].map(({ name, bg, href }) => (
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
                ← All on-sale this week
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
