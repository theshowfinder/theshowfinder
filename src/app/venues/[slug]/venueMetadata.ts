import type { Metadata } from 'next'
import { createPublicClient } from '@/lib/supabase/public'
import { LIVE_EVENT_STATUSES } from '@/lib/eventPools'
import { venueSeoTitle, venueSeoDescription } from '@/lib/venueSeo'

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

export async function buildVenueMetadata(slug: string): Promise<Metadata> {
  const supabase  = createPublicClient()
  const { data: venue } = await supabase
    .from('venues')
    .select('id, name, city, capacity')
    .eq('slug', slug)
    .single() as unknown as { data: Pick<VenueRow, 'id' | 'name' | 'city' | 'capacity'> | null }

  if (!venue) return { title: 'Venue Not Found' }

  // What is on here, for a description that tells a searcher something real.
  const { data: next, count } = await supabase
    .from('listed_events_with_venue')
    .select('title', { count: 'exact' })
    .eq('venue_id', venue.id)
    .gte('start_date', new Date().toISOString())
    .in('status', LIVE_EVENT_STATUSES)
    .order('start_date', { ascending: true })
    .limit(6) as unknown as { data: { title: string }[] | null; count: number | null }
  const upcomingCount = count ?? (next?.length ?? 0)

  const capStr      = venue.capacity ? ` — Capacity ${venue.capacity.toLocaleString('en-GB')}` : ''
  // The root layout appends " | TheShowFinder" through its metadata template.
  // Keep this page title bare so venue titles do not repeat the brand suffix.
  const title        = venueSeoTitle(venue.name, venue.city)
  const description  = venueSeoDescription({
    name: venue.name, city: venue.city, capacity: venue.capacity,
    upcomingCount, nextTitles: (next ?? []).map(e => e.title),
  })
  const ogDescription = `Upcoming events at ${venue.name} in ${venue.city}${capStr}.`
  const canonical     = `https://www.theshowfinder.com/venues/${slug}`
  const ogImage       = 'https://www.theshowfinder.com/og-image.png'

  return {
    title,
    description,
    alternates:  { canonical },
    // A venue with nothing on is a thin page: keep it out of the index (links still followed).
    ...(upcomingCount === 0 ? { robots: { index: false, follow: true } } : {}),
    openGraph: {
      title,
      description: ogDescription,
      type:        'website',
      url:         canonical,
      images:      [{ url: ogImage, width: 1200, height: 630, alt: title }],
    },
    twitter: {
      card:        'summary_large_image',
      title,
      description: ogDescription,
      images:      [ogImage],
    },
  }
}

