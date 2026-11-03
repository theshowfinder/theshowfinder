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
  searchParams: Promise<{ city?: string; package?: string; ref?: string }>
}) {
  const params = await searchParams
  const initialPackage = params.package === 'standard' ? 'standard' : 'featured'
  const refCode = /^[a-f0-9]{6,20}$/.test(params.ref ?? '') ? params.ref! : ''
  return (
    <main className="min-h-screen bg-[#F5F5F0] px-4 py-10 sm:px-6 sm:py-16">
      <div className="mx-auto max-w-6xl">
        {refCode && (
          <p className="mb-6 rounded-2xl bg-emerald-50 border border-emerald-200 px-5 py-4 text-sm font-semibold text-emerald-900">
            Founding partner offer: your first month is free on monthly billing. Your card is only charged after 30 days, and you can cancel before then.
          </p>
        )}
        <AdvertiserOnboardingForm initialCity={params.city ?? ''} initialPackage={initialPackage} refCode={refCode} />
      </div>
    </main>
  )
}
