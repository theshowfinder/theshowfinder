// Page 1 of a venue. Reads no searchParams so it can be cached on the CDN;
// ?page=N URLs are rewritten to ./p/[n] by next.config.ts.
export const revalidate = 3600

// Opt this dynamic route into on-demand static generation: no pages are built
// ahead of time, but each page is generated on first request, then cached on
// the CDN and refreshed in the background (see `revalidate` above).
export async function generateStaticParams() {
  return []
}

import type { Metadata } from 'next'
import VenueView from './VenueView'
import { buildVenueMetadata } from './venueMetadata'

interface PageProps {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  return buildVenueMetadata(slug)
}

export default async function VenuePage({ params }: PageProps) {
  const { slug } = await params
  return <VenueView slug={slug} page={1} />
}
