'use client'

// Requires an explicit click before anything changes — a GET request that
// unsubscribed on page load alone would mean a link preview, a spam filter,
// or any other automated fetch of the welcome email's unsubscribe link
// could silently unsubscribe someone who never saw the page. See
// src/app/actions/newsletter.tsx's unsubscribeNewsletter for the actual
// database change this triggers.

import { useState } from 'react'
import { unsubscribeNewsletter } from '@/app/actions/newsletter'

export default function UnsubscribeConfirm({ email }: { email: string }) {
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  async function handleConfirm() {
    setState('loading')
    const result = await unsubscribeNewsletter(email)
    if (result.error) {
      setErrorMessage(result.error)
      setState('error')
    } else {
      setState('done')
    }
  }

  if (state === 'done') {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-7 text-center">
        <p className="text-3xl mb-2">✓</p>
        <p className="font-extrabold text-slate-900 mb-1">You&apos;re unsubscribed</p>
        <p className="text-slate-500 text-sm">
          {email} won&apos;t receive any more emails from TheShowFinder. Changed your mind? You can sign up again any time.
        </p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-7 text-center">
      <p className="text-slate-600 text-sm mb-5">
        Unsubscribe <span className="font-bold text-slate-900">{email}</span> from TheShowFinder emails?
      </p>
      <button
        type="button"
        onClick={handleConfirm}
        disabled={state === 'loading'}
        className="inline-block font-bold text-white px-6 py-3 rounded-xl hover:opacity-90 transition-opacity text-sm disabled:opacity-60 disabled:cursor-not-allowed"
        style={{ backgroundColor: '#E8003D' }}
      >
        {state === 'loading' ? 'Unsubscribing…' : 'Confirm unsubscribe'}
      </button>
      {state === 'error' && errorMessage && (
        <p className="mt-3 text-red-600 text-sm font-semibold">{errorMessage}</p>
      )}
    </div>
  )
}
