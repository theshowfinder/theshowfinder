'use client'

// The big "Get [artist] alerts" card for artist pages and event pages. It is a
// follow (see /api/cron/follow-alerts: email when new dates are added) plus the
// weekly email, stated beside the button, same as the on-sale reminder form.
// Shares the browser follow list with FollowButton, so following in one place
// shows as following in the other, and a returning visitor needs one tap.

import { useState, type FormEvent } from 'react'
import Link from 'next/link'
import { followTarget } from '@/app/actions/follow'
import { trackEvent } from '@/lib/gtag'
import { followKey, toggleFollowed } from '@/lib/follows'
import { useFollowedKeys, writeFollowed, useRememberedEmail, rememberEmail } from './followStore'
import { artistAlertCopy } from '@/lib/artistAlertCopy'

interface ArtistAlertCardProps {
  slug: string
  name: string
  /** Where it sits, stored with the follow: artist, event-sold-out, event ... */
  source: string
  heading?: string
  blurb?: string
}

export default function ArtistAlertCard({ slug, name, source, heading, blurb }: ArtistAlertCardProps) {
  const keys = useFollowedKeys()
  const savedEmail = useRememberedEmail()
  const key = followKey('artist', slug)
  const following = keys.includes(key)
  const copy = artistAlertCopy(name, {})

  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function follow(address: string) {
    setLoading(true)
    setError(null)
    const res = await followTarget(address, 'artist', slug, { source, alsoNewsletter: true })
    setLoading(false)
    if (res.error) {
      setError(res.error)
      return
    }
    rememberEmail(address.trim().toLowerCase())
    writeFollowed(toggleFollowed(keys.filter(k => k !== key), key))
    trackEvent('follow', { kind: 'artist', item_id: slug, source })
    trackEvent('newsletter_signup', { source: `alert-${source}` })
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (loading) return
    const address = email.trim() || savedEmail
    if (!address) return
    void follow(address)
  }

  return (
    <aside aria-label={`${name} alerts`} className="rounded-2xl p-5 bg-white border-2 shadow-sm" style={{ borderColor: '#E8003D' }}>
      {following ? (
        <div>
          <p className="font-extrabold text-slate-900">🔔 You&rsquo;re getting {name} alerts</p>
          <p className="text-sm text-slate-600 mt-1">
            We&rsquo;ll email you as soon as new {name} dates are announced. Every email has a stop link.
          </p>
        </div>
      ) : (
        <form onSubmit={onSubmit}>
          <p className="text-[11px] font-extrabold uppercase tracking-widest" style={{ color: '#E8003D' }}>🔔 Free alerts</p>
          <h3 className="font-extrabold text-slate-900 text-lg leading-snug mt-1">{heading ?? copy.heading}</h3>
          <p className="text-sm text-slate-600 mt-1">{blurb ?? copy.blurb}</p>
          <div className="mt-3 flex flex-col gap-2">
            {savedEmail ? (
              <p className="text-sm text-slate-500">Alerts will go to <span className="font-semibold text-slate-700">{savedEmail}</span></p>
            ) : (
              <input
                type="email"
                required
                autoComplete="email"
                inputMode="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
                aria-label="Your email address"
                className="w-full min-w-0 min-h-[48px] px-4 rounded-xl border border-slate-300 text-base"
              />
            )}
            <button
              type="submit"
              disabled={loading}
              className="w-full min-h-[48px] px-6 rounded-xl text-white font-bold disabled:opacity-60"
              style={{ backgroundColor: '#E8003D' }}
            >
              {loading ? 'Saving…' : `Alert me about ${name}`}
            </button>
          </div>
          {error && <p role="alert" className="text-sm text-red-600 mt-2">{error}</p>}
          <p className="text-xs text-slate-400 mt-3">
            You&rsquo;ll get an email when new {name} dates are added, plus our weekly email of presale alerts and gig tips. No spam, stop any time. See our <Link href="/privacy-policy" className="underline">privacy policy</Link>.
          </p>
        </form>
      )}
    </aside>
  )
}
