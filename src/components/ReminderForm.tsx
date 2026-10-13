'use client'

// "Email me before tickets go on sale". Used on event pages (one show) and the
// saved-shows page (all saved shows that have not gone on sale yet).

import { useState, type FormEvent } from 'react'
import Link from 'next/link'
import { requestOnSaleReminders } from '@/app/actions/reminders'
import { trackEvent } from '@/lib/gtag'

interface ReminderFormProps {
  slugs: string[]
  source: string
  heading: string
  blurb?: string
  buttonLabel?: string
  /** Called after a successful sign-up (e.g. to also save the show). */
  onDone?: () => void
}

export default function ReminderForm({ slugs, source, heading, blurb, buttonLabel = 'Remind me', onDone }: ReminderFormProps) {
  const [email, setEmail] = useState('')
  const [newsletter, setNewsletter] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [doneCount, setDoneCount] = useState<number | null>(null)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (loading || !email.trim()) return
    setLoading(true)
    setError(null)
    const res = await requestOnSaleReminders(email, slugs, { source, alsoNewsletter: newsletter })
    setLoading(false)
    if (res.error) {
      setError(res.error)
      return
    }
    setDoneCount(res.saved ?? 0)
    trackEvent('onsale_reminder', { source, shows: res.saved ?? 0 })
    onDone?.()
  }

  return (
    <aside aria-label="On-sale reminder" className="rounded-2xl p-5 bg-white border-2" style={{ borderColor: '#E8003D' }}>
      {doneCount !== null ? (
        <div>
          <p className="font-extrabold text-slate-900">You&rsquo;re all set</p>
          <p className="text-sm text-slate-600 mt-1">
            We&rsquo;ll email you before {doneCount === 1 ? 'tickets go' : 'these shows go'} on sale. It&rsquo;s a one-off email for each show.
          </p>
        </div>
      ) : (
        <form onSubmit={onSubmit}>
          <h3 className="font-extrabold text-slate-900">{heading}</h3>
          {blurb && <p className="text-sm text-slate-600 mt-1">{blurb}</p>}
          <div className="mt-3 flex flex-col sm:flex-row gap-2">
            <input
              type="email"
              required
              autoComplete="email"
              inputMode="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
              aria-label="Your email address"
              className="flex-1 min-h-[48px] px-4 rounded-xl border border-slate-300 text-base"
            />
            <button
              type="submit"
              disabled={loading}
              className="min-h-[48px] px-6 rounded-xl text-white font-bold disabled:opacity-60"
              style={{ backgroundColor: '#E8003D' }}
            >
              {loading ? 'Saving…' : buttonLabel}
            </button>
          </div>
          <label className="mt-3 flex items-start gap-2 text-xs text-slate-500">
            <input type="checkbox" checked={newsletter} onChange={e => setNewsletter(e.target.checked)} className="mt-0.5" />
            <span>Also send me TheShowFinder&rsquo;s weekly gig tips and presale alerts.</span>
          </label>
          {error && <p role="alert" className="text-sm text-red-600 mt-2">{error}</p>}
          <p className="text-xs text-slate-400 mt-3">
            One email per show, no spam. See our <Link href="/privacy-policy" className="underline">privacy policy</Link>.
          </p>
        </form>
      )}
    </aside>
  )
}
