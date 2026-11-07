export const revalidate = 86400
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
import { OnSaleArtistView, buildOnSaleMetadata } from './OnSaleArtistView'

interface PageProps {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  return buildOnSaleMetadata((await params).slug)
}

export default async function OnSaleArtistPage({ params }: PageProps) {
  return <OnSaleArtistView slug={(await params).slug} />
}
