import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = { title: 'Staying on | TheShowFinder', robots: { index: false, follow: false } }

// Where the "stay on" link lands: thanks after paying, or a friendly note if they backed out or the link failed.
export default async function StayingPage({ searchParams }: { searchParams: Promise<{ done?: string; cancelled?: string; error?: string }> }) {
  const q = await searchParams
  const [title, body] = q.done
    ? ['Thank you, you are staying on', 'Your listing stays live on TheShowFinder, month by month. We will send you your results each month, and you can cancel any time by emailing hello@theshowfinder.com.']
    : q.cancelled
      ? ['No problem', 'Nothing has been set up or charged. If you would like to stay on later, use the link in our email or just reply to it.']
      : ['That link did not work', 'Please reply to our email or write to hello@theshowfinder.com and we will sort it out straight away.']
  return (
    <main className="min-h-screen bg-[#F5F5F0] px-4 py-16">
      <div className="mx-auto max-w-2xl rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm sm:p-12">
        <p className="text-5xl">{q.done ? '🎉' : q.cancelled ? '👍' : '✉️'}</p>
        <h1 className="mt-5 text-3xl font-black text-slate-950">{title}</h1>
        <p className="mt-4 leading-relaxed text-slate-600">{body}</p>
        <Link href="/" className="mt-8 inline-flex rounded-xl bg-slate-950 px-5 py-3 text-sm font-extrabold text-white">Back to TheShowFinder</Link>
      </div>
    </main>
  )
}
