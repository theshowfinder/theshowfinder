import type { Metadata } from 'next'

export const metadata: Metadata = {
  title:       'Contact Us',
  description: 'Get in touch with TheShowFinder. General enquiries, business and advertising opportunities.',
  alternates:  { canonical: 'https://www.theshowfinder.com/contact' },
}

export default function ContactPage() {
  return (
    <div className="min-h-screen" style={{ backgroundColor: '#F5F5F0' }}>
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16">

        <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 mb-10">
          Contact Us
        </h1>

        <div className="space-y-6">

          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-7">
            <h2 className="text-base font-extrabold text-slate-900 mb-1">General enquiries</h2>
            <p className="text-slate-500 text-sm mb-4">
              Questions about events, tickets, or using the site?
            </p>
            <a
              href="mailto:hello@theshowfinder.com"
              className="inline-flex items-center gap-2 font-bold text-sm hover:underline"
              style={{ color: '#E8003D' }}
            >
              hello@theshowfinder.com
            </a>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-7">
            <h2 className="text-base font-extrabold text-slate-900 mb-1">Business &amp; advertising</h2>
            <p className="text-slate-500 text-sm mb-4">
              Partnership, advertising or commercial opportunities?
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
