'use client'

import Link from 'next/link'

export default function IntelligenceDashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 max-w-md text-center">
        <p className="text-4xl mb-3">⚠️</p>
        <h1 className="text-lg font-extrabold text-slate-900 mb-2">Couldn&rsquo;t load the Daily Intelligence dashboard</h1>
        <p className="text-sm text-slate-500 mb-6">
          One of the checks on this page hit an error — nothing was changed on the site. {error.message && (
            <span className="block mt-2 text-xs text-slate-400">{error.message}</span>
          )}
        </p>
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={reset}
            className="text-sm font-bold text-white px-5 py-2.5 rounded-xl hover:opacity-90 transition-opacity"
            style={{ backgroundColor: '#E8003D' }}
          >
            Try again
          </button>
          <Link href="/admin" className="text-sm font-semibold text-slate-500 hover:text-slate-700">
            Back to Admin
          </Link>
        </div>
      </div>
    </div>
  )
}
