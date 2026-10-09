export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { requireAdmin } from '@/lib/admin-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { CITIES } from '@/lib/cities'
import { LIVE_EVENT_STATUSES } from '@/lib/eventPools'
import { manualTicketmasterCitySyncAction, targetedTicketmasterImportAction } from './actions'
import { ImportForm, SubmitButton } from './ImportForms'

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10)
}

export default async function TicketmasterAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ keyword?: string; city?: string; from?: string; to?: string; fetched?: string; saved?: string; skipped?: string; errors?: string; cityFrom?: string; cityTo?: string; cityFetched?: string; citySaved?: string; citySkipped?: string; cityErrors?: string; error?: string }>
}) {
  await requireAdmin()
  const params = await searchParams
  const today = new Date()
  const defaultFrom = isoDate(today)
  const defaultTo = isoDate(new Date(today.getTime() + 365 * 24 * 60 * 60 * 1000))
  const defaultCityTo = isoDate(new Date(today.getTime() + 90 * 24 * 60 * 60 * 1000))
  const db = createAdminClient()
  const counts = await Promise.all(CITIES.map(city => db
    .from('events_with_venue')
    .select('*', { count: 'exact', head: true })
    .ilike('venue_city', city.name)
    .not('ticketmaster_id', 'is', null)
    .in('status', LIVE_EVENT_STATUSES)
    .gte('start_date', new Date().toISOString()) as unknown as Promise<{ count: number | null; error: unknown }>))

  return <main className="min-h-screen bg-slate-50 px-4 sm:px-6 py-8">
    <div className="max-w-[1200px] mx-auto space-y-6">
      <header className="flex items-center gap-4"><Link href="/admin" className="text-slate-400 hover:text-slate-600 text-sm">← Admin</Link><h1 className="text-2xl font-extrabold text-slate-900">Ticketmaster coverage</h1><span className="text-slate-400 text-sm">Targeted recovery and audit</span></header>
      {params.fetched && <div className="bg-green-50 border border-green-200 text-green-800 rounded-xl px-5 py-4 text-sm font-semibold">✓ Targeted import complete: {params.fetched} events found, {params.saved ?? 0} records saved, {params.skipped ?? 0} skipped{params.errors && params.errors !== '0' ? `, ${params.errors} errors` : ''}.</div>}
      {params.cityFetched && <div className="bg-green-50 border border-green-200 text-green-800 rounded-xl px-5 py-4 text-sm font-semibold">✓ {params.city || 'City'} sync complete: {params.cityFetched} events found, {params.citySaved ?? 0} records saved, {params.citySkipped ?? 0} skipped{params.cityErrors && params.cityErrors !== '0' ? `, ${params.cityErrors} errors` : ''}.</div>}
      {params.error && <div className="bg-red-50 border border-red-200 text-red-800 rounded-xl px-5 py-4 text-sm">{params.error}</div>}
      <section className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
        <h2 className="text-xl font-extrabold text-slate-900">Targeted Ticketmaster import</h2>
        <p className="text-sm text-slate-500 mt-1 mb-5">Use this when a live Ticketmaster event is missing. Choose a city or search across the whole UK without waiting for the city queue.</p>
        <ImportForm action={targetedTicketmasterImportAction} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5 items-end">
          <label className="text-sm font-semibold text-slate-600 lg:col-span-2">Artist or event<input name="keyword" required defaultValue={params.keyword ?? ''} placeholder="e.g. Mr Polska" className="block w-full mt-1 border border-slate-300 rounded-lg px-3 py-2" /></label>
          <label className="text-sm font-semibold text-slate-600">City<select name="city" defaultValue={params.city ?? ''} className="block w-full mt-1 border border-slate-300 rounded-lg px-3 py-2"><option value="">All UK</option>{CITIES.map(city => <option key={city.name}>{city.name}</option>)}</select></label>
          <label className="text-sm font-semibold text-slate-600">From<input type="date" name="from" required defaultValue={params.from ?? defaultFrom} className="block w-full mt-1 border border-slate-300 rounded-lg px-3 py-2" /></label>
          <label className="text-sm font-semibold text-slate-600">To<input type="date" name="to" required defaultValue={params.to ?? defaultTo} className="block w-full mt-1 border border-slate-300 rounded-lg px-3 py-2" /></label>
          <SubmitButton className="bg-blue-900 text-white font-bold rounded-lg px-5 py-2.5 lg:col-start-5">Search and import</SubmitButton>
        </ImportForm>
      </section>
      <section className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
        <h2 className="text-xl font-extrabold text-slate-900">Manual city sync</h2>
        <p className="text-sm text-slate-500 mt-1 mb-5">Pull every Ticketmaster category for one city and date window now. The window is limited to 92 days so the import can complete safely; repeat it for the next window when needed.</p>
        <ImportForm action={manualTicketmasterCitySyncAction} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5 items-end">
          <label className="text-sm font-semibold text-slate-600">City<select name="city" required defaultValue={params.city ?? ''} className="block w-full mt-1 border border-slate-300 rounded-lg px-3 py-2"><option value="">Choose</option>{CITIES.map(city => <option key={city.name}>{city.name}</option>)}</select></label>
          <label className="text-sm font-semibold text-slate-600">From<input type="date" name="city_from" required defaultValue={params.cityFrom ?? defaultFrom} className="block w-full mt-1 border border-slate-300 rounded-lg px-3 py-2" /></label>
          <label className="text-sm font-semibold text-slate-600">To<input type="date" name="city_to" required defaultValue={params.cityTo ?? defaultCityTo} className="block w-full mt-1 border border-slate-300 rounded-lg px-3 py-2" /></label>
          <SubmitButton className="bg-emerald-700 text-white font-bold rounded-lg px-5 py-2.5 lg:col-span-2">Run city sync now</SubmitButton>
        </ImportForm>
      </section>
      <section className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm"><div className="flex items-center justify-between mb-4"><div><h2 className="text-xl font-extrabold text-slate-900">Ticketmaster import audit</h2><p className="text-sm text-slate-500 mt-1">Live Ticketmaster events currently stored by city. A low count is a prompt to run a targeted search or check the queue.</p></div><Link href="/admin/gigsberg" className="text-blue-600 font-semibold">Open source dashboard →</Link></div><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left"><th className="py-3">City</th><th>Imported Ticketmaster events</th><th /></tr></thead><tbody>{CITIES.map((city, index) => <tr key={city.name} className="border-b last:border-0"><td className="py-3 font-semibold">{city.name}</td><td>{counts[index]?.count ?? 0}</td><td className="text-right"><Link href={`/admin/gigsberg/coverage?city=${encodeURIComponent(city.name)}`} className="text-blue-600 font-semibold">View city →</Link></td></tr>)}</tbody></table></div></section>
    </div>
  </main>
}
