import Link from 'next/link'
import { requireAdmin } from '@/lib/admin-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { markListingFineAction, hideListingAction } from './actions'

export const dynamic = 'force-dynamic'

type Ev = { id: string; title: string; slug: string; start_date: string; venue: { name: string | null; city: string | null } | null } | null
type Issue = { id: string; kind: string; detail: string; first_seen_at: string; event: Ev; other: Ev }

const KIND: Record<string, string> = {
  near_duplicate: 'Possible duplicate',
  not_a_show_words: 'May not be a show',
  placeholder_time: '23:59 start',
}

function when(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' })
}

function EventLine({ e, label }: { e: Ev; label?: string }) {
  if (!e) return null
  return (
    <p className="text-sm">
      {label && <span className="text-slate-400">{label} </span>}
      <a href={`/events/${e.slug}`} target="_blank" rel="noopener noreferrer" className="font-bold text-slate-900 underline">{e.title}</a>
      <span className="text-slate-500"> · {when(e.start_date)} · {[e.venue?.name, e.venue?.city].filter(Boolean).join(', ')}</span>
    </p>
  )
}

export default async function ListingCheckPage() {
  await requireAdmin()
  const db = createAdminClient()
  const sel = 'id, title, slug, start_date, venue:venues(name, city)'
  const { data, error } = await db
    .from('listing_quality_issues')
    .select(`id, kind, detail, first_seen_at, event:events!listing_quality_issues_event_id_fkey(${sel}), other:events!listing_quality_issues_other_event_id_fkey(${sel})`)
    .eq('status', 'open')
    .order('first_seen_at', { ascending: false })
    .limit(100)
  const issues = (data ?? []) as unknown as Issue[]
  const { count: total } = await db.from('listing_quality_issues').select('id', { count: 'exact', head: true }).eq('status', 'open')
  const { count: hiddenCount } = await db.from('listing_hides').select('event_id', { count: 'exact', head: true })

  return (
    <div className="min-h-screen bg-slate-50">
      <main className="max-w-4xl mx-auto px-4 py-6 space-y-4">
        <Link href="/admin" className="text-sm font-semibold text-slate-500">← Today</Link>
        <h1 className="text-xl font-extrabold text-slate-900">Listings check</h1>
        <p className="text-sm text-slate-600">
          Every morning the site checks all upcoming listings. Exact duplicates are hidden automatically ({hiddenCount ?? 0} hidden so far).
          These are the ones it was not sure about. Open the listing, then tap <strong>Looks fine</strong> or <strong>Hide from site</strong>. Each one only ever comes up once.
        </p>
        {error && <p className="rounded-xl border px-4 py-3 text-sm font-semibold bg-red-50 border-red-200 text-red-800">Could not load the check ({error.message}). Has migration 124 been run?</p>}
        <p className="text-sm font-bold text-slate-900">{total ?? 0} to look at{(total ?? 0) > issues.length ? ` (showing the newest ${issues.length})` : ''}</p>
        {issues.length === 0 && !error && <p className="rounded-2xl bg-white border border-slate-200 p-5 text-sm text-slate-600">Nothing to look at. The listings are clean.</p>}
        <ul className="space-y-3">
          {issues.map(i => (
            <li key={i.id} className="rounded-2xl bg-white border border-slate-200 p-4 space-y-2">
              <p className="text-xs font-extrabold uppercase tracking-widest text-amber-700">{KIND[i.kind] ?? i.kind}</p>
              <EventLine e={i.event} />
              {i.other && <EventLine e={i.other} label="Same as?" />}
              <p className="text-sm text-slate-600">{i.detail}</p>
              <div className="flex flex-wrap gap-2 pt-1">
                <form action={markListingFineAction}>
                  <input type="hidden" name="issueId" value={i.id} />
                  <button type="submit" className="min-h-[40px] px-4 rounded-xl border border-slate-300 text-sm font-bold text-slate-800">Looks fine</button>
                </form>
                {i.event && (
                  <form action={hideListingAction}>
                    <input type="hidden" name="issueId" value={i.id} />
                    <input type="hidden" name="eventId" value={i.event.id} />
                    <button type="submit" className="min-h-[40px] px-4 rounded-xl text-sm font-bold text-white" style={{ backgroundColor: '#E8003D' }}>Hide from site</button>
                  </form>
                )}
              </div>
            </li>
          ))}
        </ul>
      </main>
    </div>
  )
}
