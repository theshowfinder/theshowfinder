export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { requireAdmin } from '@/lib/admin-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { CITIES } from '@/lib/cities'
import { LIVE_EVENT_STATUSES } from '@/lib/eventPools'
import RunMatchingButton from './RunMatchingButton'
import RunCatalogueImportButton from './RunCatalogueImportButton'
import {
  getGigsbergAffiliateOrders,
  searchGigsbergAffiliateEvents,
  type GigsbergAffiliateEvent,
} from '@/lib/gigsbergAffiliate'

function formatDate(date: string, time?: string) {
  const value = new Date(`${date}${time ? `T${time}` : 'T00:00:00'}`)
  if (Number.isNaN(value.getTime())) return `${date}${time ? ` ${time}` : ''}`
  return value.toLocaleString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
    ...(time ? { hour: '2-digit', minute: '2-digit' } : {}),
  })
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'The Gigsberg API could not be reached.'
}

export default async function GigsbergAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; city?: string; synced?: string; updated?: string; importCity?: string; nextCity?: string; syncError?: string }>
}) {
  await requireAdmin()
  const { q = '', city = '', synced, updated, importCity, nextCity, syncError } = await searchParams
  const query = q.trim()
  const cityQuery = city.trim()
  const db = createAdminClient()

  let events: GigsbergAffiliateEvent[] = []
  let eventError: string | null = null
  let orderTotal: number | null = null
  let orderError: string | null = null

  const normalise = (value: string | null | undefined) => (value ?? '').trim().toLowerCase()
  const nowISO = new Date().toISOString()
  // Count each city separately. A single large events query is subject to
  // Supabase/PostgREST's row cap, which can make later cities falsely appear
  // empty once the response has filled with rows from larger cities.
  const showfinderResults = await Promise.all(CITIES.map(cityItem =>
    db.from('events_with_venue')
      .select('*', { count: 'exact', head: true })
      .ilike('venue_city', cityItem.name)
      .in('status', LIVE_EVENT_STATUSES)
      .gte('start_date', nowISO) as unknown as Promise<{ count: number | null; error: unknown }>
  ))
  const showfinderCounts = new Map<string, number>()
  CITIES.forEach((cityItem, index) => {
    const result = showfinderResults[index]
    showfinderCounts.set(normalise(cityItem.name), result?.error ? 0 : (result?.count ?? 0))
  })

  const { data: catalogueRows } = await db.from('gigsberg_catalogue_events').select('event_date, city').limit(50000) as unknown as { data: Array<{ event_date: string; city: string | null }> | null }
  const catalogueCounts = new Map<string, number>()
  for (const row of catalogueRows ?? []) {
    const cityName = normalise(row.city)
    if (cityName) catalogueCounts.set(cityName, (catalogueCounts.get(cityName) ?? 0) + 1)
  }

  const [eventResult, orderResult] = await Promise.allSettled([
    query || cityQuery
      ? searchGigsbergAffiliateEvents({ name: query || undefined, city: cityQuery || undefined, per_page: 50 })
      : Promise.resolve({ items: [], total: 0, nextPage: null, prevPage: null, lastPage: null }),
    getGigsbergAffiliateOrders({ sort_by: 'order_id', sort_order: 'desc' }),
  ])

  if (eventResult.status === 'fulfilled') events = eventResult.value.items ?? []
  else eventError = errorMessage(eventResult.reason)
  if (orderResult.status === 'fulfilled') orderTotal = orderResult.value.total
  else orderError = errorMessage(orderResult.reason)

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center gap-4">
        <Link href="/admin" className="text-slate-400 hover:text-slate-600 text-sm">← Admin</Link>
        <h1 className="text-xl font-extrabold text-slate-900">Gigsberg Affiliate</h1>
        <span className="text-slate-400 text-sm">Phase 1 monitoring</span>
      </header>

      <main className="max-w-[1500px] mx-auto px-4 sm:px-6 py-8 space-y-6">
        <section className="grid gap-4 sm:grid-cols-3">
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
            <p className="text-xs uppercase tracking-wide font-bold text-slate-400">Affiliate orders</p>
            <p className="text-3xl font-extrabold text-slate-900 mt-2">{orderTotal ?? '—'}</p>
            <p className="text-xs text-slate-500 mt-1">Reported by Gigsberg</p>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
            <p className="text-xs uppercase tracking-wide font-bold text-slate-400">Commission rate</p>
            <p className="text-3xl font-extrabold text-slate-900 mt-2">9%</p>
            <p className="text-xs text-slate-500 mt-1">Per approved programme terms</p>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
            <p className="text-xs uppercase tracking-wide font-bold text-slate-400">API status</p>
            <p className={`text-3xl font-extrabold mt-2 ${eventError || orderError ? 'text-red-600' : 'text-green-600'}`}>
              {eventError || orderError ? 'Check' : 'Connected'}
            </p>
            <p className="text-xs text-slate-500 mt-1">API key stays server-side</p>
          </div>
        </section>

        {synced && <div className="bg-green-50 border border-green-200 text-green-800 rounded-xl px-5 py-3 text-sm font-semibold">✓ {importCity || 'City'} import complete: {synced} current/future UK events fetched, {updated ?? synced} records saved. Existing catalogue records were preserved. Next city: {nextCity || 'the first city in the queue'}.</div>}
        {syncError && <div className="bg-red-50 border border-red-200 text-red-800 rounded-xl px-5 py-3 text-sm">Catalogue import failed: {syncError}</div>}

        <section className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="text-lg font-extrabold text-slate-900">Catalogue import</h2>
            <p className="text-sm text-slate-500 mt-1">Import the next UK city across the rolling 24-month window. Existing catalogue decisions are preserved.</p>
          </div>
          <RunCatalogueImportButton />
          <RunMatchingButton />
          <Link href="/admin/gigsberg/matches" className="text-blue-600 font-semibold text-sm hover:underline">Review catalogue →</Link>
        </section>

        <section className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <div className="flex items-baseline justify-between gap-4 mb-4">
            <div>
              <h2 className="text-lg font-extrabold text-slate-900">UK city coverage</h2>
              <p className="text-sm text-slate-500 mt-1">Future Showfinder events compared with the current Gigsberg catalogue.</p>
            </div>
            <span className="text-xs text-slate-400">Low counts need checking</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px] text-sm">
              <thead><tr className="border-b border-slate-100 text-left"><th className="py-2 font-semibold text-slate-500">City</th><th className="py-2 font-semibold text-slate-500">Showfinder events</th><th className="py-2 font-semibold text-slate-500">Gigsberg catalogue</th><th className="py-2 font-semibold text-slate-500">Status</th></tr></thead>
              <tbody>{CITIES.map(cityItem => {
                const showfinderCount = showfinderCounts.get(normalise(cityItem.name)) ?? 0
                const catalogueCount = catalogueCounts.get(normalise(cityItem.name)) ?? 0
                const status = showfinderCount === 0 && catalogueCount > 0 ? 'Needs import/matching' : catalogueCount === 0 ? 'No Gigsberg data' : 'Covered'
                return <tr key={cityItem.name} className="border-b border-slate-100 last:border-0"><td className="py-2 font-semibold text-slate-800">{cityItem.emoji} {cityItem.name}</td><td className="py-2 text-slate-600">{showfinderCount}</td><td className="py-2 text-slate-600">{catalogueCount}</td><td className={`py-2 font-semibold ${status === 'Covered' ? 'text-green-700' : 'text-amber-700'}`}>{status}</td></tr>
              })}</tbody>
            </table>
          </div>
        </section>

        <section className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4">
          <div>
            <h2 className="text-lg font-extrabold text-slate-900">Find a Gigsberg event</h2>
            <p className="text-sm text-slate-500 mt-1">Search the marketplace before we automate matching to Showfinder events.</p>
          </div>
          <form method="get" className="grid gap-2 sm:grid-cols-[1fr_1fr_auto_auto]">
            <input name="q" defaultValue={query} placeholder="Artist or event name" aria-label="Artist or event name" className="border border-slate-300 rounded-lg px-3 py-2 text-sm" />
            <input name="city" defaultValue={cityQuery} placeholder="City" aria-label="City" className="border border-slate-300 rounded-lg px-3 py-2 text-sm" />
            <button type="submit" className="font-bold text-white px-5 py-2 rounded-lg text-sm" style={{ backgroundColor: '#E8003D' }}>Search</button>
            {(query || cityQuery) && <Link href="/admin/gigsberg" className="text-center border border-slate-300 text-slate-600 font-semibold px-5 py-2 rounded-lg text-sm">Clear</Link>}
          </form>
          {eventError && <p className="bg-red-50 border border-red-200 text-red-800 rounded-lg px-4 py-3 text-sm">{eventError}</p>}
          {orderError && <p className="bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-4 py-3 text-sm">Orders unavailable: {orderError}</p>}
        </section>

        {(query || cityQuery) && (
          <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-x-auto">
            <table className="w-full min-w-[1100px] text-sm">
              <thead><tr className="border-b border-slate-100 bg-slate-50 text-left">
                <th className="px-4 py-3 font-semibold text-slate-600">Event</th>
                <th className="px-4 py-3 font-semibold text-slate-600">Date</th>
                <th className="px-4 py-3 font-semibold text-slate-600">Venue / city</th>
                <th className="px-4 py-3 font-semibold text-slate-600">Performer</th>
                <th className="px-4 py-3 font-semibold text-slate-600">Affiliate link</th>
              </tr></thead>
              <tbody>
                {events.map(event => <tr key={event.id} className="border-b border-slate-100 last:border-0 align-top">
                  <td className="px-4 py-4 font-bold text-slate-900">{event.name}<p className="text-xs text-slate-400 mt-1">Gigsberg ID {event.id}</p></td>
                  <td className="px-4 py-4 text-slate-600 whitespace-nowrap">{formatDate(event.date, event.time)}</td>
                  <td className="px-4 py-4 text-slate-600">{event.venue || '—'}<p className="text-xs text-slate-400 mt-1">{event.city || event.country || '—'}</p></td>
                  <td className="px-4 py-4 text-slate-600">{[event.performer1, event.performer2].filter(Boolean).join(' / ') || '—'}</td>
                  <td className="px-4 py-4"><a href={event.url} target="_blank" rel="noreferrer" className="text-blue-600 font-semibold hover:underline">Open tracked link →</a></td>
                </tr>)}
              </tbody>
            </table>
            {events.length === 0 && !eventError && <p className="p-10 text-center text-slate-500">No Gigsberg events matched that search.</p>}
          </section>
        )}
      </main>
    </div>
  )
}
