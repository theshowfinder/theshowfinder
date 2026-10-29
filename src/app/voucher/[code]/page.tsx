import type { Metadata } from 'next'
import Link from 'next/link'
import QRCode from 'qrcode'
import { loadVoucher, SITE } from '@/lib/businessVouchers'
import { isVoucherCode, voucherState } from '@/lib/businessOffers'
import { safeWebsite } from '@/lib/localPlacements'
import { emailVoucherAction } from './actions'

// The visitor's voucher: show it at the counter, staff scan the QR (it opens /redeem/<code>) and enter their PIN.
export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Your voucher | TheShowFinder', robots: { index: false, follow: false } }

const day = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { timeZone: 'Europe/London', weekday: 'long', day: 'numeric', month: 'long' })

function Shell({ children }: { children: React.ReactNode }) {
  return <main className="min-h-screen bg-[#F5F5F0] px-4 py-10"><div className="mx-auto max-w-md">{children}</div></main>
}

export default async function VoucherPage({ params, searchParams }: { params: Promise<{ code: string }>; searchParams: Promise<{ sent?: string }> }) {
  const { code } = await params
  const { sent } = await searchParams
  const v = isVoucherCode(code) ? await loadVoucher(code) : null
  if (!v) {
    return <Shell><div className="rounded-2xl bg-white p-8 text-center shadow-sm"><h1 className="text-xl font-extrabold text-slate-900">This offer is no longer available</h1><p className="mt-2 text-sm text-slate-500">The business may have changed or ended its offer.</p><Link href="/" className="mt-6 inline-block font-bold text-[#E8003D]">Back to TheShowFinder →</Link></div></Shell>
  }
  const state = voucherState(v, new Date())
  const qr = await QRCode.toString(`${SITE}/redeem/${v.code}`, { type: 'svg', margin: 1, width: 220, errorCorrectionLevel: 'M' })
  const lastDay = day(new Date(new Date(v.expires_at).getTime() - 1).toISOString())
  const validText = v.source === 'event' ? `Valid on ${day(v.valid_from)}` : `Valid until ${lastDay}`
  const booking = safeWebsite(v.business.booking_url)
  const banner: Record<string, string> = { used: 'This voucher has been used.', expired: 'This voucher has expired.', locked: 'This voucher is locked. Please ask staff to contact TheShowFinder.' }

  return (
    <Shell>
      <div className="overflow-hidden rounded-3xl bg-white shadow-lg">
        <div className="bg-slate-950 px-6 py-5 text-white">
          <p className="text-xs font-bold uppercase tracking-widest text-amber-300">TheShowFinder voucher</p>
          <h1 className="mt-1 text-2xl font-black leading-tight">{v.business.name}</h1>
          <p className="text-sm text-slate-300">{[v.business.address, v.business.postcode].filter(Boolean).join(', ') || v.business.city}</p>
        </div>
        <div className="px-6 py-6 text-center">
          <p className="text-2xl font-black text-[#E8003D]">{v.offer_text}</p>
          <p className="mt-1 text-sm font-semibold text-slate-600">{validText}</p>
          {v.event && <p className="mt-1 text-xs text-slate-500">With your ticket for {v.event.title}</p>}
          {state === 'valid' || state === 'not-yet' ? (
            <>
              <div className="mx-auto mt-5 w-56" dangerouslySetInnerHTML={{ __html: qr }} />
              <p className="mt-3 font-mono text-3xl font-black tracking-[0.3em] text-slate-900">{v.code}</p>
              <p className="mt-4 text-sm text-slate-600">Show this screen when you order or pay. Staff scan the code to apply your offer. One use only.</p>
            </>
          ) : (
            <p className="mt-6 rounded-xl bg-slate-100 p-4 font-bold text-slate-700">{banner[state]}</p>
          )}
          {booking && <a href={`/out/biz/${v.business.id}?k=booking`} target="_blank" rel="sponsored noopener" className="mt-5 inline-block rounded-xl bg-[#E8003D] px-5 py-3 font-bold text-white">Book a table →</a>}
        </div>
      </div>

      {(state === 'valid' || state === 'not-yet') && (
        <div className="mt-6 rounded-2xl bg-white p-6 shadow-sm">
          {sent === '1' ? <p className="font-bold text-green-700">Sent. Check your inbox for your voucher.</p> : (
            <form action={emailVoucherAction.bind(null, v.code)} className="space-y-3">
              <p className="font-bold text-slate-900">Email this voucher to yourself</p>
              {sent === 'bad' && <p className="text-sm text-red-600">Please enter a valid email address.</p>}
              {sent === 'fail' && <p className="text-sm text-red-600">That didn&apos;t send. Please try again.</p>}
              <input name="email" type="email" required placeholder="you@example.com" className="w-full rounded-xl border border-slate-300 px-4 py-3" />
              <label className="flex items-start gap-2 text-sm text-slate-600"><input type="checkbox" name="newsletter" className="mt-1" /> Also send me what&apos;s on in {v.business.city} each week (unsubscribe any time)</label>
              <button className="w-full rounded-xl bg-slate-900 px-4 py-3 font-bold text-white">Send voucher</button>
            </form>
          )}
        </div>
      )}
      <p className="mt-6 text-center text-xs text-slate-400">Offer provided by {v.business.name}, subject to their terms. <Link href="/" className="underline">TheShowFinder</Link></p>
    </Shell>
  )
}
