'use client'

import { useState, FormEvent } from 'react'
import Link from 'next/link'
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
    const result = await subscribeNewsletter(email, undefined, { source: 'homepage' })
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
    <section id="newsletter" className="w-full px-4 py-8 sm:py-10 scroll-mt-20" style={{ backgroundColor: '#E8003D' }}>
      <div className="max-w-6xl mx-auto flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
        <div className="max-w-xl text-center lg:text-left">
          <h2 className="text-2xl sm:text-3xl font-extrabold text-white leading-tight tracking-tight">
            Never Miss a Show
          </h2>
          <p className="text-white/80 text-sm sm:text-base mt-2 leading-relaxed">
            Get new show announcements, ticket alerts and local event picks in your inbox.
          </p>
        </div>

        <div className="w-full max-w-xl">
          {success ? (
            <div className="inline-flex flex-col gap-1 bg-white/20 text-white px-5 py-4 rounded-xl text-left">
              <p className="font-extrabold">{successCopy(success).heading}</p>
              <p className="text-white/80 text-sm">{successCopy(success).body}</p>
            </div>
          ) : (
            <>
              <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-2">
                <input
                  type="email"
                  required
                  value={email}
                  onChange={e => { setEmail(e.target.value); setError(null) }}
                  placeholder="Enter your email address"
                  aria-label="Email address"
                  className="flex-1 px-4 py-3 rounded-xl bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-4 text-base min-h-[48px]"
                  style={{ '--tw-ring-color': '#FFD700' } as React.CSSProperties}
                />
                <button
                  type="submit"
                  disabled={loading}
                  className="px-6 py-3 text-white font-extrabold rounded-xl transition-all duration-150 min-h-[48px] disabled:opacity-60 disabled:cursor-not-allowed whitespace-nowrap hover:opacity-90 active:scale-95"
                  style={{ backgroundColor: '#1A1A2E' }}
                >
                  {loading ? 'Subscribing…' : 'Get Alerts Free'}
                </button>
              </form>
              {error && <p className="mt-2 text-white/90 text-sm font-semibold">{error}</p>}
            </>
          )}
          <p className="mt-2 text-xs text-white/65 text-center sm:text-left">
            Free to join · no spam · unsubscribe any time · <Link href="/privacy-policy" className="underline hover:text-white">Privacy</Link>
          </p>
        </div>
      </div>
    </section>
  )}
