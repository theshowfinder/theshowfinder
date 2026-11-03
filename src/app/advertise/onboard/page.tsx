import type { Metadata } from 'next'
import AdvertiserOnboardingForm from '@/components/AdvertiserOnboardingForm'
import { prospectByRef } from '@/lib/outreachProspect'

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
  // From an outreach email: business name, email, city and type are filled in already.
  const prospect = await prospectByRef(params.ref)
  const refCode = prospect ? params.ref! : ''
  return (
    <main className="min-h-screen bg-[#F5F5F0] px-4 py-10 sm:px-6 sm:py-16">
      <div className="mx-auto max-w-6xl">
        <AdvertiserOnboardingForm initialCity={prospect?.city ?? params.city ?? ''} initialPackage={initialPackage} refCode={refCode}
          initialBusinessName={prospect?.business_name ?? ''} initialEmail={prospect?.email ?? ''} initialContactName={prospect?.contact_name ?? ''} initialCategory={prospect?.category ?? ''} />
      </div>
    </main>
  )
}
