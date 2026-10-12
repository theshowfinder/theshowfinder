import type { Metadata } from 'next'
import Link from 'next/link'
import WidgetGenerator from '@/components/WidgetGenerator'

export const metadata: Metadata = {
  title: 'Free Tour Dates & Gigs Widget for Artists, Venues and Blogs',
  description: 'Add a free, always-up-to-date list of upcoming UK shows to your website. Works for artists, venues, promoters and local blogs. Paste one snippet, no sign-up.',
  alternates: { canonical: 'https://www.theshowfinder.com/widgets' },
}

export default function WidgetsPage() {
  return (
    <div className="min-h-screen" style={{ backgroundColor: '#F5F5F0' }}>
      <div className="py-14 px-4 sm:px-6 lg:px-8" style={{ backgroundColor: '#1A1A2E' }}>
        <div className="max-w-4xl mx-auto">
          <h1 className="text-3xl sm:text-4xl font-extrabold text-white mb-3">Free upcoming-shows widget</h1>
          <p className="text-white/60 max-w-2xl">
            Put a live list of upcoming UK shows on your own site. It updates automatically, links straight to ticket
            comparison, and costs nothing. Built for artists, venues, promoters and local music or events blogs.
          </p>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-12">
        <section>
          <h2 className="text-xl font-extrabold text-slate-900 mb-3">Make your widget</h2>
          <p className="text-slate-600 mb-5">
            Open your page on TheShowFinder (an artist, venue or city page), copy the address from your browser and
            paste it below.
          </p>
          <WidgetGenerator />
        </section>

        <section>
          <h2 className="text-xl font-extrabold text-slate-900 mb-3">What it looks like</h2>
          <iframe
            src="/embed/city/Manchester"
            title="Example widget: big shows coming up in Manchester"
            loading="lazy"
            width="100%"
            height="460"
            style={{ border: '1px solid #e2e8f0', borderRadius: 12, maxWidth: 420, background: '#fff' }}
          />
        </section>

        <section>
          <h2 className="text-xl font-extrabold text-slate-900 mb-3">Good to know</h2>
          <ul className="list-disc pl-5 space-y-2 text-slate-600">
            <li>Shows come from the same data as the rest of TheShowFinder and refresh about every 10 minutes.</li>
            <li>Add <code className="bg-slate-100 px-1 rounded">?theme=dark</code> to the widget address for a dark version.</li>
            <li>The snippet includes a plain text link under the widget. Please keep it, it&rsquo;s how we keep this free.</li>
            <li>Questions or want something custom? <Link href="/contact" className="font-semibold" style={{ color: '#E8003D' }}>Get in touch</Link>.</li>
          </ul>
        </section>
      </div>
    </div>
  )
}
