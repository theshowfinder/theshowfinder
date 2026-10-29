import { redirect } from 'next/navigation'

// The old unpaid sign-up form. Everyone now signs up and pays through /advertise/onboard (Stripe), so old links land there.
export default async function JoinPage({ searchParams }: { searchParams: Promise<{ city?: string; package?: string }> }) {
  const sp = await searchParams
  const q = new URLSearchParams()
  if (sp.city) q.set('city', sp.city)
  q.set('package', sp.package === 'standard' ? 'standard' : 'featured')
  redirect(`/advertise/onboard?${q.toString()}`)
}
