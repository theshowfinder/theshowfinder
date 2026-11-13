import type { Metadata } from 'next'
import { ArtistPageView, buildArtistMetadata } from '../../ArtistPageView'

// The artist page opened from a city ("Artists playing in Derby"): that city's dates first and the top
// "Get tickets" button on that city's show. Canonical stays /artists/<slug> (buildArtistMetadata), so search
// engines see one page per artist.
export const revalidate = 86400   // a day: changedPages.ts only rebuilds the plain artist page, so city copies refresh on their own
export const maxDuration = 60
export async function generateStaticParams() {
  return []
}

interface PageProps {
  params: Promise<{ slug: string; city: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  return buildArtistMetadata((await params).slug)
}

export default async function ArtistCityPage({ params }: PageProps) {
  const { slug, city } = await params
  return <ArtistPageView slug={slug} city={decodeURIComponent(city)} />
}
