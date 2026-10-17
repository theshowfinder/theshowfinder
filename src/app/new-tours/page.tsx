import type { Metadata } from 'next'
import Link from 'next/link'
import { loadTourAnnouncements } from '@/lib/tourHubData'
import { announcedLabel, citiesPhrase, daysAgo, type TourAnnouncement } from '@/lib/tourHub'
import { shortUkDate } from '@/lib/newShows'
import { jsonLdScript, buildItemListSchema, buildBreadcrumbSchema } from '@/lib/jsonld'

const BASE = 'https://www.theshowfinder.com'

export const metadata: Metadata = {
  title: 'New UK Tour Announcements: Latest Dates Added',
  description:
    'Every UK tour announced or extended in the last two weeks, newest first: which cities, which venues and the dates, with tickets compared on each show.',
  alternates: { canonical: `${BASE}/new-tours` },
}

// New dates land through the day; an hour keeps the hub current at CDN cost.
export const revalidate = 3600

export default async function NewToursPage() {
  const now = new Date()
  const tours = await loadTourAnnouncements(now)
  const thisWeek = tours.filter(t => daysAgo(t.announcedAt, now) < 7)
  const earlier = tours.filter(t => daysAgo(t.announcedAt, now) >= 7)

  const schemas = [
    buildBreadcrumbSchema([
      { name: 'Home', url: BASE },
      { name: 'New tour announcements', url: `${BASE}/new-tours` },
    ]),
    ...(tours.length > 0
      ? [buildItemListSchema(tours.slice(0, 30).map(t => ({ name: `${t.artistName} UK tour`, url: `${BASE}/artists/${t.artistSlug}` })))]
      : []),
  ]

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#F5F5F0' }}>
      {schemas.map((s, i) => (
        <script key={i} type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(s) }} />
      ))}

      <div className="py-14 px-4 sm:px-6 lg:px-8" style={{ backgroundColor: '#1A1A2E' }}>
        <div className="max-w-4xl mx-auto">
          <h1 className="text-3xl sm:text-4xl font-extrabold text-white mb-3">New UK tour announcements</h1>
          <p className="text-white/60 max-w-2xl">
            Artists who have announced or added UK dates in the last two weeks, newest first. This list builds itself
            from the official ticket listings, so a new tour shows up here within hours of going live.
          </p>
          <p className="mt-4 text-sm">
            <Link href="/on-sale-this-week" className="font-semibold text-white underline">See what goes on sale this week</Link>
            <span className="text-white/40"> · </span>
            <Link href="/calendars" className="font-semibold text-white underline">Get on-sale reminders in your calendar</Link>
          </p>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-10">
        {tours.length === 0 && (
          <p className="text-slate-600 bg-white rounded-2xl border border-slate-200 p-6">
            No new multi-city tours in the last two weeks. Check <Link href="/on-sale-this-week" className="font-semibold underline">what is on sale this week</Link> or browse <Link href="/events" className="font-semibold underline">all events</Link>.
          </p>
        )}
        <TourGroup heading="Announced in the last 7 days" tours={thisWeek} now={now} />
        <TourGroup heading="Announced 7 to 14 days ago" tours={earlier} now={now} />
        <p className="text-slate-500 text-sm">
          Dates and venues come from the official ticket listings and can change. Check each event page for current
          availability before you travel or buy.
        </p>
      </div>
    </div>
  )
}

function TourGroup({ heading, tours, now }: { heading: string; tours: TourAnnouncement[]; now: Date }) {
  if (tours.length === 0) return null
  return (
    <section>
      <h2 className="text-xl font-extrabold text-slate-900 mb-4">{heading}</h2>
      <ul className="space-y-3">
        {tours.map(t => (
          <li key={t.artistSlug} className="bg-white rounded-2xl border border-slate-200 p-5">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <Link href={`/artists/${t.artistSlug}`} className="text-lg font-extrabold text-slate-900 hover:underline">
                {t.artistName}
              </Link>
              <span className="text-xs font-semibold text-slate-500">
                {t.isBrandNew && <span className="mr-2 rounded-full px-2 py-0.5 text-white" style={{ backgroundColor: '#E8003D' }}>New to the site</span>}
                added {announcedLabel(t.announcedAt, now)}
              </span>
            </div>
            <p className="text-slate-600 text-sm mt-1">
              {t.showCount} UK dates in {citiesPhrase(t.cities)}, {shortUkDate(t.firstDate)} to {shortUkDate(t.lastDate)}
              {t.biggestVenue ? `, including ${t.biggestVenue}` : ''}.
            </p>
            <Link href={`/artists/${t.artistSlug}`} className="inline-block mt-3 text-sm font-semibold" style={{ color: '#E8003D' }}>
              See dates and compare tickets
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
