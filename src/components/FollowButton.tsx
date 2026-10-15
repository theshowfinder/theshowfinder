'use client'

// "Follow" for an artist or venue: email me when new shows are added. First time
// it asks for an email; once the visitor has followed anything on this browser,
// the next follow is a single tap. No account needed.

import { useState, type FormEvent } from 'react'
import Link from 'next/link'
import { followTarget, unfollowTarget } from '@/app/actions/follow'
import { trackEvent } from '@/lib/gtag'
import { showToast } from '@/lib/toast'
import { followKey, toggleFollowed, type FollowKind } from '@/lib/follows'
import { useFollowedKeys, writeFollowed, useRememberedEmail, rememberEmail } from './followStore'

interface FollowButtonProps {
  kind: FollowKind
  slug: string
  name: string
  /** Where it sits, stored with the follow: artist, venue, event ... */
  source: string
  variant?: 'dark' | 'light'
}

function Bell({ filled }: { filled: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.7 21a2 2 0 01-3.4 0" />
    </svg>
  )
}

export default function FollowButton({ kind, slug, name, source, variant = 'dark' }: FollowButtonProps) {
  const keys = useFollowedKeys()
  const savedEmail = useRememberedEmail()
  const key = followKey(kind, slug)
  const following = keys.includes(key)

  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [newsletter, setNewsletter] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [justFollowed, setJustFollowed] = useState(false)

  async function doFollow(address: string, alsoNewsletter: boolean) {
    setLoading(true)
    setError(null)
    const res = await followTarget(address, kind, slug, { source, alsoNewsletter })
    setLoading(false)
    if (res.error) {
      setError(res.error)
      return
    }
    rememberEmail(address.trim().toLowerCase())
    writeFollowed(toggleFollowed(keys.filter(k => k !== key), key))
    setOpen(false)
    setJustFollowed(true)
    showToast(`Following ${name}. We'll email you about new shows.`)
    trackEvent('follow', { kind, item_id: slug, source })
  }

  function onClick() {
    setError(null)
    if (following) {
      writeFollowed(keys.filter(k => k !== key))
      setJustFollowed(false)
      showToast(`Stopped following ${name}`)
      if (savedEmail) void unfollowTarget(savedEmail, kind, slug)
      trackEvent('unfollow', { kind, item_id: slug, source })
      return
    }
    if (savedEmail) {
      void doFollow(savedEmail, false)
    } else {
      setOpen(o => !o)
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (loading || !email.trim()) return
    void doFollow(email, newsletter)
  }

  const base = 'inline-flex items-center justify-center gap-2 min-h-[44px] px-5 rounded-xl border text-sm font-bold transition-colors disabled:opacity-60'
  const look = variant === 'dark'
    ? (following ? 'bg-white text-slate-900 border-white' : 'bg-white/10 border-white/30 text-white hover:bg-white/20')
    : (following ? 'bg-slate-900 text-white border-slate-900' : 'bg-white border-slate-300 text-slate-800 hover:bg-slate-50')

  return (
    <div className="inline-block max-w-full align-top">
      <button
        type="button"
        onClick={onClick}
        disabled={loading}
        aria-pressed={following}
        aria-label={following ? `Stop following ${name}` : `Follow ${name} for new show alerts`}
        className={`${base} ${look}`}
      >
        <Bell filled={following} />
        {loading ? 'Following…' : following ? 'Following' : 'Follow'}
      </button>

      {justFollowed && following && (
        <p role="status" className={`mt-2 text-sm max-w-xs ${variant === 'dark' ? 'text-white/80' : 'text-slate-600'}`}>
          {kind === 'artist' ? `We'll email you when new ${name} dates are announced.` : `We'll email you when new shows are added at ${name}.`}
        </p>
      )}

      {error && <p role="alert" className={`mt-2 text-sm max-w-xs font-semibold ${variant === 'dark' ? 'text-white' : 'text-red-600'}`}>{error}</p>}

      {open && !following && (
        <form onSubmit={onSubmit} className="mt-3 w-full max-w-sm rounded-2xl bg-white text-slate-900 p-4 shadow-lg border border-slate-200">
          <p className="font-extrabold">{kind === 'artist' ? `Follow ${name}` : `Follow ${name}`}</p>
          <p className="text-sm text-slate-600 mt-0.5">
            {kind === 'artist' ? 'We’ll email you when new dates are announced.' : 'We’ll email you when new shows are added here.'}
          </p>
          <div className="mt-3 flex gap-2">
            <input
              type="email"
              required
              autoComplete="email"
              inputMode="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
              aria-label="Your email address"
              className="flex-1 min-w-0 min-h-[44px] px-3 rounded-xl border border-slate-300 text-base"
            />
            <button type="submit" disabled={loading} className="min-h-[44px] px-4 rounded-xl text-white font-bold disabled:opacity-60" style={{ backgroundColor: '#E8003D' }}>
              {loading ? '…' : 'Follow'}
            </button>
          </div>
          <label className="mt-3 flex items-start gap-2 text-xs text-slate-500">
            <input type="checkbox" checked={newsletter} onChange={e => setNewsletter(e.target.checked)} className="mt-0.5" />
            <span>Also send me TheShowFinder&rsquo;s weekly gig tips and presale alerts.</span>
          </label>
          <p className="text-xs text-slate-400 mt-2">
            Only when something new is added. Stop any time. See our <Link href="/privacy-policy" className="underline">privacy policy</Link>.
          </p>
        </form>
      )}
    </div>
  )
}
