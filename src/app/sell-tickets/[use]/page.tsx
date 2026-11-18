import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { bookingFeePence, gbpFromPence } from '@/lib/tickets'
import { SELL_PAGES, sellPageBySlug } from '@/lib/sellTicketsPages'

// Organiser search pages (/sell-tickets/comedy-nights, /sell-tickets/free-event-tickets ...): content in
// src/lib/sellTicketsPages.ts. Static: built at deploy, no database.
export const dynamicParams = false
export function generateStaticParams() {
  return SELL_PAGES.map(p => ({ use: p.slug }))
}

const BASE = 'https://www.theshowfinder.com'

export async function generateMetadata({ params }: { params: Promise<{ use: string }> }): Promise<Metadata> {
  const { use } = await params
  const p = sellPageBySlug(use)
  if (!p) return { title: 'Not found' }
  const url = `${BASE}/sell-tickets/${p.slug}`
  return {
    title: p.title, description: p.description, alternates: { canonical: url },
    openGraph: { title: p.title, description: p.description, url, images: [{ url: `${BASE}/og-image.png`, width: 1200, height: 630, alt: p.h1 }] },
  }
}

export default async function SellUsePage({ params }: { params: Promise<{ use: string }> }) {
  const { use } = await params
  const p = sellPageBySlug(use)
  if (!p) notFound()
  const url = `${BASE}/sell-tickets/${p.slug}`
  const faqSchema = {
    '@context': 'https://schema.org', '@type': 'FAQPage',
    mainEntity: p.faqs.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })),
  }
  const breadcrumb = {
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: BASE },
      { '@type': 'ListItem', position: 2, name: 'Sell tickets', item: `${BASE}/sell-tickets` },
      { '@type': 'ListItem', position: 3, name: p.h1, item: url },
    ],
  }
  const start = `/list-your-event?ticketing=${p.cta}`
  return (
    <main className="min-h-screen bg-[#F5F5F0]">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }} />
      <section className="bg-[#1A1A2E] text-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
          <nav className="text-white/40 text-xs mb-3"><Link href="/" className="hover:text-white/70">Home</Link>{' / '}<Link href="/sell-tickets" className="hover:text-white/70">Sell tickets</Link></nav>
          <p className="text-xs font-extrabold uppercase tracking-widest text-[#E8003D]">{p.kicker}</p>
          <h1 className="mt-2 text-3xl sm:text-5xl font-extrabold leading-tight">{p.h1}</h1>
          <p className="mt-5 text-lg text-white/80 max-w-2xl">{p.intro}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href={start} className="inline-flex items-center min-h-[52px] px-6 rounded-full bg-[#E8003D] font-extrabold text-white hover:bg-[#c40033]">{p.cta === 'free' ? 'Create free tickets →' : 'Start selling tickets →'}</Link>
          </div>
          <p className="mt-4 text-sm text-white/60">No contract. No monthly fee. Set up in two minutes.</p>
        </div>
      </section>

      <section className="max-w-5xl mx-auto px-4 sm:px-6 py-12">
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {p.points.map(([title, body]) => (
            <div key={title} className="rounded-2xl bg-white border border-slate-200 p-5">
              <h2 className="text-lg font-extrabold text-slate-900">{title}</h2>
              <p className="mt-1 text-sm text-slate-600">{body}</p>
            </div>
          ))}
        </div>
      </section>

      {p.cta === 'paid' && (
        <section className="max-w-3xl mx-auto px-4 sm:px-6 pb-6">
          <h2 className="text-2xl font-extrabold text-slate-900">What you get, what your buyer pays</h2>
          <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <table className="w-full text-left">
              <thead className="bg-slate-50 text-sm text-slate-600"><tr><th className="p-3 sm:p-4">Ticket price</th><th className="p-3 sm:p-4">You get</th><th className="p-3 sm:p-4">Buyer pays</th></tr></thead>
              <tbody>
                {[500, 1000, 1500, 2000].map(v => (
                  <tr key={v} className="border-t border-slate-100">
                    <td className="p-3 sm:p-4 font-bold">{gbpFromPence(v)}</td>
                    <td className="p-3 sm:p-4 font-extrabold text-green-700">{gbpFromPence(v)}</td>
                    <td className="p-3 sm:p-4">{gbpFromPence(v + bookingFeePence(v))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="max-w-3xl mx-auto px-4 sm:px-6 py-10">
        <h2 className="text-2xl font-extrabold text-slate-900">Questions</h2>
        <div className="mt-4 space-y-3">
          {p.faqs.map(([q, a]) => (
            <details key={q} className="rounded-2xl bg-white border border-slate-200 p-4">
              <summary className="font-bold text-slate-900 cursor-pointer">{q}</summary>
              <p className="mt-2 text-slate-600">{a}</p>
            </details>
          ))}
        </div>
        <div className="mt-8 rounded-2xl bg-white border border-slate-200 p-5">
          <p className="font-bold text-slate-900">More ways to use TheShowFinder</p>
          <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-2">
            <li><Link href="/sell-tickets" className="text-sm font-semibold hover:underline" style={{ color: '#026CDF' }}>Why sell tickets with us →</Link></li>
            {SELL_PAGES.filter(x => x.slug !== p.slug).map(x => (
              <li key={x.slug}><Link href={`/sell-tickets/${x.slug}`} className="text-sm font-semibold hover:underline" style={{ color: '#026CDF' }}>{x.h1} →</Link></li>
            ))}
          </ul>
        </div>
      </section>
    </main>
  )
}
