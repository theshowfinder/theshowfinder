'use client'

import { useState, FormEvent } from 'react'
import { subscribeNewsletter, type SubscribeResult } from '@/app/actions/newsletter'

export default function CityNewsletterForm({ cityName }: { cityName: string }) {
  const [email,   setEmail]   = useState('')
  const [success, setSuccess] = useState<SubscribeResult | null>(null)
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
      setSuccess(result)
    }
  }

  return (
    <section
      className="relative overflow-hidden rounded-2xl px-6 py-8 sm:px-10 sm:py-10 flex flex-col sm:flex-row items-center gap-7 sm:gap-10"
      style={{ background: 'linear-gradient(135deg, #1A1A2E 0%, #25254A 60%, #3B1D4A 100%)' }}
    >
      <div className="absolute -right-12 -top-16 h-40 w-40 rounded-full opacity-20" style={{ backgroundColor: '#FFB800' }} aria-hidden="true" />
      <div className="flex-1 text-center sm:text-left">
        <p className="text-xs font-extrabold uppercase tracking-[0.2em] mb-2" style={{ color: '#FFD84D' }}>
          {cityName} ticket alerts
        </p>
        <h2 className="text-2xl sm:text-3xl font-extrabold text-white mb-2 leading-tight">
          Never miss a {cityName} show
        </h2>
        <p className="text-white/70 text-sm leading-relaxed max-w-md">
          Get the best new concerts, presales and ticket-sale alerts in {cityName}, before you miss out.
        </p>
        <div className="flex flex-wrap justify-center sm:justify-start gap-2 mt-4 text-xs font-semibold text-white/75">
          <span className="rounded-full bg-white/10 px-3 py-1">Early alerts</span>
          <span className="rounded-full bg-white/10 px-3 py-1">Local picks</span>
          <span className="rounded-full bg-white/10 px-3 py-1">No spam</span>
        </div>
      </div>

      <div className="w-full sm:w-auto shrink-0">
        {success ? (
          <div className="flex items-center gap-2 text-white font-semibold text-sm justify-center sm:justify-start">
            <span className="text-xl">🎉</span>
            {success.alreadySubscribed ? "You're already on the list!" : "You're on the list!"}
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
            <p className="mt-2 text-white/45 text-xs">Free to join · unsubscribe any time</p>
            {error && <p className="mt-2 text-white/90 text-xs font-semibold">{error}</p>}
          </>
        )}
      </div>
    </section>
  )
}
