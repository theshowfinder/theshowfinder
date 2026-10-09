export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { requireAdmin } from '@/lib/admin-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { approveExistingGigsbergMatchAction, checkGigsbergInventoryAction, createGigsbergEventAction, rejectGigsbergMatchAction } from '../actions'

type MatchRow = {
  id: number
  name: string
  event_date: string
  venue: string | null
  city: string | null
  performer1: string | null
  url: string
  match_status: string
  match_confidence: number | null
  match_reason: string | null
  matched_event_id: string | null
  inventory_status: string
  inventory_checked_at: string | null
  image_status: string
}

type PossibleEvent = { id: string; title: string; slug: string }

export default async function GigsbergMatchesPage({ searchParams }: { searchParams: Promise<{ checked?: string; matched?: string; review?: string; noMatch?: string; errors?: string; approved?: string; error?: string; inventory?: string; view?: string }> }) {
  await requireAdmin()
  const params = await searchParams
  const matchedView = params.view === 'matched'
  const db = createAdminClient()
  const { data, error } = await db
    .from('gigsberg_catalogue_events')
    .select('id, name, event_date, venue, city, performer1, url, match_status, match_confidence, match_reason, matched_event_id, inventory_status, inventory_checked_at, image_status')
    .in('match_status', matchedView ? ['auto_matched', 'approved_existing', 'approved_new'] : ['pending', 'review', 'no_match'])
    .order('event_date', { ascending: true })
    .limit(500) as unknown as { data: MatchRow[] | null; error: { message: string } | null }

  const rows = data ?? []
  const eventIds = rows.map(row => row.matched_event_id).filter((id): id is string => Boolean(id))
  const { data: possibleEvents } = eventIds.length
    ? await db.from('events').select('id, title, slug').in('id', eventIds)
    : { data: [] as PossibleEvent[] }
  const eventMap = new Map((possibleEvents ?? []).map(event => [event.id, event as PossibleEvent]))

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center gap-4">
        <Link href="/admin/gigsberg" className="text-slate-400 hover:text-slate-600 text-sm">← Gigsberg</Link>
        <h1 className="text-xl font-extrabold text-slate-900">Gigsberg {matchedView ? 'Matched Events' : 'Matches'}</h1>
        <span className="text-slate-400 text-sm">{rows.length} catalogue records shown</span>
        <div className="ml-auto flex gap-2 text-sm font-semibold">
          <Link href="/admin/gigsberg/matches" className={`px-3 py-1.5 rounded-lg ${!matchedView ? 'bg-slate-900 text-white' : 'text-blue-600 hover:bg-blue-50'}`}>Needs review</Link>
          <Link href="/admin/gigsberg/matches?view=matched" className={`px-3 py-1.5 rounded-lg ${matchedView ? 'bg-slate-900 text-white' : 'text-blue-600 hover:bg-blue-50'}`}>Matched</Link>
        </div>
      </header>
      <main className="max-w-[1500px] mx-auto px-4 sm:px-6 py-8">
        {params.checked && <div className="bg-green-50 border border-green-200 text-green-800 rounded-xl px-5 py-4 mb-6 text-sm font-semibold">✓ Matching complete: {params.checked} checked, {params.matched ?? 0} matched automatically, {params.review ?? 0} needing review, {params.noMatch ?? 0} new event candidates{params.errors && params.errors !== '0' ? `, ${params.errors} errors` : ''}.</div>}
        {params.approved && <div className="bg-green-50 border border-green-200 text-green-800 rounded-xl px-5 py-4 mb-6 text-sm font-semibold">✓ {params.approved === 'existing' ? 'Affiliate link approved on the existing Showfinder event.' : params.approved === 'new' ? 'New Showfinder event page created.' : 'Catalogue record rejected.'}</div>}
        {params.error && <div className="bg-red-50 border border-red-200 text-red-800 rounded-xl px-5 py-4 mb-6 text-sm">Matching could not complete: {params.error}</div>}
        {params.inventory && <div className={`rounded-xl px-5 py-4 mb-6 text-sm font-semibold ${params.inventory === 'available' ? 'bg-green-50 border border-green-200 text-green-800' : 'bg-amber-50 border border-amber-200 text-amber-800'}`}>{params.inventory === 'available' ? '✓ Inventory found — this event can be highlighted.' : params.inventory === 'no_inventory' ? 'No current inventory found; keep this event unhighlighted.' : 'Inventory could not be confirmed.'}</div>}
        {error ? (
          <div className="bg-red-50 border border-red-200 text-red-800 rounded-xl p-6">Unable to load matches: {error.message}</div>
        ) : rows.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-500">No Gigsberg catalogue records found.</div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-x-auto">
            <table className="w-full min-w-[1050px] text-sm">
              <thead><tr className="border-b border-slate-100 bg-slate-50 text-left">
                <th className="px-4 py-3 font-semibold text-slate-600">Gigsberg event</th>
                <th className="px-4 py-3 font-semibold text-slate-600">Date / location</th>
                <th className="px-4 py-3 font-semibold text-slate-600">Status</th>
                <th className="px-4 py-3 font-semibold text-slate-600">Possible match</th>
                <th className="px-4 py-3" />
              </tr></thead>
              <tbody>{rows.map(row => <tr key={row.id} className="border-b border-slate-100 last:border-0 align-top">
                <td className="px-4 py-4"><p className="font-bold text-slate-900">{row.name}</p><p className="text-xs text-slate-400 mt-1">{row.performer1 || 'Performer unknown'} · ID {row.id}</p></td>
                <td className="px-4 py-4 text-slate-600 whitespace-nowrap">{new Date(row.event_date).toLocaleDateString('en-GB')}<p className="text-xs text-slate-400 mt-1">{row.venue || 'Venue unknown'}{row.city ? `, ${row.city}` : ''}</p></td>
                <td className="px-4 py-4"><span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${row.match_status === 'review' ? 'bg-amber-100 text-amber-800' : row.match_status === 'pending' ? 'bg-blue-100 text-blue-800' : row.match_status === 'auto_matched' ? 'bg-green-100 text-green-800' : 'bg-slate-100 text-slate-600'}`}>{row.match_status === 'review' ? 'Review' : row.match_status === 'pending' ? 'Awaiting match' : row.match_status === 'auto_matched' ? 'Auto matched' : row.match_status === 'approved_existing' ? 'Approved existing' : row.match_status === 'approved_new' ? 'Showfinder page created' : 'New event candidate'}</span>{row.inventory_status !== 'unknown' && <span className={`mt-2 inline-flex rounded-full px-3 py-1 text-xs font-bold ${row.inventory_status === 'available' ? 'bg-green-100 text-green-800' : row.inventory_status === 'no_inventory' ? 'bg-slate-100 text-slate-600' : 'bg-amber-100 text-amber-800'}`}>{row.inventory_status === 'available' ? 'Tickets available' : row.inventory_status === 'no_inventory' ? 'No inventory' : 'Check failed'}</span>}{row.image_status !== 'pending' && <span className="mt-2 inline-flex rounded-full px-3 py-1 text-xs font-bold bg-violet-100 text-violet-800">{row.image_status === 'artist_image' ? 'Artist image' : 'Branded fallback'}</span>}</td>
                <td className="px-4 py-4 text-slate-600">{row.match_reason || 'No close match found'}{row.match_confidence !== null && <p className="text-xs text-slate-400 mt-1">Confidence {Math.round(row.match_confidence * 100)}%</p>}{row.matched_event_id && eventMap.get(row.matched_event_id) && <Link href={`/events/${eventMap.get(row.matched_event_id)!.slug}`} target="_blank" className="block text-blue-600 font-semibold mt-2 hover:underline">Open Showfinder event →</Link>}</td>
                <td className="px-4 py-4 whitespace-nowrap space-y-2"><a href={row.url} target="_blank" rel="noreferrer" className="block text-blue-600 font-semibold hover:underline">Open Gigsberg →</a>{matchedView ? <span className="block text-slate-400 text-xs">Matched record</span> : row.match_status !== 'approved_existing' && row.match_status !== 'approved_new' && row.match_status !== 'rejected' && <><form action={checkGigsbergInventoryAction}><input type="hidden" name="catalogue_id" value={row.id} /><button className="block text-blue-700 font-bold hover:underline">Check inventory</button></form>{row.matched_event_id ? <><form action={approveExistingGigsbergMatchAction}><input type="hidden" name="catalogue_id" value={row.id} /><input type="hidden" name="event_id" value={row.matched_event_id} /><button className="block text-green-700 font-bold hover:underline">Approve match</button>{row.inventory_status === 'available' && <button type="submit" name="highlight" value="1" className="block text-emerald-700 font-semibold hover:underline">Approve + highlight</button>}</form><form action={rejectGigsbergMatchAction}><input type="hidden" name="catalogue_id" value={row.id} /><button className="block text-slate-500 font-semibold hover:underline">Reject</button></form></> : <><Link href={`/admin/gigsberg/link?catalogue_id=${row.id}`} className="block text-green-700 font-bold hover:underline">Link existing event</Link><form action={createGigsbergEventAction}><input type="hidden" name="catalogue_id" value={row.id} /><button className="block text-green-700 font-bold hover:underline">Create Showfinder page</button>{row.inventory_status === 'available' && <button type="submit" name="highlight" value="1" className="block text-emerald-700 font-semibold hover:underline">Create + highlight</button>}</form><form action={rejectGigsbergMatchAction}><input type="hidden" name="catalogue_id" value={row.id} /><button className="block text-slate-500 font-semibold hover:underline">Reject</button></form></>}</>}</td>
              </tr>)}</tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  )
}
