import type { Metadata } from 'next'
import AdvertiserOnboardingPage from '@/app/advertise/onboard/page'

// Short personal sign-up link for a business we're talking to (Chris, 26 Nov 2026): theshowfinder.com/join/<ref>
// opens the sign-up form with their details already filled in, straight at the details step. Same page as
// /advertise/onboard?ref=<ref>, just a link that's easy to read in an email.
export const metadata: Metadata = {
  title: 'Start your free month | TheShowFinder',
  robots: { index: false, follow: false },
}

export default async function JoinPage({ params }: { params: Promise<{ ref: string }> }) {
  const { ref } = await params
  return AdvertiserOnboardingPage({ searchParams: Promise.resolve({ ref }) })
}
