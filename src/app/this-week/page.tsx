// UK-wide "what's on in the next 7 days", grouped by day, with links into each city's own
// this-week page. The homepage "Events This Week" strip links here. Same data and mixing
// rules as the city versions (fetchEventsThisWeek with no city), so counts and filters agree.
// The window starts tomorrow, so it must roll over promptly after midnight.
export const revalidate = 300

import Link from 'next/link'
import type { Metadata } from 'next'
import { createPublicClient } from '@/lib/supabase/public'
import EventCard from '@/components/EventCard'
import { CITIES } from '@/lib/cities'
import { fetchEventsThisWeek } from '@/lib/eventPools'
import { jsonLdScript, buildBreadcrumbSchema, buildItemListSchema } from '@/lib/jsonld'
import type { EventWithVenue } from '@/lib/types/database'

const CANONICAL = 'https://www.theshowfinder.com/this-week'
const TITLE = 'Events This Week in the UK: Concerts, Theatre, Comedy & More'
const DESCRIPTION = 'What is on across the UK in the next 7 days: concerts, theatre, comedy, sport and family shows, day by day, with tickets from official sellers.'

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: CANONICAL },
  openGraph: { title: `${TITLE} | TheShowFinder`, description: DESCRIPTION, url: CANONICAL },
}

const dayKey = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
const dayHeading = (iso: string) => new Date(iso).toLocaleDateString('en-GB', {
  timeZone: 'Europe/London', weekday: 'long', day: 'numeric', month: 'long',
})

function groupByDay(events: EventWithVenue[]): { key: string; heading: string; events: EventWithVenue[] }[] {
  const days = new Map<string, { key: string; heading: string; events: EventWithVenue[] }>()
  for (const e of events) {
    const key = dayKey(e.start_date)
    const group = days.get(key) ?? { key, heading: dayHeading(e.start_date), events: [] }
    group.events.push(e)
    days.set(key, group)
  }
  return [...days.values()].sort((a, b) => a.key.localeCompare(b.key))
}

export default async function ThisWeekPage() {
  const events = await fetchEventsThisWeek(createPublicClient(), { limit: 60, fetchLimit: 150 })
  const days = groupByDay(events)

  const breadcrumb = buildBreadcrumbSchema([
    { name: 'Home', url: 'https://www.theshowfinder.com' },
    { name: 'This week', url: CANONICAL },
  ])
  const itemList = buildItemListSchema(
    events.slice(0, 20).map(e => ({ name: e.title, url: `https://www.theshowfinder.com/events/${e.slug}` })),
  )

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#F5F5F0' }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(breadcrumb) }} />
      {itemList.itemListElement.length > 0 && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(itemList) }} />
      )}

      <div className="py-14 px-4 sm:px-6 lg:px-8" style={{ backgroundColor: '#1A1A2E' }}>
        <div className="max-w-7xl mx-auto">
          <nav className="text-white/40 text-xs mb-3">
            <Link href="/" className="hover:text-white/70">Home</Link>
            {' / This week'}
          </nav>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-white mb-2">Events This Week in the UK</h1>
          <p className="text-white/60 text-sm max-w-2xl">
            {events.length > 0
              ? `A mix of ${events.length} shows across the UK in the next 7 days, from concerts and theatre to comedy, sport and family days out.`
              : 'Nothing is listed for the next 7 days right now. See everything that is coming up.'}
          </p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-12">
        {days.map(day => (
          <section key={day.key}>
            <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 mb-5">{day.heading}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {day.events.map(event => <EventCard key={event.id} event={event} />)}
            </div>
          </section>
        ))}

        {events.length === 0 && (
          <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center">
            <Link href="/events" className="inline-block font-bold text-white px-6 py-3 rounded-xl" style={{ backgroundColor: '#E8003D' }}>
              Browse all upcoming events
            </Link>
          </div>
        )}

        <section>
          <h2 className="text-xl font-extrabold text-slate-900 mb-4">This week in your city</h2>
          <div className="flex flex-wrap gap-2">
            {CITIES.map(c => (
              <Link
                key={c.name}
                href={`/cities/${encodeURIComponent(c.name)}/this-week`}
                className="text-sm font-semibold px-3 py-1.5 rounded-full bg-white border border-slate-200 text-slate-700 hover:border-slate-400"
              >
                {c.name}
              </Link>
            ))}
          </div>
        </section>

        <div className="flex flex-wrap gap-x-6 gap-y-2">
          <Link href="/on-sale-this-week" className="text-sm font-semibold hover:underline" style={{ color: '#026CDF' }}>Tickets going on sale this week →</Link>
          <Link href="/events" className="text-sm font-semibold hover:underline" style={{ color: '#026CDF' }}>Browse every upcoming event →</Link>
        </div>
      </div>
    </div>
  )
}
