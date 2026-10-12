// Pages 2+ of a venue's upcoming events. /venues/x?page=2 is rewritten here by
// next.config.ts so the first page stays cacheable.
export const revalidate = 3600

// Opt this dynamic route into on-demand static generation: no pages are built
// ahead of time, but each page is generated on first request, then cached on
// the CDN and refreshed in the background (see `revalidate` above).
export async function generateStaticParams() {
  return []
}

import type { Metadata } from 'next'
import VenueView from '../../VenueView'
import { buildVenueMetadata } from '../../venueMetadata'

interface PageProps {
  params: Promise<{ slug: string; n: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  return buildVenueMetadata(slug)
}

export default async function VenuePageN({ params }: PageProps) {
  const { slug, n } = await params
  const page = Math.max(1, Number.parseInt(n, 10) || 1)
  return <VenueView slug={slug} page={page} />
}
