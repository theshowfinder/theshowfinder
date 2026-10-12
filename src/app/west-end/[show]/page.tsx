// One page per West End show (title + theatre): every upcoming performance,
// grouped by month, each linking to the event page and its ticket comparison.
// Targets "{show} tickets" searches.
export const revalidate = 600

// Opt this dynamic route into on-demand static generation: no pages are built
// ahead of time, but each page is generated on first request, then cached on
// the CDN and refreshed in the background (see `revalidate` above).
export async function generateStaticParams() {
  return []
}

import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import ShowCard from '@/components/ShowCard'
import { getWestEndShows } from '@/lib/showPool'
import { eventImageUrl } from '@/lib/eventImages'
import { TrackedTicketLink } from '@/components/TrackedTicketLink'
import { getSeeTicketsAffiliateLink } from '@/lib/affiliate'
import { seeTicketsUrlForShow } from '@/lib/seeTicketsWestEnd'
import { jsonLdScript, buildBreadcrumbSchema, buildItemListSchema } from '@/lib/jsonld'
import type { ShowDate } from '@/lib/shows'

const BASE = 'https://www.theshowfinder.com'
const MAX_DATES_SHOWN = 120

const fmtDay = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/London' })
const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' })
const fmtMonth = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'Europe/London' })

async function findShow(slug: string) {
  const shows = await getWestEndShows()
  return { shows, show: shows.find(s => s.slug === slug) }
}

export async function generateMetadata(
  { params }: { params: Promise<{ show: string }> },
): Promise<Metadata> {
  const { show: slug } = await params
  const { show } = await findShow(slug)
  if (!show) return { title: 'Show not found', robots: { index: false } }

  const canonical = `${BASE}/west-end/${show.slug}`
  const title = `${show.title} Tickets – ${show.venueName}, London`
  const socialTitle = `${title} | TheShowFinder`
  const nextDay = fmtDay(show.nextDate)
  const description =
    `Compare tickets for ${show.title} at ${show.venueName}, London. ` +
    `${show.dateCount} upcoming ${show.dateCount === 1 ? 'performance' : 'performances'}, next on ${nextDay}.` +
    (show.priceFrom ? ` Prices from £${show.priceFrom}.` : '')
  const image = eventImageUrl(show.imageUrl, 'theatre', show.title)
  const ogImage = image.startsWith('http') ? image : `${BASE}${image}`

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: { title: socialTitle, description, url: canonical, images: [{ url: ogImage, alt: show.title }] },
    twitter: { card: 'summary_large_image', title: socialTitle, description, images: [ogImage] },
  }
}

export default async function WestEndShowPage({ params }: { params: Promise<{ show: string }> }) {
  const { show: slug } = await params
  const { shows, show } = await findShow(slug)
  if (!show) notFound()

  const canonical = `${BASE}/west-end/${show.slug}`
  const imageUrl = eventImageUrl(show.imageUrl, 'theatre', show.title)
  const sym = show.currency === 'GBP' ? '£' : show.currency
  const dates = show.dates.slice(0, MAX_DATES_SHOWN)
  const seeTicketsUrl = show.status !== 'sold_out' ? seeTicketsUrlForShow(show.title, show.venueName) : null

  const byMonth = new Map<string, ShowDate[]>()
  for (const d of dates) {
    const key = fmtMonth(d.start_date)
    const list = byMonth.get(key)
    if (list) list.push(d)
    else byMonth.set(key, [d])
  }

  const breadcrumbSchema = buildBreadcrumbSchema([
    { name: 'Home', url: BASE },
    { name: 'West End', url: `${BASE}/west-end` },
    { name: show.title, url: canonical },
  ])
  const performancesSchema = buildItemListSchema(
    dates.slice(0, 20).map(d => ({
      name: `${show.title} – ${fmtDay(d.start_date)} ${fmtTime(d.start_date)}`,
      url: `${BASE}/events/${d.slug}`,
    })),
  )

  const related = shows.filter(s => s.slug !== show.slug).slice(0, 4)

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#F5F5F0' }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(breadcrumbSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(performancesSchema) }} />

      <div className="relative overflow-hidden" style={{ backgroundColor: '#1A1A2E' }}>
        {imageUrl && (
          <div
            className="absolute inset-0 bg-cover bg-center opacity-20"
            style={{ backgroundImage: `url("${imageUrl}")` }}
          />
        )}
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14">
          <nav className="text-white/40 text-xs mb-3">
            <Link href="/" className="hover:text-white/70">Home</Link>
            {' / '}
            <Link href="/west-end" className="hover:text-white/70">West End</Link>
            {' / '}
            <span>{show.title}</span>
          </nav>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-white mb-3">{show.title} Tickets</h1>
          <p className="text-white/70 text-sm mb-1">
            📍 {show.venueSlug
              ? <Link href={`/venues/${show.venueSlug}`} className="underline hover:text-white">{show.venueName}</Link>
              : show.venueName}, London
          </p>
          <p className="text-white/70 text-sm mb-6">
            🎟️ {show.dateCount} upcoming {show.dateCount === 1 ? 'performance' : 'performances'} · next on {fmtDay(show.nextDate)}, {fmtTime(show.nextDate)}
            {show.priceFrom ? ` · from ${sym}${show.priceFrom}` : ''}
          </p>
          {show.status !== 'sold_out' && (
            <div className="flex flex-col sm:flex-row gap-3">
              {seeTicketsUrl && (
                <TrackedTicketLink
                  href={getSeeTicketsAffiliateLink(seeTicketsUrl)}
                  provider="See Tickets"
                  section="hero_cta"
                  context={`west-end-show:${show.slug}`}
                  rel="sponsored noopener noreferrer"
                  className="inline-flex items-center justify-center text-white font-bold px-6 py-3 rounded-xl min-h-[48px] hover:opacity-90"
                  style={{ backgroundColor: '#E4022D' }}
                >
                  Book {show.title} with See Tickets ↗
                </TrackedTicketLink>
              )}
              <Link
                href={`/events/${show.nextEventSlug}`}
                className={seeTicketsUrl
                  ? 'inline-flex items-center justify-center font-bold px-6 py-3 rounded-xl min-h-[48px] border-2 border-white/40 text-white hover:bg-white/10'
                  : 'inline-flex items-center justify-center text-white font-bold px-6 py-3 rounded-xl min-h-[48px] hover:opacity-90'}
                style={seeTicketsUrl ? undefined : { backgroundColor: '#E8003D' }}
              >
                Compare tickets for the next performance
              </Link>
            </div>
          )}
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-12">
        <section>
          <h2 className="text-2xl font-extrabold text-slate-900 mb-2">All performances</h2>
          <p className="text-slate-600 text-sm mb-6 max-w-2xl">
            Choose a date to compare ticket prices across providers. Times are London time.
          </p>
          {seeTicketsUrl && (
            <p className="text-slate-600 text-sm mb-6 max-w-2xl">
              Can&apos;t see the date you want? Booking periods open in stages, so some dates may not be listed yet.{' '}
              <TrackedTicketLink
                href={getSeeTicketsAffiliateLink(seeTicketsUrl)}
                provider="See Tickets"
                section="primary"
                context={`west-end-show-calendar:${show.slug}`}
                className="font-semibold underline hover:no-underline"
                style={{ color: '#E4022D' }}
              >
                Check the full {show.title} calendar on See Tickets ↗
              </TrackedTicketLink>
            </p>
          )}
          <div className="space-y-8">
            {[...byMonth.entries()].map(([month, list]) => (
              <div key={month}>
                <h3 className="text-sm font-bold uppercase tracking-widest text-slate-500 mb-3">{month}</h3>
                <ul className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100">
                  {list.map(d => {
                    const off = d.status === 'sold_out'
                    return (
                      <li key={d.id} className="flex items-center justify-between gap-3 px-4 py-3">
                        <div className="min-w-0">
                          <p className="font-semibold text-slate-900 text-sm">{fmtDay(d.start_date)}</p>
                          <p className="text-xs text-slate-500">{fmtTime(d.start_date)}{d.price_from ? ` · from ${sym}${d.price_from}` : ''}</p>
                        </div>
                        {off ? (
                          <span className="text-xs font-bold px-3 py-2 rounded-lg bg-slate-200 text-slate-500">Sold out</span>
                        ) : (
                          <Link
                            href={`/events/${d.slug}`}
                            className="text-xs font-bold text-white px-4 py-2.5 rounded-lg hover:opacity-90 shrink-0"
                            style={{ backgroundColor: '#E8003D' }}
                          >
                            Get tickets
                          </Link>
                        )}
                      </li>
                    )
                  })}
                </ul>
              </div>
            ))}
          </div>
          {show.dateCount > MAX_DATES_SHOWN && (
            <p className="text-sm text-slate-500 mt-4">Showing the next {MAX_DATES_SHOWN} performances.</p>
          )}
        </section>

        {related.length > 0 && (
          <section>
            <h2 className="text-xl font-extrabold text-slate-900 mb-4">More West End shows</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {related.map(s => <ShowCard key={s.slug} show={s} kind="west-end" />)}
            </div>
            <p className="mt-6"><Link href="/west-end" className="text-sm font-semibold hover:underline" style={{ color: '#026CDF' }}>See every West End show →</Link></p>
          </section>
        )}
      </div>
    </div>
  )
}
