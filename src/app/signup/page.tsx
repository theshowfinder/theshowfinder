'use client'

import { useState, FormEvent } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { signUp } from '@/app/actions/auth'

export default function SignupPage() {
  const router = useRouter()
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [confirm,  setConfirm]  = useState('')
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState<string | null>(null)
  const [done,     setDone]     = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    if (password.length < 6) {
      setError('Password must be at least 6 characters.')
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }

    setLoading(true)
    const result = await signUp(email, password)
    setLoading(false)

    if ('error' in result) {
      setError(result.error)
    } else if ('needsConfirmation' in result) {
      setDone(true)
    } else {
      router.push('/')
      router.refresh()
    }
  }

  return (
    <div className="min-h-[calc(100vh-64px)] flex items-center justify-center px-4 py-12" style={{ backgroundColor: '#1A1A2E' }}>
      <div className="w-full max-w-md">

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-2xl p-8 sm:p-10">

          {/* Header */}
          <div className="text-center mb-8">
            <Link href="/" className="inline-flex items-center gap-2 mb-6">
              <span className="text-2xl">🎟️</span>
              <span className="font-extrabold text-xl text-slate-900 tracking-tight">
                TheShow<span style={{ color: '#E8003D' }}>Finder</span>
              </span>
            </Link>
            <h1 className="text-2xl font-extrabold text-slate-900">Create your account</h1>
            <p className="text-slate-500 text-sm mt-1">Never miss a show you&apos;ll love</p>
          </div>

          {done ? (
            <div className="text-center py-4">
              <p className="text-4xl mb-4">📬</p>
              <h2 className="text-lg font-bold text-slate-900 mb-2">Check your inbox</h2>
              <p className="text-slate-500 text-sm">
                We&apos;ve sent a confirmation link to <strong>{email}</strong>.
                Click it to activate your account.
              </p>
              <Link
                href="/login"
                className="mt-6 inline-block text-sm font-semibold hover:underline"
                style={{ color: '#E8003D' }}
              >
                Back to sign in
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label htmlFor="email" className="block text-sm font-semibold text-slate-700 mb-1.5">
                  Email address
                </label>
                <input
                  id="email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:border-transparent text-base"
                  style={{ '--tw-ring-color': '#E8003D' } as React.CSSProperties}
                />
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-semibold text-slate-700 mb-1.5">
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  required
                  autoComplete="new-password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="At least 6 characters"
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:border-transparent text-base"
                  style={{ '--tw-ring-color': '#E8003D' } as React.CSSProperties}
                />
              </div>

              <div>
                <label htmlFor="confirm" className="block text-sm font-semibold text-slate-700 mb-1.5">
                  Confirm password
                </label>
                <input
                  id="confirm"
                  type="password"
                  required
                  autoComplete="new-password"
                  value={confirm}
                  onChange={e => setConfirm(e.target.value)}
                  placeholder="Repeat your password"
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:border-transparent text-base"
                  style={{ '--tw-ring-color': '#E8003D' } as React.CSSProperties}
                />
              </div>

              {error && (
                <p className="text-sm font-semibold text-red-600 bg-red-50 border border-red-200 px-4 py-3 rounded-xl">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full text-white font-extrabold py-3.5 rounded-xl hover:opacity-90 active:scale-95 transition-all duration-150 text-base disabled:opacity-60 disabled:cursor-not-allowed min-h-[52px]"
                style={{ backgroundColor: '#E8003D' }}
              >
                {loading ? 'Creating account…' : 'Create account'}
              </button>

              <p className="text-center text-sm text-slate-500">
                Already have an account?{' '}
                <Link href="/login" className="font-semibold hover:underline" style={{ color: '#E8003D' }}>
                  Sign in
                </Link>
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
