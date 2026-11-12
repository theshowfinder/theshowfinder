import type { Metadata } from 'next'
import { CITIES } from '@/lib/cities'
import CopyBox from './CopyBox'

// "Featured on TheShowFinder" badge for partner businesses' own websites (backlink plan, 12 Nov 2026). Linked from
// the partner welcome email with their city, so the badge links to the city page where they appear.
export const metadata: Metadata = {
  title: 'Featured partner badge',
  description: 'Add the Featured on TheShowFinder badge to your website.',
  robots: { index: false, follow: true },
}

const SITE = 'https://www.theshowfinder.com'

export default async function BadgePage({ searchParams }: { searchParams: Promise<{ city?: string }> }) {
  const { city: asked } = await searchParams
  const city = CITIES.find(c => c.name.toLowerCase() === (asked ?? '').toLowerCase())?.name
  const href = city ? `${SITE}/cities/${encodeURIComponent(city)}` : SITE
  const label = city ? `What's on in ${city} – TheShowFinder` : 'TheShowFinder – UK concerts, theatre and comedy'
  const code = `<a href="${href}" title="${label}" target="_blank"><img src="${SITE}/badge/featured-on-theshowfinder.svg" alt="Featured on TheShowFinder" width="200" height="64"></a>`
  return (
    <main className="min-h-screen bg-[#F5F5F0] px-4 py-10">
      <div className="mx-auto max-w-2xl space-y-6 rounded-3xl bg-white p-6 shadow-sm sm:p-9">
        <h1 className="text-2xl font-extrabold text-slate-900">Show you&rsquo;re featured on TheShowFinder</h1>
        <p className="text-sm text-slate-600">Add this badge to your website so customers know they can find you{city ? ` on our ${city} page` : ''} next to the shows. It takes about a minute.</p>
        <div className="rounded-2xl border border-slate-200 p-6 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/badge/featured-on-theshowfinder.svg" alt="Featured on TheShowFinder" width={200} height={64} className="mx-auto" />
        </div>
        <div>
          <h2 className="mb-2 text-sm font-extrabold text-slate-900">1. Copy this code</h2>
          <CopyBox code={code} />
        </div>
        <div className="text-sm text-slate-600">
          <h2 className="mb-2 text-sm font-extrabold text-slate-900">2. Paste it into your website</h2>
          <ul className="list-disc space-y-1 pl-5">
            <li><b>WordPress:</b> add a &ldquo;Custom HTML&rdquo; block (in your footer or a page) and paste the code.</li>
            <li><b>Wix:</b> Add → Embed code → Embed HTML, then paste.</li>
            <li><b>Squarespace:</b> add a &ldquo;Code&rdquo; block and paste.</li>
            <li><b>Someone else runs your site?</b> Forward them this page.</li>
          </ul>
          <p className="mt-3">The footer or your &ldquo;Find us&rdquo; page works well. Any questions, email hello@theshowfinder.com.</p>
        </div>
      </div>
    </main>
  )
}
