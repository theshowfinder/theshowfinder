import Link from 'next/link'

// Next.js renders this automatically for any route that calls notFound()
// or doesn't match a route (App Router convention: src/app/not-found.tsx).
// Added as part of the "On Sale This Week" 404-link fix so a genuinely
// missing page gives visitors a proper, branded response with somewhere
// useful to go, instead of Next's bare default 404.
export default function NotFound() {
  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4" style={{ backgroundColor: '#F5F5F0' }}>
      <div className="max-w-lg w-full text-center">
        <div
          className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-2xl"
          style={{ backgroundColor: '#1A1A2E' }}
        >
          <span className="text-4xl font-extrabold" style={{ color: '#E8003D' }}>404</span>
        </div>

        <h1 className="text-2xl sm:text-3xl font-extrabold mb-3" style={{ color: '#1A1A2E' }}>
          This page isn&apos;t showing
        </h1>
        <p className="text-slate-600 mb-8">
          The page you&apos;re looking for doesn&apos;t exist, or the event may no longer be available.
          It might have sold out, been cancelled, or moved.
        </p>

        <div className="flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/"
            className="inline-flex items-center justify-center rounded-full px-6 py-3 text-sm font-bold text-white transition-colors hover:opacity-90"
            style={{ backgroundColor: '#1A1A2E' }}
          >
            Back to homepage
          </Link>
          <Link
            href="/on-sale-this-week"
            className="inline-flex items-center justify-center rounded-full px-6 py-3 text-sm font-bold text-white transition-colors hover:opacity-90"
            style={{ backgroundColor: '#E8003D' }}
          >
            On Sale This Week
          </Link>
          <Link
            href="/events"
            className="inline-flex items-center justify-center rounded-full border border-slate-300 px-6 py-3 text-sm font-bold text-slate-700 transition-colors hover:bg-white"
          >
            Browse all events
          </Link>
        </div>
      </div>
    </div>
  )
}
