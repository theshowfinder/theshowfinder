import type { Metadata } from 'next'
import { createPublicClient } from '@/lib/supabase/public'

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
    .select('name, city, capacity')
    .eq('slug', slug)
    .single() as unknown as { data: Pick<VenueRow, 'name' | 'city' | 'capacity'> | null }

  if (!venue) return { title: 'Venue Not Found' }

  const capStr      = venue.capacity ? ` — Capacity ${venue.capacity.toLocaleString('en-GB')}` : ''
  // The root layout appends " | TheShowFinder" through its metadata template.
  // Keep this page title bare so venue titles do not repeat the brand suffix.
  const title        = `${venue.name}, ${venue.city}`
  const ogDescription = `Upcoming events at ${venue.name} in ${venue.city}${capStr}.`
  const canonical     = `https://www.theshowfinder.com/venues/${slug}`
  const ogImage       = 'https://www.theshowfinder.com/og-image.png'

  return {
    title,
    description: `Upcoming events at ${venue.name} in ${venue.city}${capStr}. Find tickets for all shows.`,
    alternates:  { canonical },
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

