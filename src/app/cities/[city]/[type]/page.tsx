// "{Type} in {City}" pages (/cities/Coventry/concerts, see src/lib/cityTypeSeo.ts) and seasonal pages
// (/cities/Leeds/panto, /christmas, /new-years-eve, see src/lib/citySeasonSeo.ts).
export const revalidate = 21600
export const maxDuration = 60

import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import { createPublicClient } from '@/lib/supabase/public'
import EventCard from '@/components/EventCard'
import { CITIES } from '@/lib/cities'
import { LIVE_EVENT_STATUSES, fetchDuplicateIds } from '@/lib/listedEvents'
import { CITY_CENTRES } from '@/lib/localEventCity'
import { jsonLdScript, buildBreadcrumbSchema, buildItemListSchema } from '@/lib/jsonld'
import { buildCityCollectionSchema } from '@/lib/citySeo'
import {
  CITY_TYPES, MIN_INDEXABLE, cityTypeBySlug, cityTypePath, cityTypeTitle, cityTypeH1, cityTypeDescription,
  cityTypeFaqs, groupRuns, weekendDatesLondon, type CityType,
} from '@/lib/cityTypeSeo'
import type { EventWithVenue } from '@/lib/types/database'
import {
  SEASONS, seasonBySlug, seasonWindow, matchesSeason, seasonTitle, seasonH1, seasonDescription, seasonFaqs, inSeason, type Season,
} from '@/lib/citySeasonSeo'

export async function generateStaticParams() {
  return []
}

type Row = EventWithVenue & { venue_slug?: string | null }

async function loadRows(cityName: string, c: { t?: CityType; s?: Season }): Promise<Row[]> {
  const supabase = createPublicClient()
  let q = supabase.from('listed_events_with_venue').select('*').ilike('venue_city', cityName).in('status', LIVE_EVENT_STATUSES)
  if (c.t) q = q.eq('category', c.t.category).gte('start_date', new Date().toISOString())
  if (c.s) { const w = seasonWindow(c.s); q = q.gte('start_date', w.from).lt('start_date', w.to) }
  const { data } = await (q.order('start_date', { ascending: true }).limit(c.s ? 2000 : 800) as unknown as Promise<{ data: Row[] | null }>)
  let rows = data ?? []
  if (c.s) rows = rows.filter(r => matchesSeason(c.s!, r))
  const dupes = await fetchDuplicateIds(supabase, rows.map(r => r.id))
  return rows.filter(r => !dupes.has(r.id))
}

function resolve(cityParam: string, typeParam: string) {
  const requested = decodeURIComponent(cityParam)
  const city = CITIES.find(c => c.name.toLowerCase() === requested.toLowerCase())
  const t = cityTypeBySlug(typeParam)
  const season = t ? undefined : seasonBySlug(typeParam)
  return { requested, city, t, season }
}

function facts(cityName: string, rows: Row[]) {
  const runs = groupRuns(rows)
  const venueCount = new Map<string, number>()
  for (const r of rows) if (r.venue_name) venueCount.set(r.venue_name, (venueCount.get(r.venue_name) ?? 0) + 1)
  const venueNames = [...venueCount.entries()].sort((a, b) => b[1] - a[1]).map(([n]) => n).filter(n => n.toLowerCase() !== cityName.toLowerCase())
  const weekend = new Set(weekendDatesLondon())
  const london = (iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso))
  const weekendCount = runs.filter(g => weekend.has(london(g.first.start_date))).length
  const prices = rows.map(r => Number(r.price_from)).filter(p => Number.isFinite(p) && p > 0)
  const next = runs[0]?.first ?? null
  return {
    runs, venueNames,
    f: {
      count: runs.length, venueNames, weekendCount,
      nextTitle: next?.title ?? null,
      nextWhen: next ? new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(next.start_date)) : null,
      priceFrom: prices.length ? Math.min(...prices) : null,
    },
  }
}

export async function generateMetadata({ params }: { params: Promise<{ city: string; type: string }> }): Promise<Metadata> {
  const { city, type } = await params
  const { city: c, t, season } = resolve(city, type)
  if (!c || (!t && !season)) return { title: 'Not found' }
  const rows = await loadRows(c.name, { t, s: season })
  const { f } = facts(c.name, rows)
  const title = t ? cityTypeTitle(c.name, t) : seasonTitle(c.name, season!)
  const description = t ? cityTypeDescription(c.name, t, f.count, f.venueNames) : seasonDescription(c.name, season!, f.count, f.venueNames)
  const canonical = `https://www.theshowfinder.com/cities/${encodeURIComponent(c.name)}/${t ? t.slug : season!.slug}`
  return {
    title, description,
    alternates: { canonical },
    ...(f.count < MIN_INDEXABLE ? { robots: { index: false, follow: true } } : {}),
    openGraph: { title, description, url: canonical, images: [{ url: 'https://www.theshowfinder.com/og-image.png', width: 1200, height: 630, alt: title }] },
  }
}

export default async function CityTypePage({ params }: { params: Promise<{ city: string; type: string }> }) {
  const { city, type } = await params
  const { requested, city: c, t: typeMatch, season } = resolve(city, type)
  if (!c || (!typeMatch && !season)) notFound()
  const cityName = c.name
  const slug = typeMatch ? typeMatch.slug : season!.slug
  if (requested !== cityName || type !== slug) redirect(`/cities/${encodeURIComponent(cityName)}/${slug}`)

  const rows = await loadRows(cityName, { t: typeMatch, s: season })
  const { runs, venueNames, f } = facts(cityName, rows)
  const shown = runs.slice(0, 60)
  // A season page reads like a type page: same layout, its own words.
  const fmt = (iso: string) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(iso))
  const t: CityType = typeMatch ?? { slug: season!.slug, category: '', label: season!.label, plural: season!.plural, singular: season!.singular, emoji: season!.emoji }
  const faqs = typeMatch ? cityTypeFaqs(cityName, typeMatch, f) : seasonFaqs(cityName, season!, {
    count: f.count, venueNames, priceFrom: f.priceFrom,
    firstWhen: runs[0] ? fmt(runs[0].first.start_date) : null,
    lastWhen: runs.length ? fmt(runs.reduce((m, g) => g.last > m ? g.last : m, runs[0].last)) : null,
  })
  const h1 = typeMatch ? cityTypeH1(cityName, typeMatch) : seasonH1(cityName, season!)
  const descriptionText = typeMatch ? cityTypeDescription(cityName, typeMatch, f.count, venueNames) : seasonDescription(cityName, season!, f.count, venueNames)
  const url = `https://www.theshowfinder.com/cities/${encodeURIComponent(cityName)}/${slug}`
  const cityUrl = `https://www.theshowfinder.com/cities/${encodeURIComponent(cityName)}`

  // Other types in this city, and this type in the nearest cities: the links that tie the pages together.
  const centre = CITY_CENTRES[cityName]
  const nearby = centre
    ? CITIES.filter(x => x.name !== cityName && CITY_CENTRES[x.name])
        .map(x => ({ name: x.name, d: Math.hypot(CITY_CENTRES[x.name][0] - centre[0], (CITY_CENTRES[x.name][1] - centre[1]) * Math.cos(centre[0] * Math.PI / 180)) }))
        .sort((a, b) => a.d - b.d).slice(0, 5).map(x => x.name)
    : []

  const breadcrumb = buildBreadcrumbSchema([
    { name: 'Home', url: 'https://www.theshowfinder.com' },
    { name: cityName, url: cityUrl },
    { name: t.label, url },
  ])
  const itemList = buildItemListSchema(shown.slice(0, 20).map(g => ({ name: g.first.title, url: `https://www.theshowfinder.com/events/${g.first.slug}` })))
  const collection = buildCityCollectionSchema({ cityName, url, name: h1, description: descriptionText })
  const faqSchema = faqs.length ? {
    '@context': 'https://schema.org', '@type': 'FAQPage',
    mainEntity: faqs.map(x => ({ '@type': 'Question', name: x.q, acceptedAnswer: { '@type': 'Answer', text: x.a } })),
  } : null

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#F5F5F0' }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(breadcrumb) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(collection) }} />
      {itemList.itemListElement.length > 0 && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(itemList) }} />}
      {faqSchema && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(faqSchema) }} />}

      <div className="relative py-12 px-4 sm:px-6 lg:px-8" style={{ backgroundColor: '#1A1A2E' }}>
        <div className="max-w-7xl mx-auto">
          <nav className="text-white/40 text-xs mb-3">
            <Link href="/" className="hover:text-white/70">Home</Link>{' / '}
            <Link href={`/cities/${encodeURIComponent(cityName)}`} className="hover:text-white/70">{cityName}</Link>{' / '}{t.label}
          </nav>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-white mb-2"><span aria-hidden="true">{t.emoji} </span>{h1}</h1>
          <p className="text-white/60 text-sm max-w-2xl">
            {f.count > 0
              ? `${f.count} upcoming ${f.count === 1 ? t.singular : t.plural}${venueNames.length ? ` at venues including ${venueNames.slice(0, 3).join(', ')}` : ''}. Updated every day.`
              : `Nothing listed right now. New ${t.plural} are added every day.`}
          </p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-10">
        <nav aria-label={`More in ${cityName}`} className="flex flex-wrap gap-2">
          {CITY_TYPES.map(x => (
            <Link key={x.slug} href={cityTypePath(cityName, x)} aria-current={x.slug === t.slug ? 'page' : undefined}
              className={`px-4 py-2 rounded-full text-sm font-bold border min-h-[40px] flex items-center ${x.slug === t.slug ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-700 border-slate-200 hover:border-slate-400'}`}>
              {x.emoji} {x.label}
            </Link>
          ))}
          <Link href={`/cities/${encodeURIComponent(cityName)}/this-weekend`} className="px-4 py-2 rounded-full text-sm font-bold border bg-white text-slate-700 border-slate-200 hover:border-slate-400 min-h-[40px] flex items-center">This weekend</Link>
        </nav>
        {(inSeason() || season) && (
          <nav aria-label={`${cityName} this season`} className="flex flex-wrap gap-2 -mt-6">
            {SEASONS.map(x => (
              <Link key={x.slug} href={`/cities/${encodeURIComponent(cityName)}/${x.slug}`} aria-current={x.slug === slug ? 'page' : undefined}
                className={`px-4 py-2 rounded-full text-sm font-bold border min-h-[40px] flex items-center ${x.slug === slug ? 'bg-[#E8003D] text-white border-[#E8003D]' : 'bg-white text-slate-700 border-slate-200 hover:border-slate-400'}`}>
                {x.emoji} {x.label}
              </Link>
            ))}
          </nav>
        )}

        {shown.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {shown.map(g => (
              <EventCard key={g.first.id} event={g.first}
                run={g.dates > 1 ? { dateCount: g.dates, lastDate: g.last, cityCount: 1, homeCity: null, homeDates: g.dates, alsoIn: [], alsoMore: 0 } : undefined} />
            ))}
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center">
            <p className="text-slate-600 mb-4">No {t.plural} listed in {cityName} right now.</p>
            <Link href={`/cities/${encodeURIComponent(cityName)}`} className="inline-block font-bold text-white px-6 py-3 rounded-xl" style={{ backgroundColor: '#E8003D' }}>See everything on in {cityName}</Link>
          </div>
        )}
        {typeMatch && runs.length > shown.length && (
          <p className="text-sm text-slate-600">Showing the next {shown.length} of {runs.length}. <Link href={`/events?category=${t.category}&city=${encodeURIComponent(cityName)}`} className="font-semibold underline">See them all</Link></p>
        )}

        {venueNames.length > 0 && (
          <section>
            <h2 className="text-xl font-extrabold text-slate-900 mb-3">{t.label} venues in {cityName}</h2>
            <ul className="flex flex-wrap gap-2">
              {[...new Map(rows.filter(r => r.venue_slug && r.venue_name && venueNames.slice(0, 12).includes(r.venue_name)).map(r => [r.venue_name, r.venue_slug])).entries()].map(([name, slug]) => (
                <li key={slug}><Link href={`/venues/${slug}`} className="inline-block px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-sm font-semibold text-slate-700 hover:border-slate-400">{name}</Link></li>
              ))}
            </ul>
          </section>
        )}

        {faqs.length > 0 && (
          <section className="max-w-3xl">
            <h2 className="text-xl font-extrabold text-slate-900 mb-3">{t.label} in {cityName}: questions</h2>
            <dl className="space-y-4">
              {faqs.map(x => (
                <div key={x.q}><dt className="font-bold text-slate-900">{x.q}</dt><dd className="text-slate-600">{x.a}</dd></div>
              ))}
            </dl>
          </section>
        )}

        {nearby.length > 0 && (
          <section>
            <h2 className="text-lg font-extrabold text-slate-900 mb-2">{t.label} near {cityName}</h2>
            <div className="flex flex-wrap gap-x-5 gap-y-2">
              {nearby.map(n => <Link key={n} href={`/cities/${encodeURIComponent(n)}/${slug}`} className="text-sm font-semibold hover:underline" style={{ color: '#026CDF' }}>{t.label} in {n} →</Link>)}
            </div>
          </section>
        )}

        <Link href="/list-your-event" className="block rounded-2xl border-2 border-dashed border-slate-300 bg-white p-5 hover:border-slate-500">
          <p className="text-xs font-extrabold uppercase tracking-widest" style={{ color: '#E8003D' }}>Putting on {typeMatch && t.slug !== 'sport' ? `a ${t.singular}` : 'an event'} in {cityName}?</p>
          <p className="mt-1 text-lg font-extrabold text-slate-900">List it free →</p>
        </Link>
      </div>
    </div>
  )
}
