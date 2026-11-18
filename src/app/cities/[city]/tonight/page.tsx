// "What's on in {City} tonight" pages: /cities/Leeds/tonight. "Things to do tonight" and "{city} tonight"
// are among the most common last-minute searches. Everything starting today (London day) that has not
// finished, in time order; late at night, or when nothing is on, tomorrow is shown underneath.
// Revalidated often because the list changes through the day.
export const revalidate = 900
export const maxDuration = 60

import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import { createPublicClient } from '@/lib/supabase/public'
import EventCard from '@/components/EventCard'
import { CITIES } from '@/lib/cities'
import { LIVE_EVENT_STATUSES, dropDuplicateEvents } from '@/lib/listedEvents'
import { londonDayWindow, isTonightEvent, sortTonightEvents } from '@/lib/tonight'
import { trimTonight } from '@/lib/eventMix'
import { jsonLdScript, buildBreadcrumbSchema, buildItemListSchema } from '@/lib/jsonld'
import { buildCityCollectionSchema } from '@/lib/citySeo'
import { CITY_TYPES, cityTypePath } from '@/lib/cityTypeSeo'
import type { EventWithVenue } from '@/lib/types/database'

export async function generateStaticParams() {
  return []
}

const BASE = 'https://www.theshowfinder.com'
const tonightTitle = (city: string) => `What's On in ${city} Tonight: Gigs, Comedy & Shows`
const tonightDescription = (city: string, n: number) =>
  `${n > 0 ? `${n} things to do in ${city} tonight` : `Things to do in ${city} tonight`}: gigs, comedy, theatre, club nights and more, in time order with tickets. Updated through the day.`

const tomorrowDate = () => new Date(Date.now() + 24 * 3600_000)

async function loadDay(cityName: string, day: Date): Promise<EventWithVenue[]> {
  const supabase = createPublicClient()
  const w = londonDayWindow(day)
  const { data } = await (supabase.from('listed_events_with_venue').select('*')
    .ilike('venue_city', cityName).in('status', LIVE_EVENT_STATUSES)
    .gte('start_date', w.startISO).lt('start_date', w.endISO)
    .order('start_date', { ascending: true }).limit(600) as unknown as Promise<{ data: EventWithVenue[] | null }>)
  const now = Date.now()
  const live = (await dropDuplicateEvents(supabase, data ?? [])).filter(e => isTonightEvent({ start_date: e.start_date, end_date: e.end_date ?? null, status: e.status }, now, w))
  return trimTonight(sortTonightEvents(live), { limit: 60 })
}

function resolveCity(param: string) {
  const requested = decodeURIComponent(param)
  return { requested, city: CITIES.find(c => c.name.toLowerCase() === requested.toLowerCase()) }
}

export async function generateMetadata({ params }: { params: Promise<{ city: string }> }): Promise<Metadata> {
  const { city } = await params
  const { city: c } = resolveCity(city)
  if (!c) return { title: 'Not found' }
  const tonight = await loadDay(c.name, new Date())
  const title = tonightTitle(c.name)
  const description = tonightDescription(c.name, tonight.length)
  const canonical = `${BASE}/cities/${encodeURIComponent(c.name)}/tonight`
  return {
    title, description, alternates: { canonical },
    openGraph: { title, description, url: canonical, images: [{ url: `${BASE}/og-image.png`, width: 1200, height: 630, alt: title }] },
  }
}

export default async function CityTonightPage({ params }: { params: Promise<{ city: string }> }) {
  const { city } = await params
  const { requested, city: c } = resolveCity(city)
  if (!c) notFound()
  const cityName = c.name
  if (requested !== cityName) redirect(`/cities/${encodeURIComponent(cityName)}/tonight`)

  const tonight = await loadDay(cityName, new Date())
  const londonHour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', hourCycle: 'h23' }).format(new Date()))
  const showTomorrow = tonight.length < 6 || londonHour >= 21
  const tomorrow = showTomorrow ? await loadDay(cityName, tomorrowDate()) : []
  const today = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', weekday: 'long', day: 'numeric', month: 'long' }).format(new Date())

  const cityPath = `/cities/${encodeURIComponent(cityName)}`
  const url = `${BASE}${cityPath}/tonight`
  const breadcrumb = buildBreadcrumbSchema([
    { name: 'Home', url: BASE },
    { name: cityName, url: `${BASE}${cityPath}` },
    { name: 'Tonight', url },
  ])
  const itemList = buildItemListSchema(tonight.slice(0, 20).map(e => ({ name: e.title, url: `${BASE}/events/${e.slug}` })))
  const collection = buildCityCollectionSchema({ cityName, url, name: `What's On in ${cityName} Tonight`, description: tonightDescription(cityName, tonight.length) })

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#F5F5F0' }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(breadcrumb) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(collection) }} />
      {itemList.itemListElement.length > 0 && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(itemList) }} />}

      <div className="relative py-12 px-4 sm:px-6 lg:px-8" style={{ backgroundColor: '#1A1A2E' }}>
        <div className="max-w-7xl mx-auto">
          <nav className="text-white/40 text-xs mb-3">
            <Link href="/" className="hover:text-white/70">Home</Link>{' / '}
            <Link href={cityPath} className="hover:text-white/70">{cityName}</Link>{' / Tonight'}
          </nav>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-white mb-2"><span aria-hidden="true">🌙 </span>What&apos;s On in {cityName} Tonight</h1>
          <p className="text-white/60 text-sm">
            {today}. {tonight.length > 0 ? `${tonight.length} ${tonight.length === 1 ? 'show' : 'shows'} still to come, in time order.` : 'Nothing else listed for tonight.'}
          </p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-10">
        <nav aria-label={`More in ${cityName}`} className="flex flex-wrap gap-2">
          <Link href={`${cityPath}/this-weekend`} className="px-4 py-2 rounded-full text-sm font-bold border bg-white text-slate-700 border-slate-200 hover:border-slate-400 min-h-[40px] flex items-center">This weekend</Link>
          <Link href={`${cityPath}/this-week`} className="px-4 py-2 rounded-full text-sm font-bold border bg-white text-slate-700 border-slate-200 hover:border-slate-400 min-h-[40px] flex items-center">This week</Link>
          {CITY_TYPES.map(x => (
            <Link key={x.slug} href={cityTypePath(cityName, x)} className="px-4 py-2 rounded-full text-sm font-bold border bg-white text-slate-700 border-slate-200 hover:border-slate-400 min-h-[40px] flex items-center">{x.emoji} {x.label}</Link>
          ))}
        </nav>

        {tonight.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {tonight.map(e => <EventCard key={e.id} event={e} />)}
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center">
            <p className="text-slate-600">Nothing else is listed in {cityName} for tonight. {tomorrow.length > 0 ? 'Here’s what’s on tomorrow.' : ''}</p>
          </div>
        )}

        {tomorrow.length > 0 && (
          <section>
            <h2 className="text-2xl font-extrabold text-slate-900 mb-4">Tomorrow in {cityName}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {tomorrow.slice(0, 24).map(e => <EventCard key={e.id} event={e} />)}
            </div>
          </section>
        )}

        <div className="flex flex-wrap gap-x-6 gap-y-2">
          <Link href={`${cityPath}/this-weekend`} className="text-sm font-semibold hover:underline" style={{ color: '#026CDF' }}>Things to do in {cityName} this weekend →</Link>
          <Link href={cityPath} className="text-sm font-semibold hover:underline" style={{ color: '#026CDF' }}>Everything coming up in {cityName} →</Link>
        </div>

        <Link href="/list-your-event" className="block rounded-2xl border-2 border-dashed border-slate-300 bg-white p-5 hover:border-slate-500">
          <p className="text-xs font-extrabold uppercase tracking-widest" style={{ color: '#E8003D' }}>Putting on an event in {cityName}?</p>
          <p className="mt-1 text-lg font-extrabold text-slate-900">List it free →</p>
        </Link>
      </div>
    </div>
  )
}
