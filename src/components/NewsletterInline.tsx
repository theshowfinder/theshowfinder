'use client'

import { useState, FormEvent } from 'react'
import Link from 'next/link'
import { subscribeNewsletter, type SubscribeResult } from '@/app/actions/newsletter'
import { trackEvent } from '@/lib/gtag'

interface Props {
  // Page type, stored with the subscriber: "event", "artist", "venue", ...
  source: string
  // What the visitor is looking at (artist / show / venue name) — used in the
  // copy and stored as the subscriber's interest.
  subject?: string
  // City tag for the subscriber (see subscribers.city).
  city?: string
  heading?: string
  blurb?: string
  buttonLabel?: string
}

// Compact, self-contained sign-up card for content pages (event, artist,
// venue, West End, news, ...). The big homepage banner and the city banner
// have their own components; this one is the same server action with
// per-page copy and attribution.
export default function NewsletterInline({
  source,
  subject,
  city,
  heading,
  blurb,
  buttonLabel = 'Get alerts',
}: Props) {
  const [email,   setEmail]   = useState('')
  const [result,  setResult]  = useState<SubscribeResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState<string | null>(null)

  const title = heading ?? (subject ? `Get alerts for ${subject}` : 'Never miss a show')
  const text  = blurb ?? (subject
    ? `Be the first to know about new dates, presales and on-sale times for ${subject}.`
    : 'Presales, on-sale dates and tour announcements, straight to your inbox.')

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!email.trim() || loading) return
    setLoading(true)
    setError(null)
    const res = await subscribeNewsletter(email, city, { source, interest: subject })
    setLoading(false)
    if (res.error) {
      setError(res.error)
      return
    }
    setResult(res)
    if (!res.alreadySubscribed) trackEvent('newsletter_signup', { source })
  }

  return (
    <aside
      aria-label="Email alerts"
      className="rounded-2xl p-5 sm:p-6 text-white"
      style={{ background: 'linear-gradient(135deg, #1A1A2E 0%, #25254A 100%)' }}
    >
      {result ? (
        <div className="flex items-start gap-3">
          <span className="text-2xl" aria-hidden="true">🎉</span>
          <div>
            <p className="font-extrabold">
              {result.alreadySubscribed ? "You're already on the list" : "You're on the list"}
            </p>
            <p className="text-sm text-white/70 mt-0.5">
              {result.alreadySubscribed
                ? "You'll keep getting ticket alerts."
                : result.emailDelivered === false
                  ? "We've saved your email — you'll get ticket alerts."
                  : 'Check your inbox for a welcome email.'}
            </p>
          </div>
        </div>
      ) : (
        <>
          <p className="text-xs font-extrabold uppercase tracking-[0.18em] mb-1" style={{ color: '#FFD84D' }}>
            Free ticket alerts
          </p>
          <h2 className="text-lg sm:text-xl font-extrabold leading-tight">{title}</h2>
          <p className="text-sm text-white/70 mt-1 mb-4 leading-relaxed">{text}</p>

          <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-2.5">
            <label htmlFor={`nl-${source}`} className="sr-only">Email address</label>
            <input
              id={`nl-${source}`}
              type="email"
              required
              autoComplete="email"
              inputMode="email"
              value={email}
              onChange={e => { setEmail(e.target.value); setError(null) }}
              placeholder="Your email address"
              className="flex-1 min-w-0 px-4 py-3 rounded-xl bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-4 text-base min-h-[48px]"
              style={{ '--tw-ring-color': '#FFD700' } as React.CSSProperties}
            />
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-3 text-white font-extrabold rounded-xl min-h-[48px] whitespace-nowrap disabled:opacity-60 disabled:cursor-not-allowed hover:opacity-90 active:scale-95 transition"
              style={{ backgroundColor: '#E8003D' }}
            >
              {loading ? 'Subscribing…' : buttonLabel}
            </button>
          </form>

          {error && <p role="alert" className="mt-2 text-sm font-semibold text-white/90">{error}</p>}

          <p className="mt-3 text-xs text-white/50 leading-relaxed">
            Free. By subscribing you agree to receive our emails and to our{' '}
            <Link href="/privacy-policy" className="underline hover:text-white">Privacy Policy</Link>.
            Unsubscribe any time.
          </p>
        </>
      )}
    </aside>
  )
}
