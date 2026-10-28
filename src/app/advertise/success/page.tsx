import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Application received | TheShowFinder',
  robots: { index: false, follow: false },
}

export default function AdvertiserSuccessPage() {
  return (
    <main className="min-h-screen bg-[#F5F5F0] px-4 py-16">
      <div className="mx-auto max-w-2xl rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm sm:p-12">
        <p className="text-5xl">✓</p>
        <h1 className="mt-5 text-3xl font-black text-slate-950">Payment received</h1>
        <p className="mt-4 leading-relaxed text-slate-600">Thank you. Your payment and business details have been received. We will review your application and contact you before your listing goes live.</p>
        <Link href="/" className="mt-8 inline-flex rounded-xl bg-slate-950 px-5 py-3 text-sm font-extrabold text-white">Back to TheShowFinder</Link>
      </div>
    </main>
  )
}
