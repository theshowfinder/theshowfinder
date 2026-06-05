import type { Metadata } from 'next'

export const metadata: Metadata = {
  title:       'Advertise with TheShowFinder',
  description: 'Reach thousands of live music and events fans across the UK. Advertising and partnership opportunities for ticket providers, venues, promoters and event-related brands.',
  alternates:  { canonical: 'https://www.theshowfinder.com/advertise' },
}

export default function AdvertisePage() {
  return (
    <div className="min-h-screen" style={{ backgroundColor: '#F5F5F0' }}>
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16">

        <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 mb-10">
          Advertise with TheShowFinder
        </h1>

        <div className="space-y-8 text-slate-600 leading-relaxed">

          <p className="text-lg">
            TheShowFinder reaches thousands of live music and events fans across the UK every month.
          </p>

          <p>
            We offer advertising and partnership opportunities for ticket providers, venues, promoters
            and event-related brands.
          </p>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-7">
            <h2 className="text-base font-extrabold text-slate-900 mb-1">Get in touch</h2>
            <p className="text-slate-500 text-sm mb-4">
              To discuss advertising opportunities, email us and we&apos;ll come back to you shortly.
            </p>
            <a
              href="mailto:advertise@theshowfinder.com"
              className="inline-flex items-center gap-2 font-bold text-sm hover:underline"
              style={{ color: '#E8003D' }}
            >
              advertise@theshowfinder.com
            </a>
          </div>

        </div>
      </div>
    </div>
  )
}
