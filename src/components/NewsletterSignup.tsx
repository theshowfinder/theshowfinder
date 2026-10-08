'use client'

import { useState, FormEvent } from 'react'
import { subscribeNewsletter, type SubscribeResult } from '@/app/actions/newsletter'

export default function NewsletterSignup() {
  const [email,   setEmail]   = useState('')
  const [success, setSuccess] = useState<SubscribeResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!email.trim()) return
    setLoading(true)
    setError(null)
    const result = await subscribeNewsletter(email)
    setLoading(false)
    if (result.error) {
      setError(result.error)
    } else {
      setSuccess(result)
    }
  }

  // Three distinct outcomes, three distinct messages — never promises an
  // inbox email that wasn't actually sent (see SubscribeResult's comment
  // in src/app/actions/newsletter.tsx for why that distinction exists).
  function successCopy(result: SubscribeResult): { heading: string; body: string } {
    if (result.alreadySubscribed) {
      return { heading: "You're already on the list!", body: "No need to sign up again — you'll keep getting ticket alerts." }
    }
    if (result.emailDelivered === false) {
      return { heading: "You're on the list!", body: "We've saved your email, but the welcome email couldn't be sent — you'll still get ticket alerts." }
    }
    return { heading: "You're on the list!", body: 'Check your inbox — a welcome email is on its way.' }
  }

  return (
    // scroll-mt-20 keeps this section clear of the sticky header (h-16 /
    // 64px) when visitors land here via the header's "Get Ticket Alerts"
    // CTA (href="/#newsletter") rather than scrolling down manually.
    <section id="newsletter" className="w-full py-20 px-4 scroll-mt-20" style={{ backgroundColor: '#E8003D' }}>
      <div className="max-w-2xl mx-auto text-center">

        <h2 className="text-4xl sm:text-5xl font-extrabold text-white mb-4 leading-tight tracking-tight">
          Never Miss a Show
        </h2>

        <p className="text-white/80 text-lg mb-5 max-w-xl mx-auto leading-relaxed">
          Get the latest presales, onsales, tour announcements and local event picks in your inbox.
        </p>

        <div className="flex flex-wrap justify-center gap-2 mb-9 text-xs font-bold text-white/90">
          <span className="rounded-full bg-white/15 px-3 py-1.5">New announcements</span>
          <span className="rounded-full bg-white/15 px-3 py-1.5">Presale alerts</span>
          <span className="rounded-full bg-white/15 px-3 py-1.5">Local events</span>
        </div>

        {success ? (
          <div className="inline-flex flex-col items-center gap-2 bg-white/20 text-white px-8 py-6 rounded-2xl text-center max-w-sm mx-auto">
            <span className="text-3xl">🎉</span>
            <p className="font-extrabold text-lg">{successCopy(success).heading}</p>
            <p className="text-white/80 text-sm">{successCopy(success).body}</p>
          </div>
        ) : (
          <>
            <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3 justify-center max-w-lg mx-auto">
              <input
                type="email"
                required
                value={email}
                onChange={e => { setEmail(e.target.value); setError(null) }}
                placeholder="Enter your email address"
                className="flex-1 px-5 py-4 rounded-xl bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-4 text-base min-h-[56px]"
                style={{ '--tw-ring-color': '#FFD700' } as React.CSSProperties}
              />
              <button
                type="submit"
                disabled={loading}
                className="px-8 py-4 text-white font-extrabold rounded-xl transition-all duration-150 min-h-[56px] disabled:opacity-60 disabled:cursor-not-allowed whitespace-nowrap hover:opacity-90 active:scale-95"
                style={{ backgroundColor: '#1A1A2E' }}
              >
                {loading ? 'Subscribing…' : 'Get Alerts Free'}
              </button>
            </form>

            {error && (
              <p className="mt-3 text-white/90 text-sm font-semibold">{error}</p>
            )}
          </>
        )}

        <p className="mt-5 flex flex-wrap items-center justify-center gap-2 text-sm">
          <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-extrabold" style={{ backgroundColor: '#FFD84D', color: '#1A1A2E' }}>
            <span aria-hidden="true">✓</span> Free to join
          </span>
          <span className="text-white/65">Just your email · no spam · unsubscribe any time</span>
        </p>
      </div>
    </section>
  )
}
