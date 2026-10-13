import type { Metadata } from 'next'
import SavedShowsClient from '@/components/SavedShowsClient'

// Personal page (the list lives in the visitor's browser): not for search engines.
export const metadata: Metadata = {
  title: 'Your saved shows',
  robots: { index: false, follow: true },
}

export default function SavedPage() {
  return (
    <div className="min-h-screen" style={{ backgroundColor: '#F5F5F0' }}>
      <div className="py-12 px-4 sm:px-6 lg:px-8" style={{ backgroundColor: '#1A1A2E' }}>
        <div className="max-w-4xl mx-auto">
          <h1 className="text-3xl sm:text-4xl font-extrabold text-white mb-2">Your saved shows</h1>
          <p className="text-white/60">Kept on this device. No account needed.</p>
        </div>
      </div>
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <SavedShowsClient />
      </div>
    </div>
  )
}
