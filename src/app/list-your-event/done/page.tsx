import type { Metadata } from 'next'
import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/admin'
import BoostButtons from '../BoostButtons'
import { promoterActive } from '@/lib/organiserPublish'
import { refreshStripeAccount } from '@/lib/ticketPayments'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Your event listing', robots: { index: false, follow: false } }

type Sub = {
  id: string; title: string; status: string; boost_paid_at: string | null; start_date: string; manage_token: string; free_capacity: number | null; paid_price_pence: number | null
  events: { slug: string } | null
  organisers: { plan: string; plan_status: string | null; stripe_account_id: string | null; stripe_charges_enabled: boolean } | null
}

function isFuture(iso: string): boolean {
  return new Date(iso).getTime() > Date.now()
}

export default async function ListingDonePage({ searchParams }: { searchParams: Promise<{ s?: string; t?: string; paid?: string; stripe?: string }> }) {
  const { s, t, paid, stripe } = await searchParams
  let sub: Sub | null = null
  if (s && t && /^[0-9a-f-]{36}$/.test(s)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (createAdminClient() as any).from('event_submissions')
      .select('id, title, status, boost_paid_at, start_date, manage_token, free_capacity, paid_price_pence, events(slug), organisers(plan, plan_status, stripe_account_id, stripe_charges_enabled)')
      .eq('id', s).eq('manage_token', t).maybeSingle()
    sub = data as Sub | null
    // Back from Stripe's sign-up pages: read their account now, so tickets go on sale straight away.
    if (sub?.organisers?.stripe_account_id && stripe === 'back') {
      try {
        const r = await refreshStripeAccount(createAdminClient(), sub.organisers.stripe_account_id)
        sub.organisers.stripe_charges_enabled = r.chargesEnabled
      } catch (err) { console.error('[done] stripe refresh failed', err) }
    }
  }
  const card = 'mx-auto max-w-xl rounded-3xl border border-slate-200 bg-white p-7 sm:p-10 shadow-sm'
  if (!sub) {
    return <main className="min-h-screen bg-[#F5F5F0] px-4 py-16"><div className={card}><h1 className="text-2xl font-black text-slate-950">Listing not found</h1><p className="mt-3 text-slate-600">Please use the link in your email, or <Link href="/list-your-event" className="underline">list a new event</Link>.</p></div></main>
  }
  const promoter = promoterActive(sub.organisers)
  const boosted = !!sub.boost_paid_at || promoter
  const live = sub.status === 'approved' && sub.events?.slug
  const future = isFuture(sub.start_date)
  return (
    <main className="min-h-screen bg-[#F5F5F0] px-4 py-16">
      <div className={card}>
        <p className="text-4xl">{paid ? '🎉' : '✓'}</p>
        <h1 className="mt-3 text-2xl sm:text-3xl font-black text-slate-950">
          {paid ? 'Payment received, thank you!' : live ? 'Your event is live' : sub.status === 'rejected' ? 'This listing wasn’t approved' : 'Thanks, we’ve got your event'}
        </h1>
        <p className="mt-3 text-slate-600 leading-relaxed">
          <strong className="text-slate-900">{sub.title}</strong>{' '}
          {live ? 'is on TheShowFinder now, on your city page, the venue page and in search.' : sub.status === 'pending' ? 'will usually be live within a day. We’ll email you when it is.' : ''}
          {paid && (live ? ' Your boost is on: it’s featured from now until the night.' : ' Your boost starts as soon as the listing goes live.')}
        </p>
        {live && <Link href={`/events/${sub.events!.slug}`} className="mt-5 inline-flex rounded-xl bg-slate-950 px-5 py-3 text-sm font-extrabold text-white">See your listing →</Link>}

        {sub.paid_price_pence && sub.status !== 'rejected' && (
          <div className="mt-6 rounded-2xl border-2 border-slate-900 p-5">
            {sub.organisers?.stripe_charges_enabled ? (
              <>
                <p className="font-extrabold text-slate-900">✓ Payouts are set up</p>
                <p className="mt-1 text-sm text-slate-600">{live ? 'Your tickets are on sale on your event page.' : 'Your tickets go on sale as soon as your listing is live.'} Your takings are paid to your bank the day after the event.</p>
              </>
            ) : (
              <>
                <p className="font-extrabold text-slate-900">Set up payouts to start selling</p>
                <p className="mt-1 text-sm text-slate-600">Stripe, the payment company, checks your details and the bank account your ticket money goes to. It takes about 5 minutes. {stripe === 'back' ? 'Stripe still needs a few details from you.' : ''}{stripe === 'error' || stripe === 'unavailable' ? 'Stripe couldn’t be opened just now. Please try again in a few minutes.' : ''}</p>
                <a href={`/api/organisers/stripe-connect?s=${sub.id}&t=${sub.manage_token}`} className="mt-3 inline-flex rounded-xl bg-slate-950 px-5 py-3 text-sm font-extrabold text-white">Set up payouts with Stripe →</a>
              </>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              <Link href={`/tickets/door?s=${sub.id}&t=${sub.manage_token}`} className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-extrabold text-slate-900">Door scanner</Link>
              <a href={`/api/tickets/attendees?s=${sub.id}&t=${sub.manage_token}`} className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-extrabold text-slate-900">Attendee list</a>
            </div>
          </div>
        )}

        {live && sub.free_capacity && (
          <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-5">
            <p className="font-extrabold text-slate-900">Your {sub.free_capacity} free tickets are on</p>
            <p className="mt-1 text-sm text-slate-600">People claim them on your event page and get a QR ticket by email. On the night, open your door scanner on your phone. It’s also in your email. Keep it private.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link href={`/tickets/door?s=${sub.id}&t=${sub.manage_token}`} className="rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-extrabold text-white">Door scanner</Link>
              <a href={`/api/tickets/attendees?s=${sub.id}&t=${sub.manage_token}`} className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-extrabold text-slate-900">Attendee list</a>
            </div>
          </div>
        )}

        {!boosted && future && sub.status !== 'rejected' && (
          <div className="mt-8 rounded-2xl border-2 p-5" style={{ borderColor: '#E8003D' }}>
            <p className="text-xs font-extrabold uppercase tracking-widest" style={{ color: '#E8003D' }}>Get more people to see it</p>
            <h2 className="mt-1 text-xl font-extrabold text-slate-900">Boost your event for £9.95</h2>
            <ul className="mt-3 space-y-1.5 text-sm text-slate-700 list-disc pl-5">
              <li>Featured at the top of your city page right up to the night</li>
              <li>Top of “This weekend” and “What’s on this week” when it’s on</li>
              <li>Included in our social posts for your city</li>
              <li>A mention in our weekly email to local gig-goers</li>
            </ul>
            <div className="mt-5"><BoostButtons s={sub.id} t={sub.manage_token} showBoost showPromoter /></div>
            <p className="mt-3 text-xs text-slate-500">Running regular nights? The Promoter plan boosts every event you list and gives you your own promoter page. Monthly, cancel any time.</p>
          </div>
        )}
        <p className="mt-8 text-sm text-slate-500">Got another event? <Link href="/list-your-event" className="underline font-semibold">List it here</Link>.</p>
      </div>
    </main>
  )
}
