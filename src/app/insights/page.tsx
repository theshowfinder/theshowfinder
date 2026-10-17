import type { Metadata } from 'next'
import Link from 'next/link'
import { loadInsights } from '@/lib/insightsData'
import {
  busiestMonth,
  formatCount,
  insightsHeadline,
  quotableCount,
  rankCounts,
  sharePercent,
  ukDateLabel,
} from '@/lib/insights'
import { jsonLdScript } from '@/lib/jsonld'

const PAGE_URL = 'https://www.theshowfinder.com/insights'

export const metadata: Metadata = {
  title: 'UK Live Events Index: Gigs, Theatre & Comedy By City',
  description:
    'Live figures on UK live events: how many concerts, theatre, comedy and sport shows are on sale, which cities have the most, and which months are busiest. Updated daily, free to cite.',
  alternates: { canonical: PAGE_URL },
}

// Counts move slowly; six hours keeps the page fresh without hammering the database.
export const revalidate = 21600

export default async function InsightsPage() {
  const now = new Date()
  const data = await loadInsights(now)
  const asOf = ukDateLabel(now)

  const topCities = rankCounts(data.cities, 15)
  const maxCity = topCities[0]?.count ?? 1
  const categories = rankCounts(data.categories)
  const months = data.months
  const maxMonth = Math.max(1, ...months.map(m => m.count))
  const month = busiestMonth(months)
  const citiesWithShows = data.cities.filter(c => c.count > 0).length
  const headline = insightsHeadline(data)

  const dataset = {
    '@context': 'https://schema.org',
    '@type': 'Dataset',
    name: 'UK live events index',
    description:
      'Counts of upcoming UK live events (concerts, theatre, comedy, family shows and sport) by city, category and month, taken from official ticket listings and refreshed daily.',
    url: PAGE_URL,
    license: 'https://creativecommons.org/licenses/by/4.0/',
    isAccessibleForFree: true,
    creator: { '@type': 'Organization', name: 'TheShowFinder', url: 'https://www.theshowfinder.com' },
    dateModified: now.toISOString().slice(0, 10),
    temporalCoverage: `${months[0]?.monthStart ?? now.toISOString().slice(0, 10)}/..`,
    spatialCoverage: { '@type': 'Country', name: 'United Kingdom' },
    keywords: ['UK live events', 'concerts', 'theatre', 'comedy', 'gigs by city', 'ticket on sale'],
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#F5F5F0' }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(dataset) }} />

      <div className="py-14 px-4 sm:px-6 lg:px-8" style={{ backgroundColor: '#1A1A2E' }}>
        <div className="max-w-4xl mx-auto">
          <h1 className="text-3xl sm:text-4xl font-extrabold text-white mb-3">UK live events index</h1>
          <p className="text-white/70 max-w-2xl text-lg">{headline}</p>
          <p className="text-white/40 text-sm mt-3">Figures as of {asOf}. Refreshed daily from official ticket listings.</p>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-12">
        <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Stat value={quotableCount(data.total)} label="upcoming UK events on sale" />
          <Stat value={String(citiesWithShows)} label="cities with shows listed" />
          <Stat value={month ? month.busiest.label : '-'} label="busiest month ahead" small />
        </section>

        <section className="bg-white rounded-2xl border border-slate-200 p-6">
          <h2 className="text-xl font-extrabold text-slate-900 mb-1">Which UK cities have the most live events?</h2>
          <p className="text-slate-600 mb-5">Upcoming events listed in each city, top 15.</p>
          <ol className="space-y-2">
            {topCities.map((c, i) => (
              <li key={c.label} className="grid grid-cols-[1.5rem_7rem_1fr_4rem] sm:grid-cols-[1.5rem_9rem_1fr_5rem] items-center gap-3 text-sm">
                <span className="text-slate-400 tabular-nums">{i + 1}</span>
                <Link href={`/cities/${encodeURIComponent(c.label)}`} className="font-semibold text-slate-900 hover:underline truncate">
                  {c.label}
                </Link>
                <span className="h-3 rounded-full bg-slate-100 overflow-hidden" aria-hidden="true">
                  <span className="block h-full rounded-full" style={{ width: `${Math.max(2, (c.count / maxCity) * 100)}%`, backgroundColor: '#E8003D' }} />
                </span>
                <span className="text-right tabular-nums text-slate-700">{formatCount(c.count)}</span>
              </li>
            ))}
          </ol>
        </section>

        <section className="bg-white rounded-2xl border border-slate-200 p-6">
          <h2 className="text-xl font-extrabold text-slate-900 mb-1">What kind of events are on sale?</h2>
          <p className="text-slate-600 mb-5">Share of all upcoming UK events by type.</p>
          <ul className="space-y-2">
            {categories.map(c => (
              <li key={c.label} className="grid grid-cols-[7rem_1fr_6rem] sm:grid-cols-[9rem_1fr_7rem] items-center gap-3 text-sm">
                <span className="font-semibold text-slate-900">{c.label}</span>
                <span className="h-3 rounded-full bg-slate-100 overflow-hidden" aria-hidden="true">
                  <span className="block h-full rounded-full" style={{ width: `${Math.max(2, sharePercent(c.count, data.total))}%`, backgroundColor: '#1A1A2E' }} />
                </span>
                <span className="text-right tabular-nums text-slate-700">
                  {sharePercent(c.count, data.total)}% <span className="text-slate-400">({formatCount(c.count)})</span>
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="bg-white rounded-2xl border border-slate-200 p-6">
          <h2 className="text-xl font-extrabold text-slate-900 mb-1">Which months are busiest?</h2>
          <p className="text-slate-600 mb-5">
            Events by month over the next year. Later months fill up as new dates are announced, so far-off months
            look quieter than they will end up.
          </p>
          <ul className="space-y-2">
            {months.map(m => (
              <li key={m.monthStart} className="grid grid-cols-[8.5rem_1fr_4rem] items-center gap-3 text-sm">
                <span className="font-semibold text-slate-900">{m.label}</span>
                <span className="h-3 rounded-full bg-slate-100 overflow-hidden" aria-hidden="true">
                  <span className="block h-full rounded-full" style={{ width: `${Math.max(1, (m.count / maxMonth) * 100)}%`, backgroundColor: '#E8003D' }} />
                </span>
                <span className="text-right tabular-nums text-slate-700">{formatCount(m.count)}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="bg-white rounded-2xl border border-slate-200 p-6">
          <h2 className="text-xl font-extrabold text-slate-900 mb-2">Use these figures</h2>
          <p className="text-slate-600 mb-3">
            Free to quote in articles, newsletters and social posts under a{' '}
            <a href="https://creativecommons.org/licenses/by/4.0/" className="font-semibold underline" rel="noopener">CC BY 4.0</a>{' '}
            licence. Please credit and link:
          </p>
          <p className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 text-sm text-slate-700 select-all">
            Source: TheShowFinder UK live events index, {asOf} (theshowfinder.com/insights)
          </p>
          <p className="text-slate-500 text-sm mt-3">
            Counts cover upcoming, on-sale and sold-out events with a UK venue; cancelled and postponed shows are left out.
            Event data comes from official ticket listings, so a city only appears if a venue there has listed shows.
            Need a different cut for a story? <Link href="/contact" className="font-semibold underline">Get in touch</Link>.
          </p>
        </section>
      </div>
    </div>
  )
}

function Stat({ value, label, small }: { value: string; label: string; small?: boolean }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6">
      <div className={`${small ? 'text-2xl' : 'text-4xl'} font-extrabold`} style={{ color: '#E8003D' }}>{value}</div>
      <div className="text-slate-600 text-sm mt-1">{label}</div>
    </div>
  )
}
