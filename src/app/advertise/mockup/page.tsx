import type { Metadata } from 'next'
import AdvertisingCityMockup from '@/components/AdvertisingCityMockup'

export const metadata: Metadata = {
  title: 'City advertising mock-up | TheShowFinder',
  description: 'Private preview of TheShowFinder city advertising placements.',
  robots: { index: false, follow: false },
}

export default async function AdvertisingMockupPage({
  searchParams,
}: {
  searchParams: Promise<{ city?: string }>
}) {
  const params = await searchParams
  const cityName = params.city?.trim() || 'Manchester'
  return <AdvertisingCityMockup cityName={cityName} />
}
