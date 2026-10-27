import type { Metadata } from 'next'
import AdvertiserOnboardingForm from '@/components/AdvertiserOnboardingForm'

export const metadata: Metadata = {
  title: 'Advertiser onboarding | TheShowFinder',
  description: 'Choose a city and advertising placement on TheShowFinder.',
  robots: { index: false, follow: false },
}

export default async function AdvertiserOnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ city?: string; package?: string }>
}) {
  const params = await searchParams
  const initialPackage = params.package === 'standard' ? 'standard' : 'featured'
  return (
    <main className="min-h-screen bg-[#F5F5F0] px-4 py-10 sm:px-6 sm:py-16">
      <div className="mx-auto max-w-6xl">
        <AdvertiserOnboardingForm initialCity={params.city ?? ''} initialPackage={initialPackage} />
      </div>
    </main>
  )
}
