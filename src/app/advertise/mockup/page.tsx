import type { Metadata } from 'next'
import AdvertisingCityMockup from '@/components/AdvertisingCityMockup'
import { prospectByRef } from '@/lib/outreachProspect'

export const metadata: Metadata = {
  title: 'City advertising mock-up | TheShowFinder',
  description: 'Private preview of TheShowFinder city advertising placements.',
  robots: { index: false, follow: false },
}

// Opened from an outreach email (/p/<ref>), the business sees its own name in the first Featured slot, and the
// package buttons carry the code through so sign-up is pre-filled.
export default async function AdvertisingMockupPage({
  searchParams,
}: {
  searchParams: Promise<{ city?: string; ref?: string }>
}) {
  const params = await searchParams
  const prospect = await prospectByRef(params.ref)
  const cityName = prospect?.city ?? (params.city?.trim() || 'Manchester')
  return (
    <AdvertisingCityMockup
      cityName={cityName}
      preview={prospect ? { name: prospect.business_name, category: prospect.category } : null}
      refCode={prospect ? params.ref! : ''}
    />
  )
}
