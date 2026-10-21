export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { requireAdmin } from '@/lib/admin-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { CITIES } from '@/lib/cities'
import type { LocalEventSource } from '@/lib/councilEvents'
import { CityActions, RunAll, AddSource } from './Controls'

function ago(iso: string | null | undefined): string {
  if (!iso) return 'never'
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60_000)
  if (mins < 60) return `${mins}m ago`
  if (mins < 48 * 60) return `${Math.round(mins / 60)}h ago`
  return `${Math.round(mins / 1440)}d ago`
}

export default async function LocalEventsAdminPage() {
  await requireAdmin()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as unknown as { from: (t: string) => any }

  const [{ data: sourceRows }, { data: stateRow }, { data: localRows }] = await Promise.all([
    db.from('local_event_sources').select('*').order('city'),
    db.from('council_sync_state').select('mode, max_removals_per_run, last_stats').eq('id', 1).maybeSingle(),
    db.from('events_with_venue').select('venue_city').eq('category', 'local').gte('start_date', new Date().toISOString()).in('status', ['upcoming', 'on_sale', 'sold_out', 'postponed']).limit(20000),
  ])
  const sources = (sourceRows ?? []) as LocalEventSource[]
  const mode = (stateRow as { mode?: string } | null)?.mode ?? 'unknown'
  const cap = (stateRow as { max_removals_per_run?: number } | null)?.max_removals_per_run ?? 20

  const perCity = new Map<string, number>()
  for (const r of (localRows ?? []) as Array<{ venue_city: string | null }>) {
    const k = (r.venue_city ?? '').toLowerCase()
    perCity.set(k, (perCity.get(k) ?? 0) + 1)
  }
  const total = [...perCity.values()].reduce((a, b) => a + b, 0)
  const withSource = new Set(sources.filter(s => s.enabled).map(s => s.city))

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
        <h1 className="text-xl font-extrabold text-slate-900">Local events</h1>
        <Link href="/admin" className="text-sm font-bold text-slate-700 hover:text-slate-900">← Admin</Link>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8 space-y-8">
        <section>
          <p className="text-sm text-slate-600 max-w-3xl">
            Council, venue and tourist-board “what’s on” sites, read automatically and shown on each city page as <b>What’s on locally</b>.
            <b> Refresh</b> reads new and due pages and removes events a site has dropped or cancelled. <b>Clean</b> re-checks every event already on the site against its own page.
            Removal mode is <b>{mode}</b> (up to {cap} per source per run; a site where most events vanish at once is treated as “site changed” and nothing is removed). The same sweep runs automatically every two hours.
          </p>
          <p className="text-sm text-slate-500 mt-2">{total.toLocaleString('en-GB')} upcoming local events across {withSource.size} of {CITIES.length} cities have a source.</p>
          <div className="mt-3"><RunAll /></div>
        </section>

        <section className="bg-white border border-slate-200 rounded-2xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-slate-500 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3">City</th>
                <th className="px-4 py-3">Source</th>
                <th className="px-4 py-3 text-right">Upcoming</th>
                <th className="px-4 py-3">Last run</th>
                <th className="px-4 py-3">Last result</th>
                <th className="px-4 py-3">Do</th>
              </tr>
            </thead>
            <tbody>
              {CITIES.map(city => {
                const mine = sources.filter(s => s.city === city.name)
                const count = perCity.get(city.name.toLowerCase()) ?? 0
                return (
                  <tr key={city.name} className="border-b border-slate-100 align-top">
                    <td className="px-4 py-3 font-bold text-slate-900 whitespace-nowrap">{city.name}</td>
                    <td className="px-4 py-3">
                      {mine.length === 0 && <span className="text-amber-700">No source yet</span>}
                      {mine.map(s => (
                        <div key={s.key} className={s.enabled ? '' : 'opacity-50'}>
                          <a href={s.base_url} target="_blank" rel="noreferrer" className="text-slate-800 hover:underline">{s.label}</a>
                          <span className="text-xs text-slate-400"> · {s.discovery}</span>
                        </div>
                      ))}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{count.toLocaleString('en-GB')}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-slate-600">
                      {mine.length ? ago(mine.map(s => s.last_run_at).filter(Boolean).sort().slice(-1)[0] ?? null) : '—'}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600">
                      {mine.map(s => {
                        const st = s.last_stats
                        if (!st) return <div key={s.key}>not run yet</div>
                        return (
                          <div key={s.key} className="mb-1">
                            {st.action === 'clean'
                              ? `cleaned: ${st.fetched} checked, ${st.cancelled} removed${st.gone > st.cancelled ? ` (${st.gone - st.cancelled} flagged, not removed)` : ''}`
                              : `${st.discovered.toLocaleString('en-GB')} listed, ${st.events} saved, ${st.duplicates} already ticketed${st.unseenLeft ? `, ${st.unseenLeft.toLocaleString('en-GB')} still to read` : ''}${st.cancelled ? `, ${st.cancelled} removed` : ''}${st.errors ? `, ${st.errors} unreadable` : ''}`}
                            {st.detail && <div className="text-amber-700">{st.detail}</div>}
                          </div>
                        )
                      })}
                    </td>
                    <td className="px-4 py-3">{mine.length > 0 ? <CityActions city={city.name} /> : <span className="text-xs text-slate-400">add one below</span>}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </section>

        <section>
          <h2 className="text-lg font-extrabold text-slate-900 mb-1">Add a source</h2>
          <p className="text-sm text-slate-500 mb-3 max-w-3xl">
            Works for any site that puts schema.org Event markup on each event page, found through its sitemap or a “what’s on” listing. Test it first: it reads six real pages and shows what it would save. It is only saved if events can be read.
          </p>
          <AddSource cities={CITIES.map(c => c.name)} />
        </section>
      </main>
    </div>
  )
}
