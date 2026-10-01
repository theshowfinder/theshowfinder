import type { Metadata } from 'next'
import UnsubscribeConfirm from './UnsubscribeConfirm'
import { isValidEmail, normalizeEmail } from '@/lib/subscribers'

export const metadata: Metadata = {
  title: 'Unsubscribe',
  robots: { index: false, follow: false },
  alternates: { canonical: 'https://www.theshowfinder.com/unsubscribe' },
}

interface PageProps {
  searchParams: Promise<{ email?: string }>
}

// The target of the unsubscribe link every welcome email sends (see
// src/app/actions/newsletter.tsx) — that link previously had no page
// behind it at all. `?email=` is read here, not trusted and acted on
// directly; the actual change only happens once the person clicks
// "Confirm unsubscribe" in UnsubscribeConfirm, which revalidates the
// address itself before writing anything.
export default async function UnsubscribePage({ searchParams }: PageProps) {
  const { email } = await searchParams
  const normalized = email ? normalizeEmail(email) : ''
  const valid = isValidEmail(normalized)

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#F5F5F0' }}>
      <div className="max-w-md mx-auto px-4 sm:px-6 py-16">
        <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 mb-6 text-center">
          Unsubscribe
        </h1>

        {valid ? (
          <UnsubscribeConfirm email={normalized} />
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-7 text-center">
            <p className="text-slate-500 text-sm">
              This link is missing a valid email address. If you followed a link from one of our emails and landed
              here, please <a href="mailto:hello@theshowfinder.com" className="font-semibold hover:underline" style={{ color: '#E8003D' }}>contact us</a> and
              we&apos;ll unsubscribe you by hand.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
