import type { Metadata } from 'next'
import Link from 'next/link'
import CalendarSubscribe from '@/components/CalendarSubscribe'
import { CITIES } from '@/lib/cities'
import { ONSALE_FEED_PATH, cityFeedPath } from '@/lib/calendarFeeds'

export const metadata: Metadata = {
  title: 'UK Gig Calendar Feeds: Tickets On Sale & Shows In Your City',
  description: 'Subscribe in Apple, Google or Outlook calendar: reminders when UK tickets go on sale and presales open, plus a live gig calendar for every city. Free, updates itself.',
  alternates: { canonical: 'https://www.theshowfinder.com/calendars' },
}

export const revalidate = 3600

export default function CalendarsPage() {
  const cities = [...CITIES].sort((a, b) => a.name.localeCompare(b.name))
  return (
    <div className="min-h-screen" style={{ backgroundColor: '#F5F5F0' }}>
      <div className="py-14 px-4 sm:px-6 lg:px-8" style={{ backgroundColor: '#1A1A2E' }}>
        <div className="max-w-4xl mx-auto">
          <h1 className="text-3xl sm:text-4xl font-extrabold text-white mb-3">Gig calendars that update themselves</h1>
          <p className="text-white/60 max-w-2xl">
            Subscribe once and the shows and on-sale times appear in your own calendar app. No app to install,
            no account, free. The feeds refresh automatically, so new dates show up without you doing anything.
          </p>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-12">
        <section className="bg-white rounded-2xl border border-slate-200 p-6">
          <h2 className="text-xl font-extrabold text-slate-900 mb-2">UK tickets on sale: with reminders</h2>
          <p className="text-slate-600 mb-4">
            Every general sale and presale across the UK in the next six weeks, as calendar entries. Each one pops up a
            reminder 15 minutes before the moment tickets go live, so you are ready when the queue opens. A tour that
            goes on sale in eight cities at once is one entry, not eight.
          </p>
          <CalendarSubscribe path={ONSALE_FEED_PATH} label="Subscribe to on-sale reminders" variant="light" />
        </section>

        <section>
          <h2 className="text-xl font-extrabold text-slate-900 mb-2">Shows in your city</h2>
          <p className="text-slate-600 mb-5">
            Concerts, theatre, comedy and more over the next four months, with a link to compare tickets on each one.
          </p>
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {cities.map(c => (
              <li key={c.name} className="flex flex-wrap items-center justify-between gap-2 bg-white rounded-xl border border-slate-200 px-4 py-2">
                <Link href={`/cities/${encodeURIComponent(c.name)}`} className="font-semibold text-slate-900 hover:underline">
                  {c.name}
                </Link>
                <CalendarSubscribe path={cityFeedPath(c.name)} label="Subscribe" variant="light" />
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-extrabold text-slate-900 mb-3">Good to know</h2>
          <ul className="list-disc pl-5 space-y-2 text-slate-600">
            <li>
              <strong>Apple Calendar and Outlook:</strong> press the calendar button and confirm. <strong>Google Calendar:</strong> press
              the Google button, then Add. Some calendar apps only refresh subscribed feeds every few hours or once a day.
            </li>
            <li>
              Looking for one artist or venue? Each artist and venue page has its own &ldquo;add to calendar&rdquo; button, and
              you can follow them to get an email when new dates are added.
            </li>
            <li>Dates and times come from the official ticket listings and can change, so check the event page before you travel or buy.</li>
            <li>
              Run a website? Our free <Link href="/widgets" className="font-semibold" style={{ color: '#E8003D' }}>shows widget</Link> puts
              the same live list on your own page.
            </li>
          </ul>
        </section>
      </div>
    </div>
  )
}
