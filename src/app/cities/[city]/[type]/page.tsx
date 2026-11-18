// "{Type} in {City}" pages (/cities/Coventry/concerts, see src/lib/cityTypeSeo.ts) and seasonal pages
// (/cities/Leeds/panto, /christmas, /new-years-eve, see src/lib/citySeasonSeo.ts) and month pages
// (/cities/Leeds/december-2026, see src/lib/cityMonthSeo.ts).
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
  CITY_TYPES, MIN_INDEXABLE, cityTypeBySlug, cityTypeByCategory, cityTypePath, cityTypeTitle, cityTypeH1, cityTypeDescription,
  cityTypeFaqs, groupRuns, weekendDatesLondon, type CityType,
} from '@/lib/cityTypeSeo'
import type { EventWithVenue } from '@/lib/types/database'
import {
  SEASONS, seasonBySlug, seasonWindow, matchesSeason, seasonTitle, seasonH1, seasonDescription, seasonFaqs, inSeason, type Season,
} from '@/lib/citySeasonSeo'
import {
  parseMonthSlug, monthState, monthWindow, upcomingMonths, spreadAcrossDays, monthTitle, monthH1, monthDescription, monthFaqs, categorySummary, type CityMonth,
} from '@/lib/cityMonthSeo'

export async function generateStaticParams() {
  return []
}

type Row = EventWithVenue & { venue_slug?: string | null }

type Kind = { t?: CityType; s?: Season; m?: CityMonth }

async function loadRows(cityName: string, c: Kind): Promise<Row[]> {
  const supabase = createPublicClient()
  const w = c.s ? seasonWindow(c.s) : c.m ? monthWindow(c.m) : { from: new Date().toISOString(), to: null }
  const max = c.t ? 800 : 4000
  const rows: Row[] = []
  // Pages of 1000 (the API's row cap), so a busy city's month or season is not cut short.
  for (let from = 0; from < max; from += 1000) {
    let q = supabase.from('listed_events_with_venue').select('*').ilike('venue_city', cityName).in('status', LIVE_EVENT_STATUSES).gte('start_date', w.from)
    if (w.to) q = q.lt('start_date', w.to)
    if (c.t) q = q.eq('category', c.t.category)
    const { data } = await (q.order('start_date', { ascending: true }).order('id').range(from, Math.min(from + 1000, max) - 1) as unknown as Promise<{ data: Row[] | null }>)
    rows.push(...(data ?? []))
    if (!data || data.length < 1000) break
  }
  const kept = c.s ? rows.filter(r => matchesSeason(c.s!, r)) : rows
  const dupes = await fetchDuplicateIds(supabase, kept.map(r => r.id))
  return kept.filter(r => !dupes.has(r.id))
}

function resolve(cityParam: string, typeParam: string) {
  const requested = decodeURIComponent(cityParam)
  const city = CITIES.find(c => c.name.toLowerCase() === requested.toLowerCase())
  const t = cityTypeBySlug(typeParam)
  const season = t ? undefined : seasonBySlug(typeParam)
  const month = t || season ? null : parseMonthSlug(typeParam)
  return { requested, city, t, season, month }
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
  const byCat = new Map<string, number>()
  for (const g of runs) { const ct = cityTypeByCategory(g.first.category); if (ct) byCat.set(ct.plural, (byCat.get(ct.plural) ?? 0) + 1) }
  const summary = categorySummary([...byCat.entries()])
  const perDay = new Map<string, number>()
  for (const r of rows) { const d = london(r.start_date); perDay.set(d, (perDay.get(d) ?? 0) + 1) }
  const busiest = [...perDay.entries()].sort((a, b) => b[1] - a[1])[0]
  const busiestDay = busiest && busiest[1] >= 3 ? new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(`${busiest[0]}T12:00:00Z`)) : null
  return {
    runs, venueNames, summary, busiestDay,
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
  const { city: c, t, season, month } = resolve(city, type)
  const m = month && monthState(month) === 'live' ? month : undefined
  if (!c || (!t && !season && !m)) return { title: 'Not found' }
  const rows = await loadRows(c.name, { t, s: season, m })
  const { f, summary } = facts(c.name, rows)
  const title = t ? cityTypeTitle(c.name, t) : season ? seasonTitle(c.name, season) : monthTitle(c.name, m!)
  const description = t ? cityTypeDescription(c.name, t, f.count, f.venueNames) : season ? seasonDescription(c.name, season, f.count, f.venueNames) : monthDescription(c.name, m!, f.count, summary, f.venueNames)
  const canonical = `https://www.theshowfinder.com/cities/${encodeURIComponent(c.name)}/${t ? t.slug : season ? season.slug : m!.slug}`
  return {
    title, description,
    alternates: { canonical },
    ...(f.count < MIN_INDEXABLE ? { robots: { index: false, follow: true } } : {}),
    openGraph: { title, description, url: canonical, images: [{ url: 'https://www.theshowfinder.com/og-image.png', width: 1200, height: 630, alt: title }] },
  }
}

export default async function CityTypePage({ params }: { params: Promise<{ city: string; type: string }> }) {
  const { city, type } = await params
  const { requested, city: c, t: typeMatch, season, month } = resolve(city, type)
  if (!c || (!typeMatch && !season && !month)) notFound()
  const cityName = c.name
  // A month that has gone sends people to this month; more than a year ahead has no page yet.
  if (month && monthState(month) === 'past') redirect(`/cities/${encodeURIComponent(cityName)}/${upcomingMonths()[0].slug}`)
  if (month && monthState(month) === 'too-far') notFound()
  const m = month ?? undefined
  const slug = typeMatch ? typeMatch.slug : season ? season.slug : m!.slug
  if (requested !== cityName || type !== slug) redirect(`/cities/${encodeURIComponent(cityName)}/${slug}`)

  const rows = await loadRows(cityName, { t: typeMatch, s: season, m })
  const { runs, venueNames, f, summary, busiestDay } = facts(cityName, rows)
  const shown = m ? spreadAcrossDays(runs, 90) : runs.slice(0, 60)
  // A season page reads like a type page: same layout, its own words.
  const fmt = (iso: string) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(iso))
  const t: CityType = typeMatch
    ?? (season ? { slug: season.slug, category: '', label: season.label, plural: season.plural, singular: season.singular, emoji: season.emoji }
      : { slug: m!.slug, category: '', label: m!.label, plural: 'events', singular: 'event', emoji: '📅' })
  const faqs = typeMatch ? cityTypeFaqs(cityName, typeMatch, f) : m ? monthFaqs(cityName, m, { count: f.count, summary, venueNames, priceFrom: f.priceFrom, busiestDay }) : seasonFaqs(cityName, season!, {
    count: f.count, venueNames, priceFrom: f.priceFrom,
    firstWhen: runs[0] ? fmt(runs[0].first.start_date) : null,
    lastWhen: runs.length ? fmt(runs.reduce((m, g) => g.last > m ? g.last : m, runs[0].last)) : null,
  })
  const h1 = typeMatch ? cityTypeH1(cityName, typeMatch) : season ? seasonH1(cityName, season) : monthH1(cityName, m!)
  const descriptionText = typeMatch ? cityTypeDescription(cityName, typeMatch, f.count, venueNames) : season ? seasonDescription(cityName, season, f.count, venueNames) : monthDescription(cityName, m!, f.count, summary, venueNames)
  // Section wording: "Comedy venues in Leeds" reads fine; a month needs "Venues in Leeds in December 2026".
  const venuesHeading = m ? `Venues with events in ${m.label}` : `${t.label} venues in ${cityName}`
  const faqHeading = m ? `${cityName} in ${m.label}: questions` : `${t.label} in ${cityName}: questions`
  const nearbyHeading = m ? `What's on near ${cityName} in ${m.label}` : `${t.label} near ${cityName}`
  const nearbyLink = (n: string) => m ? `${n} in ${m.label} →` : `${t.label} in ${n} →`
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
              ? `${f.count} ${m ? '' : 'upcoming '}${f.count === 1 ? t.singular : t.plural}${m && summary ? `, including ${summary},` : ''}${venueNames.length ? ` at venues including ${venueNames.slice(0, 3).join(', ')}` : ''}. Updated every day.`
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

        {m && (
          <nav aria-label={`${cityName} by month`} className="flex gap-2 overflow-x-auto pb-1 -mt-6">
            {upcomingMonths().map(x => (
              <Link key={x.slug} href={`/cities/${encodeURIComponent(cityName)}/${x.slug}`} aria-current={x.slug === slug ? 'page' : undefined}
                className={`shrink-0 px-4 py-2 rounded-full text-sm font-bold border min-h-[40px] flex items-center ${x.slug === slug ? 'bg-[#E8003D] text-white border-[#E8003D]' : 'bg-white text-slate-700 border-slate-200 hover:border-slate-400'}`}>
                {x.short} {String(x.year).slice(2)}
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
        {m && runs.length > shown.length && (
          <p className="text-sm text-slate-600">Showing {shown.length} of {runs.length} shows across {m.label}, a few from each day.</p>
        )}
        {typeMatch && runs.length > shown.length && (
          <p className="text-sm text-slate-600">Showing the next {shown.length} of {runs.length}. <Link href={`/events?category=${t.category}&city=${encodeURIComponent(cityName)}`} className="font-semibold underline">See them all</Link></p>
        )}

        {venueNames.length > 0 && (
          <section>
            <h2 className="text-xl font-extrabold text-slate-900 mb-3">{venuesHeading}</h2>
            <ul className="flex flex-wrap gap-2">
              {[...new Map(rows.filter(r => r.venue_slug && r.venue_name && venueNames.slice(0, 12).includes(r.venue_name)).map(r => [r.venue_name, r.venue_slug])).entries()].map(([name, slug]) => (
                <li key={slug}><Link href={`/venues/${slug}`} className="inline-block px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-sm font-semibold text-slate-700 hover:border-slate-400">{name}</Link></li>
              ))}
            </ul>
          </section>
        )}

        {faqs.length > 0 && (
          <section className="max-w-3xl">
            <h2 className="text-xl font-extrabold text-slate-900 mb-3">{faqHeading}</h2>
            <dl className="space-y-4">
              {faqs.map(x => (
                <div key={x.q}><dt className="font-bold text-slate-900">{x.q}</dt><dd className="text-slate-600">{x.a}</dd></div>
              ))}
            </dl>
          </section>
        )}

        {nearby.length > 0 && (
          <section>
            <h2 className="text-lg font-extrabold text-slate-900 mb-2">{nearbyHeading}</h2>
            <div className="flex flex-wrap gap-x-5 gap-y-2">
              {nearby.map(n => <Link key={n} href={`/cities/${encodeURIComponent(n)}/${slug}`} className="text-sm font-semibold hover:underline" style={{ color: '#026CDF' }}>{nearbyLink(n)}</Link>)}
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
