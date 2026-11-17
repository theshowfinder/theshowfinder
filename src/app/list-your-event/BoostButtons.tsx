'use client'

import { useState } from 'react'
import { BOOST_PRICE_GBP, PROMOTER_PRICE_GBP } from '@/lib/organiserEvents'

export default function BoostButtons({ s, t, showBoost, showPromoter }: { s: string; t: string; showBoost: boolean; showPromoter: boolean }) {
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  async function go(kind: 'boost' | 'promoter') {
    setBusy(kind); setError(null)
    const res = await fetch('/api/list-your-event/boost', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ s, t, kind }) })
    const json = await res.json().catch(() => ({})) as { checkoutUrl?: string; error?: string }
    if (json.checkoutUrl) { window.location.href = json.checkoutUrl; return }
    setBusy(null); setError(json.error ?? 'Something went wrong. Please try again.')
  }
  return (
    <div className="space-y-3">
      {showBoost && (
        <button type="button" disabled={!!busy} onClick={() => go('boost')} className="w-full min-h-[52px] rounded-xl text-white font-extrabold disabled:opacity-60" style={{ backgroundColor: '#E8003D' }}>
          {busy === 'boost' ? 'Opening payment…' : `Boost this event · £${BOOST_PRICE_GBP.toFixed(2)}`}
        </button>
      )}
      {showPromoter && (
        <button type="button" disabled={!!busy} onClick={() => go('promoter')} className="w-full min-h-[52px] rounded-xl border-2 border-slate-900 text-slate-900 font-extrabold disabled:opacity-60">
          {busy === 'promoter' ? 'Opening payment…' : `Promoter plan: every event boosted · £${PROMOTER_PRICE_GBP.toFixed(2)}/month`}
        </button>
      )}
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    </div>
  )
}
