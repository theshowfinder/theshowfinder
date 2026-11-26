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
        <h1 className="mt-5 text-3xl font-black text-slate-950">You&apos;re in!</h1>
        <p className="mt-4 leading-relaxed text-slate-600">Thank you. We have everything we need. We will check your listing and publish it, usually within a day, and email you the links so you can see how it looks. Your first month is free and there is no card to enter.</p>
        <Link href="/" className="mt-8 inline-flex rounded-xl bg-slate-950 px-5 py-3 text-sm font-extrabold text-white">Back to TheShowFinder</Link>
      </div>
    </main>
  )
}
