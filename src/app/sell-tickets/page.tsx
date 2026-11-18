import type { Metadata } from 'next'
import Link from 'next/link'
import { bookingFeePence, gbpFromPence } from '@/lib/tickets'
import { SELL_PAGES } from '@/lib/sellTicketsPages'

// "Sell tickets with TheShowFinder": the organiser pitch, and the page we want found for "sell tickets online".
// Fee figures come from bookingFeePence, so this page stays right if the fee changes. No other companies named.
const URL = 'https://www.theshowfinder.com/sell-tickets'
const TITLE = 'Sell Tickets Online for Your Event | Keep 100% of Your Ticket Price'
const DESCRIPTION = 'Sell tickets for your gig, comedy night, club night or local event. You keep your full ticket price, paid to your bank as you sell, and your event is listed free where people look for things to do.'

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: URL },
  openGraph: { title: TITLE, description: DESCRIPTION, url: URL, images: [{ url: 'https://www.theshowfinder.com/og-image.png', width: 1200, height: 630, alt: 'Sell tickets with TheShowFinder' }] },
}

const BENEFITS: [string, string, string][] = [
  ['💷', 'Keep every penny', 'You get 100% of your ticket price. Your buyers pay a small booking fee, shown up front before they pay. Nothing comes out of your takings.'],
  ['⚡', 'Paid as you sell', 'Money goes straight into your own Stripe account and on to your bank, usually a few days after each sale. You are not waiting until after the event to pay the venue.'],
  ['🔎', 'Your event gets found', 'We don’t just sell the tickets. Your event is listed free on your town’s page, the venue page and our "what’s on" pages that people find on Google, plus search on the site.'],
  ['🎟️', 'Tickets sent instantly', 'Buyers get QR tickets by email the moment they pay, and a link to see them again any time.'],
  ['📱', 'Door scanning on your phone', 'Open the door link on any phone and scan tickets as people arrive. It shows who’s in and stops a ticket being used twice.'],
  ['📋', 'Your guest list', 'Download your attendee list at any time, ready for the door or for your own mailing list.'],
  ['🆓', 'Free events cost nothing', 'Running a free event? Free tickets carry no fee at all, for you or your guests.'],
  ['✍️', 'No contract, no monthly fee', 'Set up in two minutes. List one event or a hundred. Stop whenever you like.'],
]

const STEPS: [string, string][] = [
  ['List your event', 'Tell us the name, date, venue, ticket price and how many tickets. Two minutes.'],
  ['Connect payouts', 'Set up your Stripe payout account so ticket money goes straight to you.'],
  ['Start selling', 'Share your event link. Buyers pay, get their tickets by email, and you get paid.'],
  ['Scan on the door', 'Open your door link on your phone on the night and scan people in.'],
]

const EXAMPLES = [500, 1000, 1500, 2000, 3000]

const FAQS: [string, string][] = [
  ['How much does it cost to sell tickets?', 'Nothing for you. Your buyers pay a small booking fee on top of your ticket price, and you keep 100% of the price you set. On a £10 ticket you get £10 and the buyer pays ' + gbpFromPence(1000 + bookingFeePence(1000)) + '.'],
  ['When do I get paid?', 'Ticket money goes into your own Stripe account as each ticket sells and Stripe pays it into your bank, usually within a few days. You don’t wait until after the event.'],
  ['Do free events cost anything?', 'No. Free tickets are free for you and for your guests, with the same QR tickets and door scanning.'],
  ['How do buyers get their tickets?', 'By email straight after they book, as QR codes. They can also open their tickets from the link in the email at any time.'],
  ['How do I check tickets on the door?', 'You get a door link. Open it on any phone, scan each QR code, and it tells you if the ticket is valid and stops it being used twice.'],
  ['Is there a contract or monthly fee?', 'No. There is no contract and no monthly fee. Listing your event is free.'],
  ['What kind of events can I sell tickets for?', 'Gigs, comedy nights, club nights, theatre, family shows, talks, quizzes, community events and more, anywhere in the UK.'],
]

export default function SellTicketsPage() {
  const faqSchema = {
    '@context': 'https://schema.org', '@type': 'FAQPage',
    mainEntity: FAQS.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })),
  }
  return (
    <main className="min-h-screen bg-[#F5F5F0]">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }} />
      <section className="bg-[#1A1A2E] text-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-12 sm:py-20">
          <p className="text-xs font-extrabold uppercase tracking-widest text-[#E8003D]">For promoters, venues, bands and organisers</p>
          <h1 className="mt-2 text-4xl sm:text-6xl font-extrabold leading-tight">Sell tickets.<br />Keep every penny.</h1>
          <p className="mt-5 text-lg sm:text-xl text-white/80 max-w-2xl">Your buyers pay a small booking fee. You keep 100% of your ticket price, paid to your bank as you sell, not weeks after the event. And your event is listed free where people in your town look for things to do.</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/list-your-event?ticketing=paid" className="inline-flex items-center min-h-[52px] px-6 rounded-full bg-[#E8003D] font-extrabold text-white hover:bg-[#c40033]">Start selling tickets →</Link>
            <Link href="/list-your-event?ticketing=free" className="inline-flex items-center min-h-[52px] px-6 rounded-full border-2 border-white/40 font-bold hover:border-white">Free event? Free tickets</Link>
          </div>
          <p className="mt-4 text-sm text-white/60">No contract. No monthly fee. Set up in two minutes.</p>
        </div>
      </section>

      <section className="max-w-5xl mx-auto px-4 sm:px-6 py-12">
        <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900">Everything you need to sell out your night</h2>
        <div className="mt-6 grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {BENEFITS.map(([icon, title, body]) => (
            <div key={title} className="rounded-2xl bg-white border border-slate-200 p-5">
              <p className="text-3xl" aria-hidden="true">{icon}</p>
              <h3 className="mt-2 text-lg font-extrabold text-slate-900">{title}</h3>
              <p className="mt-1 text-sm text-slate-600">{body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="max-w-3xl mx-auto px-4 sm:px-6 py-6">
        <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900">What you get, what your buyer pays</h2>
        <p className="mt-2 text-slate-600">You set the ticket price and you get all of it. The booking fee is added for the buyer and shown before they pay.</p>
        <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <table className="w-full text-left">
            <thead className="bg-slate-50 text-sm text-slate-600">
              <tr><th className="p-3 sm:p-4">Your ticket price</th><th className="p-3 sm:p-4">You get</th><th className="p-3 sm:p-4">Buyer pays</th></tr>
            </thead>
            <tbody>
              {EXAMPLES.map(p => (
                <tr key={p} className="border-t border-slate-100">
                  <td className="p-3 sm:p-4 font-bold">{gbpFromPence(p)}</td>
                  <td className="p-3 sm:p-4 font-extrabold text-green-700">{gbpFromPence(p)}</td>
                  <td className="p-3 sm:p-4">{gbpFromPence(p + bookingFeePence(p))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="max-w-5xl mx-auto px-4 sm:px-6 py-12">
        <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900">How it works</h2>
        <ol className="mt-6 grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {STEPS.map(([title, body], i) => (
            <li key={title} className="rounded-2xl bg-white border border-slate-200 p-5">
              <p className="text-sm font-extrabold text-[#E8003D]">Step {i + 1}</p>
              <h3 className="mt-1 text-lg font-extrabold text-slate-900">{title}</h3>
              <p className="mt-1 text-sm text-slate-600">{body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="max-w-5xl mx-auto px-4 sm:px-6 pb-12">
        <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900">What are you selling tickets for?</h2>
        <ul className="mt-5 grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {SELL_PAGES.map(x => (
            <li key={x.slug}><Link href={`/sell-tickets/${x.slug}`} className="block h-full rounded-2xl bg-white border border-slate-200 p-4 hover:border-slate-400">
              <span className="block text-xs font-extrabold uppercase tracking-widest text-[#E8003D]">{x.kicker}</span>
              <span className="mt-1 block font-extrabold text-slate-900">{x.h1} →</span>
            </Link></li>
          ))}
        </ul>
      </section>

      <section className="max-w-3xl mx-auto px-4 sm:px-6 pb-12">
        <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900">Questions</h2>
        <div className="mt-5 space-y-3">
          {FAQS.map(([q, a]) => (
            <details key={q} className="rounded-2xl bg-white border border-slate-200 p-4 group">
              <summary className="font-bold text-slate-900 cursor-pointer">{q}</summary>
              <p className="mt-2 text-slate-600">{a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="bg-[#1A1A2E] text-white">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12 text-center">
          <h2 className="text-3xl font-extrabold">Ready to sell your first ticket?</h2>
          <p className="mt-3 text-white/80">List your event in two minutes. You keep every penny of your ticket price.</p>
          <Link href="/list-your-event?ticketing=paid" className="mt-6 inline-flex items-center min-h-[52px] px-6 rounded-full bg-[#E8003D] font-extrabold text-white hover:bg-[#c40033]">Start selling tickets →</Link>
          <p className="mt-4 text-sm text-white/60">Questions? <a href="mailto:hello@theshowfinder.com" className="underline">hello@theshowfinder.com</a></p>
        </div>
      </section>
    </main>
  )
}
