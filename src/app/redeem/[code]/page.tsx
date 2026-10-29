import type { Metadata } from 'next'
import { loadVoucher } from '@/lib/businessVouchers'
import { isVoucherCode, voucherState } from '@/lib/businessOffers'
import { redeemAction } from './actions'

// What restaurant staff see when they scan a voucher's QR code: is it valid, and a PIN box to mark it used.
export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Redeem voucher | TheShowFinder', robots: { index: false, follow: false } }

const at = (iso: string) => new Date(iso).toLocaleString('en-GB', { timeZone: 'Europe/London', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
const day = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { timeZone: 'Europe/London', weekday: 'long', day: 'numeric', month: 'long' })

export default async function RedeemPage({ params, searchParams }: { params: Promise<{ code: string }>; searchParams: Promise<{ done?: string; err?: string; left?: string }> }) {
  const { code } = await params
  const sp = await searchParams
  const v = isVoucherCode(code) ? await loadVoucher(code) : null
  const state = v ? voucherState(v, new Date()) : null

  let tone = 'bg-red-600', headline = 'Not a valid voucher', detail = 'This code does not match any TheShowFinder voucher.'
  if (v && sp.done === '1' && state === 'used') {
    tone = 'bg-green-600'; headline = 'Redeemed ✓'; detail = `Apply: ${v.offer_text}`
  } else if (v && state === 'valid') {
    tone = 'bg-green-600'; headline = 'Valid voucher'; detail = v.offer_text
  } else if (v && state === 'used') {
    headline = 'Already used'; detail = `Used ${at(v.redeemed_at!)}. Do not apply the offer again.`
  } else if (v && state === 'expired') {
    headline = 'Expired'; detail = `This voucher ended ${at(v.expires_at)}.`
  } else if (v && state === 'not-yet') {
    tone = 'bg-amber-500'; headline = 'Not valid yet'; detail = `This voucher is for ${day(v.valid_from)}.`
  } else if (v && state === 'locked') {
    headline = 'Locked'; detail = 'Too many wrong PINs. Do not apply the offer; contact hello@theshowfinder.com.'
  }

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-10">
      <div className="mx-auto max-w-sm overflow-hidden rounded-3xl bg-white shadow-lg">
        <div className={`${tone} px-6 py-6 text-center text-white`}>
          <p className="text-xs font-bold uppercase tracking-widest opacity-80">TheShowFinder · staff check</p>
          <p className="mt-1 text-3xl font-black">{headline}</p>
        </div>
        <div className="px-6 py-6 text-center">
          {v && <p className="text-sm font-semibold text-slate-500">{v.business.name}</p>}
          <p className="mt-1 text-xl font-extrabold text-slate-900">{detail}</p>
          {v && <p className="mt-2 font-mono text-lg tracking-[0.25em] text-slate-600">{v.code}</p>}
          {v && v.event && <p className="mt-1 text-xs text-slate-500">For {v.event.title}</p>}
          {v && state === 'valid' && (
            <form action={redeemAction.bind(null, v.code)} className="mt-6 space-y-3">
              {sp.err === 'wrong-pin' && <p className="text-sm font-bold text-red-600">Wrong PIN. {sp.left} {sp.left === '1' ? 'try' : 'tries'} left.</p>}
              <label className="block text-sm font-bold text-slate-700">Staff PIN
                <input name="pin" inputMode="numeric" pattern="[0-9]{4}" maxLength={4} required autoComplete="off" className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 text-center font-mono text-2xl tracking-[0.5em]" />
              </label>
              <button className="w-full rounded-xl bg-slate-900 px-4 py-4 text-lg font-bold text-white">Mark as used</button>
              <p className="text-xs text-slate-400">Only press this when applying the offer. Each voucher works once.</p>
            </form>
          )}
        </div>
      </div>
    </main>
  )
}
