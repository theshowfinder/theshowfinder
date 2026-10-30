// Pages 2+ of a venue's upcoming events. /venues/x?page=2 is rewritten here by
// next.config.ts so the first page stays cacheable.
export const revalidate = 604800   // a week as a backstop; rebuilt sooner only when the show changes (src/lib/changedPages.ts)
// A page render that takes longer than this has hit a database problem: stop and keep serving the cached copy
// instead of holding a function open for 5 minutes (29 Oct 2026 outage: 26,000 renders stuck for 300s each).
export const maxDuration = 60

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
