export const revalidate = 3600

import { notFound } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import EventCard from '@/components/EventCard'
import type { EventWithVenue } from '@/lib/types/database'

interface PageProps {
  params: Promise<{ slug: string }>
}

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

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  const supabase  = await createClient()
  const { data: venue } = await supabase
    .from('venues')
    .select('name, city, capacity')
    .eq('slug', slug)
    .single() as unknown as { data: Pick<VenueRow, 'name' | 'city' | 'capacity'> | null }

  if (!venue) return { title: 'Venue Not Found' }

  const capStr = venue.capacity ? ` — Capacity ${venue.capacity.toLocaleString('en-GB')}` : ''
  return {
    title:       `${venue.name}, ${venue.city} | TheShowFinder`,
    description: `Upcoming events at ${venue.name} in ${venue.city}${capStr}. Find tickets for all shows.`,
    openGraph: {
      title:       `${venue.name}, ${venue.city} | TheShowFinder`,
      description: `Upcoming events at ${venue.name} in ${venue.city}${capStr}.`,
      type:        'website',
    },
  }
}

export default async function VenuePage({ params }: PageProps) {
  const { slug }  = await params
  const supabase  = await createClient()
  const now       = new Date().toISOString()

  // Fetch venue — first query so we have the ID for the events query
  const { data: venue } = await supabase
    .from('venues')
    .select('id, name, slug, address, city, postcode, capacity, website')
    .eq('slug', slug)
    .single() as unknown as { data: VenueRow | null }

  if (!venue) notFound()

  // Fetch upcoming events at this venue
  const { data: events } = await supabase
    .from('events_with_venue')
    .select('*')
    .eq('venue_id', venue.id)
    .gte('start_date', now)
    .order('start_date', { ascending: true })
    .limit(50) as unknown as { data: EventWithVenue[] | null }

  const upcomingEvents = events ?? []

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#F5F5F0' }}>

      {/* ── HERO ── */}
      <div className="py-14 px-4 sm:px-6 lg:px-8" style={{ backgroundColor: '#1A1A2E' }}>
        <div className="max-w-7xl mx-auto">

          {/* Breadcrumb */}
          <nav className="flex items-center gap-1.5 text-sm text-white/50 mb-6 flex-wrap">
            <Link href="/" className="hover:text-white transition-colors">Home</Link>
            <span>/</span>
            <Link
              href={`/cities/${encodeURIComponent(venue.city)}`}
              className="hover:text-white transition-colors"
            >
              {venue.city}
            </Link>
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
            <p className="text-white/50 text-sm">
              Capacity: {venue.capacity.toLocaleString('en-GB')}
            </p>
          )}
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
          {upcomingEvents.length > 0 && (
            <span className="text-sm text-slate-500 hidden sm:block">
              {upcomingEvents.length} upcoming show{upcomingEvents.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>

        {upcomingEvents.length === 0 ? (
          <div className="text-center py-24 bg-white rounded-2xl border border-slate-200">
            <p className="text-6xl mb-4">🎭</p>
            <h3 className="text-xl font-semibold text-slate-700 mb-2">No upcoming events</h3>
            <p className="text-slate-500 mb-6">No events are scheduled at this venue right now.</p>
            <Link
              href={`/cities/${encodeURIComponent(venue.city)}`}
              className="text-sm font-semibold hover:underline"
              style={{ color: '#E8003D' }}
            >
              Browse all events in {venue.city} →
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {upcomingEvents.map(event => (
              <EventCard key={event.id} event={event} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
