import type { Metadata } from 'next'
import Link from 'next/link'
import { organiserFrom, loadOrganiser, loadEvents } from '@/lib/organiserDashboard'
import { organiserQuery } from '@/lib/organiserAccess'
import { gbpFromPence } from '@/lib/tickets'
import { requestLinkAction } from './actions'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Organiser dashboard', robots: { index: false, follow: false }, referrer: 'no-referrer' }

const card = 'rounded-3xl border border-slate-200 bg-white p-6 sm:p-8 shadow-sm'
const when = (iso: string) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(iso))

/** Finished: started more than 6 hours ago. */
function isPast(iso: string): boolean {
  return Date.parse(iso) <= Date.now() - 6 * 3600_000
}

export default async function OrganiserPage({ searchParams }: { searchParams: Promise<{ o?: string; e?: string; k?: string; sent?: string; expired?: string }> }) {
  const sp = await searchParams
  const organiserId = organiserFrom(sp)
  if (!organiserId) return <SignIn sent={!!sp.sent} expired={!!sp.expired || !!sp.o} />
  const [org, events] = await Promise.all([loadOrganiser(organiserId), loadEvents(organiserId)])
  if (!org) return <SignIn sent={false} expired />
  const q = organiserQuery({ o: sp.o!, e: sp.e!, k: sp.k! })
  const upcoming = events.filter(e => !isPast(e.startDate)).reverse()
  const past = events.filter(e => isPast(e.startDate))
  const sellsPaid = events.some(e => e.ticketing === 'paid')
  const firstPaid = events.find(e => e.ticketing === 'paid')

  return (
    <main className="min-h-screen bg-[#F5F5F0] px-4 py-10">
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-widest text-[#E8003D]">Organiser dashboard</p>
            <h1 className="text-3xl font-black text-slate-950">{org.name}</h1>
          </div>
          <Link href={`/list-your-event`} className="rounded-full bg-[#E8003D] px-5 py-3 text-sm font-extrabold text-white">+ List another event</Link>
        </div>

        {sellsPaid && (
          <div className={card}>
            <h2 className="text-lg font-extrabold text-slate-900">Payouts</h2>
            {org.stripe_charges_enabled ? (
              <p className="mt-1 text-sm text-slate-600">✓ Set up. Ticket money goes to your Stripe account as you sell and on to your bank, usually within a few days. <a href="https://dashboard.stripe.com" target="_blank" rel="noopener" className="underline font-semibold">Open your Stripe dashboard</a> to see every payment.</p>
            ) : (
              <p className="mt-1 text-sm text-slate-600">Not set up yet, so your paid tickets aren’t on sale. {firstPaid && <a href={`/api/organisers/stripe-connect?s=${firstPaid.submissionId}&t=${firstPaid.manageToken}`} className="underline font-bold text-slate-900">Set up payouts with Stripe (about 5 minutes) →</a>}</p>
            )}
          </div>
        )}

        <section className={card}>
          <h2 className="text-lg font-extrabold text-slate-900">Coming up</h2>
          {upcoming.length ? <EventList events={upcoming} q={q} /> : <p className="mt-2 text-sm text-slate-600">Nothing coming up. <Link href="/list-your-event" className="underline font-semibold">List an event</Link>.</p>}
        </section>
        {past.length > 0 && (
          <section className={card}>
            <h2 className="text-lg font-extrabold text-slate-900">Past events</h2>
            <EventList events={past.slice(0, 30)} q={q} />
          </section>
        )}
        <p className="text-center text-xs text-slate-500">This link works for 30 days. Keep it private: anyone with it can manage your events. Questions? <a href="mailto:hello@theshowfinder.com" className="underline">hello@theshowfinder.com</a></p>
      </div>
    </main>
  )
}

function EventList({ events, q }: { events: Awaited<ReturnType<typeof loadEvents>>; q: string }) {
  return (
    <ul className="mt-3 divide-y divide-slate-100">
      {events.map(e => (
        <li key={e.submissionId} className="py-4 flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="font-extrabold text-slate-900">{e.title}</p>
            <p className="text-sm text-slate-500">{when(e.startDate)} · {e.status === 'approved' ? 'Live' : e.status === 'pending' ? 'Being checked' : e.status === 'rejected' ? 'Not approved' : e.status}</p>
            {e.ticketing !== 'link' && e.capacity > 0 && (
              <p className="text-sm text-slate-700 mt-0.5"><strong>{e.sold}</strong> of {e.capacity} {e.ticketing === 'free' ? 'free tickets taken' : 'sold'}{e.ticketing === 'paid' ? ` · ${gbpFromPence(e.takingsPence)} to you` : ''}{e.checkedIn ? ` · ${e.checkedIn} checked in` : ''}</p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {e.eventId && <Link href={`/organiser/event/${e.submissionId}?${q}`} className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-extrabold text-white">Manage</Link>}
            {e.slug && <Link href={`/events/${e.slug}`} className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-bold text-slate-900">View</Link>}
          </div>
        </li>
      ))}
    </ul>
  )
}

function SignIn({ sent, expired }: { sent: boolean; expired: boolean }) {
  return (
    <main className="min-h-screen bg-[#F5F5F0] px-4 py-16">
      <div className={`mx-auto max-w-md ${card}`}>
        <p className="text-xs font-extrabold uppercase tracking-widest text-[#E8003D]">For organisers</p>
        <h1 className="mt-1 text-2xl font-black text-slate-950">Manage your events</h1>
        {sent ? (
          <p className="mt-3 text-slate-600">If that email has listed an event with us, a link to your dashboard is on its way. It can take a minute; check your spam folder too.</p>
        ) : (
          <>
            <p className="mt-2 text-slate-600">{expired ? 'That link has expired or isn’t right. ' : ''}Enter the email you listed your event with and we’ll send you a link. No password needed.</p>
            <form action={requestLinkAction} className="mt-5 space-y-3">
              <input name="email" type="email" required autoComplete="email" placeholder="you@example.com" className="w-full min-h-[48px] px-4 rounded-xl border border-slate-300 text-base" aria-label="Email" />
              <button className="w-full min-h-[52px] rounded-xl bg-[#E8003D] font-extrabold text-white">Email me a link</button>
            </form>
          </>
        )}
        <p className="mt-6 text-sm text-slate-500">New here? <Link href="/list-your-event" className="underline font-semibold">List your event free</Link>.</p>
      </div>
    </main>
  )
}
