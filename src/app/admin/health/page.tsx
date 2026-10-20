export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { requireAdmin } from '@/lib/admin-auth'
import { loadHealthSnapshot } from '@/lib/healthSnapshot'
import { stalenessSummary } from '@/lib/jobHealth'
import { createAdminClient } from '@/lib/supabase/admin'
import RunSweepButton from './RunSweepButton'
import RunJobButtons from './RunJobButtons'
import MorningCleanup from './MorningCleanup'
import ImportCheck from './ImportCheck'
import { loadImportCards } from '@/lib/importCheck'

function ago(iso: string | null, now: Date): string {
  if (!iso) return 'never'
  const mins = Math.round((now.getTime() - new Date(iso).getTime()) / 60_000)
  if (mins < 60) return `${mins}m ago`
  if (mins < 48 * 60) return `${Math.round(mins / 60)}h ago`
  return `${Math.round(mins / 1440)}d ago`
}

const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : '0%')

export default async function HealthPage() {
  await requireAdmin()
  const [snap, importCards] = await Promise.all([loadHealthSnapshot(), loadImportCards()])
  const { data: sweepState } = await createAdminClient().from('tm_sweep_state').select('mode, last_stats').eq('id', 1).maybeSingle()
  const sweepMode = (sweepState as { mode?: string } | null)?.mode ?? 'unknown'
  const { data: gigState } = await createAdminClient().from('gigsberg_sweep_state' as never).select('mode').eq('id', 1).maybeSingle()
  const gigsbergMode = (gigState as { mode?: string } | null)?.mode ?? 'unknown'
  const { data: stState } = await createAdminClient().from('see_tickets_sweep_state' as never).select('mode, last_stats').eq('id', 1).maybeSingle()
  const seeTicketsMode = (stState as { mode?: string } | null)?.mode ?? 'unknown'
  const { data: councilState } = await createAdminClient().from('council_sync_state' as never).select('mode, last_stats').eq('id', 1).maybeSingle()
  const councilMode = (councilState as { mode?: string } | null)?.mode ?? 'unknown'
  const councilLast = (councilState as { last_stats?: Record<string, unknown> } | null)?.last_stats ?? null
  const seeTicketsLast = (stState as { last_stats?: Record<string, unknown> } | null)?.last_stats ?? null
  const { now, jobs, staleness, newsErrors, db, issues } = snap
  const s = stalenessSummary(staleness)
  const monitored = snap.monitoringSince ? ago(snap.monitoringSince.toISOString(), now) : 'not started'

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
        <h1 className="text-xl font-extrabold text-slate-900">Site health</h1>
        <Link href="/admin" className="text-sm text-slate-500 hover:text-slate-700">← Admin</Link>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8 space-y-8">
        <section className={`rounded-2xl border p-5 ${issues.length ? 'bg-red-50 border-red-200' : 'bg-emerald-50 border-emerald-200'}`}>
          <h2 className="font-extrabold text-slate-900 mb-2">{issues.length ? `${issues.length} thing${issues.length === 1 ? '' : 's'} need attention` : 'Nothing needs attention'}</h2>
          {issues.length > 0 && (
            <ul className="text-sm text-slate-800 space-y-1 list-disc pl-5">
              {issues.map(i => <li key={i.key}>{i.severity === 'high' ? <b>HIGH · </b> : null}{i.message}</li>)}
            </ul>
          )}
          <p className="text-xs text-slate-500 mt-3">Job history started {monitored}. Alerts email ALERT_EMAIL (default hello@theshowfinder.com) three times a day, only when something new is wrong or has been open for 3 days.</p>
        </section>

        <section>
          <h2 className="text-lg font-extrabold text-slate-900 mb-1">Morning import check</h2>
          <p className="text-sm text-slate-500 mb-3">Every source we import from, confirmed against the imported data itself (not just “the job said OK”). Each card has its own Run now button and shows what the run actually did. Imports also run automatically every day; this proves they did.</p>
          <ImportCheck cards={importCards} />
        </section>

        <section>
          <h2 className="text-lg font-extrabold text-slate-900 mb-1">Morning clean-up</h2>
          <p className="text-sm text-slate-500 mb-3">One button: runs every sweep, then proves the site is clean or tells you exactly what is not.</p>
          <MorningCleanup />
        </section>

        <section>
          <h2 className="text-lg font-extrabold text-slate-900 mb-3">Scheduled jobs</h2>
          <div className="bg-white border border-slate-200 rounded-2xl overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wider text-slate-500 border-b border-slate-100">
                <tr><th className="p-3">Job</th><th className="p-3">Last run</th><th className="p-3">Last success</th><th className="p-3">Result</th><th className="p-3">Failures 24h</th></tr>
              </thead>
              <tbody>
                {jobs.map(j => (
                  <tr key={j.job} className="border-b border-slate-50 align-top">
                    <td className="p-3 font-semibold text-slate-900">{j.label}<div className="text-xs font-normal text-slate-400">{j.job}</div></td>
                    <td className="p-3 text-slate-600">{ago(j.lastRunAt, now)}</td>
                    <td className="p-3 text-slate-600">{ago(j.lastSuccessAt, now)}</td>
                    <td className="p-3">
                      {j.issue ? <span className="text-red-700 font-bold">{j.issue === 'failing' ? 'Failing' : j.issue === 'overdue' ? 'Overdue' : 'No run'}</span> : j.lastStatus === 'none' ? <span className="text-slate-400">waiting</span> : <span className="text-emerald-700 font-bold">OK</span>}
                      {j.lastError && <div className="text-xs text-red-600 max-w-xs break-words">{j.lastError.slice(0, 160)}</div>}
                    </td>
                    <td className="p-3 text-slate-600">{j.failuresLast24h}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section>
          <h2 className="text-lg font-extrabold text-slate-900 mb-1">Ticketmaster sweep</h2>
          <p className="text-sm text-slate-500 mb-3">Mode is <b>{sweepMode}</b> (off = does nothing, dry = fetches and counts but writes nothing, live = updates and removes). The scheduled runs do the same thing as this button.</p>
          <RunSweepButton mode={sweepMode} />
        </section>

        <section>
          <h2 className="text-lg font-extrabold text-slate-900 mb-1">Gigsberg sweep</h2>
          <p className="text-sm text-slate-500 mb-3">Walks every UK city on Gigsberg in one run, stamps each catalogue row it sees, then checks anything it did not see and flags only events Gigsberg confirms are gone. Mode is <b>{gigsbergMode}</b> (off / dry / live, same meaning as above). The button starts a fresh lap even if one just finished.</p>
          <RunSweepButton mode={gigsbergMode} endpoint="/api/cron/sync-gigsberg-sweep" name="Gigsberg" forceNewLap />
        </section>

        <section>
          <h2 className="text-lg font-extrabold text-slate-900 mb-1">See Tickets feed sweep</h2>
          <p className="text-sm text-slate-500 mb-3">The feed is downloaded whole each night. Mode is <b>{seeTicketsMode}</b>: off = import only; dry = import as normal and report what live would do; live = also marks every row the feed still lists as seen, and flags rows missing for about two nights in a row (capped per run, and skipped if the feed looks incomplete). Use “Run See Tickets feed” above to test it.</p>
          {seeTicketsLast && <pre className="text-xs bg-slate-900 text-slate-100 rounded-xl p-4 overflow-x-auto whitespace-pre-wrap">{JSON.stringify(seeTicketsLast, null, 2)}</pre>}
        </section>

        <section>
          <h2 className="text-lg font-extrabold text-slate-900 mb-1">Council events (Derby)</h2>
          <p className="text-sm text-slate-500 mb-3">Every council event the sync sees is now stamped as refreshed. Events the council site stops listing are checked on their own page; only a 404/410 or a “cancelled” marker counts. Mode is <b>{councilMode}</b>: dry reports what it would cancel, live cancels it (capped per run, and skipped if any listing could not be read in full). Use “Run Council events” above to test it.</p>
          {councilLast && <pre className="text-xs bg-slate-900 text-slate-100 rounded-xl p-4 overflow-x-auto whitespace-pre-wrap">{JSON.stringify(councilLast, null, 2)}</pre>}
        </section>

        <section>
          <h2 className="text-lg font-extrabold text-slate-900 mb-1">Run a job now</h2>
          <p className="text-sm text-slate-500 mb-3">Runs the real scheduled job straight away (it appears in the job table above like any other run), so a fix can be tested without waiting for its cron slot.</p>
          <RunJobButtons />
        </section>

        <section>
          <h2 className="text-lg font-extrabold text-slate-900 mb-1">Listing freshness (future events)</h2>
          <p className="text-sm text-slate-500 mb-3">
            {s.total.toLocaleString('en-GB')} future events; {pct(s.stale30, s.total)} not refreshed from Ticketmaster in 30+ days, {pct(s.stale60, s.total)} in 60+ days.
          </p>
          <div className="bg-white border border-slate-200 rounded-2xl overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wider text-slate-500 border-b border-slate-100">
                <tr><th className="p-3">City</th><th className="p-3">Ticketmaster events</th><th className="p-3">14d+ stale</th><th className="p-3">30d+ stale</th><th className="p-3">60d+ stale</th></tr>
              </thead>
              <tbody>
                {staleness.slice(0, 40).map(c => (
                  <tr key={c.city} className="border-b border-slate-50">
                    <td className="p-3 font-semibold text-slate-900">{c.city}</td>
                    <td className="p-3">{c.future_events.toLocaleString('en-GB')}</td>
                    <td className="p-3">{pct(c.stale_14d, c.future_events)}</td>
                    <td className="p-3">{pct(c.stale_30d, c.future_events)}</td>
                    <td className="p-3">{pct(c.stale_60d, c.future_events)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="grid md:grid-cols-2 gap-6">
          <div className="bg-white border border-slate-200 rounded-2xl p-5">
            <h2 className="font-extrabold text-slate-900 mb-2">News sources failing (24h)</h2>
            {newsErrors.length === 0 ? <p className="text-sm text-slate-500">None.</p> : (
              <ul className="text-sm space-y-1">
                {[...new Set(newsErrors.map(e => e.city ?? 'unknown'))].map(city => (
                  <li key={city}><b>{city}</b> · {newsErrors.filter(e => (e.city ?? 'unknown') === city).length} errors<div className="text-xs text-slate-500">{(newsErrors.find(e => (e.city ?? 'unknown') === city)?.error ?? '').slice(0, 120)}</div></li>
                ))}
              </ul>
            )}
          </div>
          <div className="bg-white border border-slate-200 rounded-2xl p-5">
            <h2 className="font-extrabold text-slate-900 mb-2">Database</h2>
            {db ? (
              <ul className="text-sm space-y-1 text-slate-700">
                <li>Connections: <b>{db.connections}</b> of {db.max_connections} ({db.active_connections} active)</li>
                <li>Size: <b>{(db.db_size_bytes / 1_048_576).toFixed(0)} MB</b></li>
              </ul>
            ) : <p className="text-sm text-slate-500">Unavailable.</p>}
          </div>
        </section>
      </main>
    </div>
  )
}
