'use client'

import { useState, FormEvent } from 'react'
import { subscribeNewsletter } from '@/app/actions/newsletter'

export default function CityNewsletterForm({ cityName }: { cityName: string }) {
  const [email,   setEmail]   = useState('')
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!email.trim()) return
    setLoading(true)
    setError(null)
    const result = await subscribeNewsletter(email, cityName)
    setLoading(false)
    if (result.error) {
      setError(result.error)
    } else {
      setSuccess(true)
    }
  }

  return (
    <section
      className="rounded-2xl px-6 py-8 sm:px-10 sm:py-10 flex flex-col sm:flex-row items-center gap-6 sm:gap-10"
      style={{ backgroundColor: '#1A1A2E' }}
    >
      <div className="flex-1 text-center sm:text-left">
        <h2 className="text-xl sm:text-2xl font-extrabold text-white mb-1.5">
          Never miss a {cityName} show
        </h2>
        <p className="text-white/60 text-sm">
          Get an alert the moment presale or on-sale opens for shows in {cityName}.
        </p>
      </div>

      <div className="w-full sm:w-auto shrink-0">
        {success ? (
          <div className="flex items-center gap-2 text-white font-semibold text-sm justify-center sm:justify-start">
            <span className="text-xl">🎉</span> You&apos;re on the list!
          </div>
        ) : (
          <>
            <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-2.5 w-full sm:w-auto">
              <input
                type="email"
                required
                value={email}
                onChange={e => { setEmail(e.target.value); setError(null) }}
                placeholder="Your email address"
                className="px-4 py-3 rounded-xl bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-4 text-sm min-h-[48px] w-full sm:w-64"
                style={{ '--tw-ring-color': '#FFD700' } as React.CSSProperties}
              />
              <button
                type="submit"
                disabled={loading}
                className="px-6 py-3 text-white font-bold rounded-xl transition-all duration-150 min-h-[48px] disabled:opacity-60 disabled:cursor-not-allowed whitespace-nowrap hover:opacity-90 active:scale-95"
                style={{ backgroundColor: '#E8003D' }}
              >
                {loading ? 'Subscribing…' : `Get ${cityName} Alerts`}
              </button>
            </form>
            {error && <p className="mt-2 text-white/90 text-xs font-semibold">{error}</p>}
          </>
        )}
      </div>
    </section>
  )
}
