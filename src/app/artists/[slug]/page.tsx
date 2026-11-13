import type { Metadata } from 'next'
import { ArtistPageView, buildArtistMetadata } from './ArtistPageView'

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

interface PageProps {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  return buildArtistMetadata((await params).slug)
}

export default async function ArtistPage({ params }: PageProps) {
  return <ArtistPageView slug={(await params).slug} />
}
