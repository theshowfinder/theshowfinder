'use client'

import { useState, FormEvent } from 'react'

export default function NewsletterSignup() {
  const [email,   setEmail]   = useState('')
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!email.trim()) return
    setLoading(true)
    // TODO: wire to email provider (Resend / Mailchimp)
    await new Promise(r => setTimeout(r, 700))
    setSuccess(true)
    setLoading(false)
  }

  return (
    <section className="w-full py-20 px-4" style={{ backgroundColor: '#E8003D' }}>
      <div className="max-w-2xl mx-auto text-center">

        <h2 className="text-4xl sm:text-5xl font-extrabold text-white mb-4 leading-tight tracking-tight">
          Never Miss a Show
        </h2>

        <p className="text-white/80 text-lg mb-10 max-w-xl mx-auto leading-relaxed">
          Get alerts the moment tickets go on sale for your favourite artists.
        </p>

        {success ? (
          <div className="inline-flex items-center gap-3 bg-white/20 text-white font-bold px-8 py-5 rounded-2xl text-lg">
            ✅ You&apos;re on the list! Watch your inbox.
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3 justify-center max-w-lg mx-auto">
            <input
              type="email"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
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
        )}

        <p className="mt-5 text-white/50 text-sm">No spam. Unsubscribe any time.</p>
      </div>
    </section>
  )
}
