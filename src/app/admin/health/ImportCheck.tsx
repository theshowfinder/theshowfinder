'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { describeRun, importVerdict, type ImportCard, type ImportSourceKey } from '@/lib/importStatus'

/* eslint-disable @typescript-eslint/no-explicit-any */
async function postJson(url: string, body?: unknown): Promise<{ status: number; json: any }> {
  const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })
  const text = await res.text()
  let json: any = null
  try { json = JSON.parse(text) } catch { json = { error: text.slice(0, 300) } }
  return { status: res.status, json }
}

interface StepResult { ok: boolean; text: string }

async function runJob(job: string): Promise<StepResult> {
  try {
    const { status, json } = await postJson('/api/admin/run-job', { job })
    const http = json?.httpStatus
    const body = json?.body
    if (status !== 200 || (http && http >= 400) || body?.success === false) {
      return { ok: false, text: `Failed (HTTP ${http ?? status})${body?.error ? `: ${String(body.error).slice(0, 200)}` : json?.error ? `: ${json.error}` : ''}` }
    }
    return { ok: true, text: describeRun(job, body) }
  } catch (e) {
    return { ok: false, text: `Request failed: ${e instanceof Error ? e.message : String(e)}` }
  }
}

/** Matching works in slices of ~1,500 rows: press again (done here automatically) until it reports nothing left. */
async function runMatching(job: string, maxParts = 12): Promise<StepResult> {
  let totalChecked = 0
  for (let part = 1; part <= maxParts; part++) {
    try {
      const { status, json } = await postJson('/api/admin/run-job', { job })
      const http = json?.httpStatus
      const body = json?.body
      if (status !== 200 || (http && http >= 400) || body?.success === false) {
        return { ok: false, text: `Failed on part ${part} (HTTP ${http ?? status})${body?.error ? `: ${String(body.error).slice(0, 200)}` : json?.error ? `: ${json.error}` : ''}${totalChecked ? ` · ${totalChecked} rows done before that` : ''}` }
      }
      totalChecked += body?.matching?.checked ?? 0
      if (!body?.matching?.incomplete) return { ok: true, text: `${describeRun(job, body)}${part > 1 ? ` (${part} parts)` : ''}` }
      if (body?.matching?.stalledBatch) return { ok: false, text: `A batch of database writes stalled on part ${part}. ${totalChecked} rows done so far; run again to continue.` }
    } catch (e) {
      return { ok: false, text: `Request failed: ${e instanceof Error ? e.message : String(e)}` }
    }
  }
  return { ok: false, text: `Still more to match after ${maxParts} parts (${totalChecked} rows done). Run again to finish.` }
}

/** Sweeps work in slices: press again until the lap and the dead-event check both report done. */
async function runSweep(job: string, endpoint: string, forceFirst: boolean, maxPresses = 6): Promise<StepResult> {
  let last: any = null
  for (let i = 1; i <= maxPresses; i++) {
    try {
      const body = job === 'sync-gigsberg-sweep' ? { force: forceFirst && i === 1 } : undefined
      const { status, json } = await postJson(endpoint, body)
      if (status !== 200) return { ok: false, text: `Failed (HTTP ${status}): ${json?.error ?? 'no detail'}` }
      last = json
      const sweep = json?.sweep
      const verify = json?.verify
      if (sweep?.status === 'rate_limited') return { ok: false, text: 'Rate-limited by the source. Wait a few minutes and run again.' }
      if (sweep?.status === 'busy') return { ok: false, text: 'Another run is still going. Wait a minute and run again.' }
      if (sweep?.status === 'disabled') return { ok: false, text: 'The sweep is switched off.' }
      const sweepDone = sweep?.status === 'complete' || sweep?.status === 'idle'
      const verifyDone = verify ? verify.status === 'done' || verify.status === 'skipped' : true
      if (sweepDone && verifyDone) return { ok: true, text: describeRun(job, last) }
    } catch (e) {
      return { ok: false, text: `Request failed: ${e instanceof Error ? e.message : String(e)}` }
    }
  }
  return { ok: false, text: `Still going after ${maxPresses} presses. Run again to finish. So far: ${describeRun(job, last)}` }
}

const STEPS: Record<ImportSourceKey, Array<{ label: string; run: () => Promise<StepResult> }>> = {
  ticketmaster: [
    { label: 'National sweep', run: () => runSweep('sync-ticketmaster-sweep', '/api/cron/sync-ticketmaster-sweep', false) },
    { label: 'On-sale / presale', run: () => runJob('sync-onsale') },
  ],
  see_tickets: [
    { label: 'Feed download', run: () => runJob('sync-see-tickets') },
    { label: 'Linking to events', run: () => runMatching('match-see-tickets') },
  ],
  gigsberg: [
    { label: 'UK sweep', run: () => runSweep('sync-gigsberg-sweep', '/api/cron/sync-gigsberg-sweep', true) },
    { label: 'Linking to events', run: () => runJob('match-gigsberg') },
    { label: 'Prices and listings', run: () => runJob('sync-gigsberg') },
  ],
  council: [{ label: 'Council sync', run: () => runJob('sync-council-events') }],
  news: [{ label: 'News sync', run: () => runJob('sync-city-news') }],
}

const GO_LIVE_WARNING: Record<string, string> = {
  ticketmaster: 'Live: the sweep saves changes and removes events Ticketmaster confirms are gone (capped per run).',
  gigsberg: 'Live: the sweep saves the Gigsberg catalogue (new and changed shows) and marks shows Gigsberg confirms are gone (capped per run).',
  see_tickets: 'Live: besides importing, the feed marks rows still listed as seen, and flags rows missing for about two nights in a row (capped, skipped if the feed looks incomplete).',
  council: 'Live: events the council site confirms are gone or cancelled are cancelled on our site (capped per run).',
}

const STATE_STYLE: Record<ImportCard['state'], { box: string; badge: string; label: string }> = {
  done:    { box: 'border-emerald-300 bg-emerald-50', badge: 'bg-emerald-600 text-white', label: 'DONE' },
  failed:  { box: 'border-red-300 bg-red-50',         badge: 'bg-red-600 text-white',     label: 'FAILED' },
  stale:   { box: 'border-amber-300 bg-amber-50',     badge: 'bg-amber-500 text-white',   label: 'NOT DONE' },
  running: { box: 'border-blue-300 bg-blue-50',       badge: 'bg-blue-600 text-white',    label: 'RUNNING' },
  off:     { box: 'border-slate-300 bg-slate-100',    badge: 'bg-slate-500 text-white',   label: 'OFF' },
}
const JOB_ICON = { ok: '✓', failed: '✗', overdue: '!', never: '○', running: '◔' } as const
const JOB_COLOUR = { ok: 'text-emerald-600', failed: 'text-red-600', overdue: 'text-amber-600', never: 'text-slate-400', running: 'text-blue-600' } as const

function ago(iso: string | null): string {
  if (!iso) return 'never'
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60_000)
  if (mins < 2) return 'just now'
  if (mins < 60) return `${mins} min ago`
  if (mins < 48 * 60) return `${Math.round(mins / 60)}h ago`
  return `${Math.round(mins / 1440)} days ago`
}

export default function ImportCheck({ cards }: { cards: ImportCard[] }) {
  const router = useRouter()
  const [running, setRunning] = useState<ImportSourceKey | 'all' | null>(null)
  const [logs, setLogs] = useState<Partial<Record<ImportSourceKey, Array<{ label: string; state: 'run' | 'ok' | 'fail'; text: string }>>>>({})
  const verdict = importVerdict(cards)

  async function runSource(key: ImportSourceKey) {
    const steps = STEPS[key]
    setLogs(l => ({ ...l, [key]: steps.map(s => ({ label: s.label, state: 'run' as const, text: 'waiting' })) }))
    for (let i = 0; i < steps.length; i++) {
      setLogs(l => ({ ...l, [key]: (l[key] ?? []).map((x, n) => (n === i ? { ...x, text: 'running… this can take a few minutes' } : x)) }))
      const r = await steps[i].run()
      setLogs(l => ({ ...l, [key]: (l[key] ?? []).map((x, n) => (n === i ? { ...x, state: r.ok ? 'ok' : 'fail', text: r.text } : x)) }))
    }
  }

  async function runOne(key: ImportSourceKey) {
    setRunning(key)
    await runSource(key)
    setRunning(null)
    router.refresh()
  }

  async function runAll() {
    setRunning('all')
    for (const c of cards) if (c.state !== 'off') await runSource(c.key)
    setRunning(null)
    router.refresh()
  }

  async function setMode(key: ImportSourceKey, mode: 'live' | 'dry') {
    if (mode === 'live' && !window.confirm(`${GO_LIVE_WARNING[key] ?? 'Switch to live?'}\n\nSwitch ${key.replace('_', ' ')} to LIVE?`)) return
    const { status, json } = await postJson('/api/admin/import-mode', { source: key, mode })
    if (status !== 200) window.alert(`Could not change the mode: ${json?.error ?? status}`)
    router.refresh()
  }

  return (
    <div>
      <div className={`rounded-2xl border p-4 mb-4 flex flex-wrap items-center gap-3 justify-between ${verdict.ok ? 'bg-emerald-50 border-emerald-300' : 'bg-red-50 border-red-300'}`}>
        <p className="font-extrabold text-slate-900">{verdict.ok ? '✓ ' : '✗ '}{verdict.line}</p>
        <button type="button" disabled={running !== null} onClick={runAll} className="font-bold text-white px-5 py-2.5 rounded-lg text-sm disabled:opacity-60 disabled:cursor-wait" style={{ backgroundColor: '#0F766E' }}>
          {running === 'all' ? 'Running every import… keep this tab open' : 'Run every import now'}
        </button>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {cards.map(c => {
          const st = STATE_STYLE[c.state]
          const log = logs[c.key]
          return (
            <div key={c.key} className={`rounded-2xl border p-4 ${st.box}`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-extrabold text-slate-900 text-lg leading-tight">{c.label}</h3>
                  <p className="text-xs text-slate-500">{c.what}</p>
                </div>
                <span className={`text-xs font-extrabold px-2.5 py-1 rounded-full ${st.badge}`}>{st.label}</span>
              </div>
              <p className="text-sm font-semibold text-slate-800 mt-2">{c.headline}</p>

              <ul className="mt-2 space-y-1.5 text-sm">
                {c.jobs.map(j => (
                  <li key={j.job} className="flex gap-2">
                    <span className={`font-bold w-4 text-center ${JOB_COLOUR[j.state]}`}>{JOB_ICON[j.state]}</span>
                    <span className="text-slate-800">
                      <b>{j.label}</b> <span className="text-slate-500">· last OK {ago(j.lastOkAt)}</span>
                      <span className="block text-xs text-slate-600">{j.outcome}</span>
                    </span>
                  </li>
                ))}
              </ul>

              <p className="text-xs text-slate-500 mt-2">{c.proofLabel}: <b>{ago(c.proofAt)}</b></p>
              {c.notes.map(n => <p key={n} className="text-xs text-amber-800 mt-1">{n}</p>)}

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button type="button" disabled={running !== null} onClick={() => runOne(c.key)} className="font-bold text-white px-4 py-2 rounded-lg text-sm disabled:opacity-60 disabled:cursor-wait" style={{ backgroundColor: '#334155' }}>
                  {running === c.key ? 'Running…' : `Run ${c.label} now`}
                </button>
                {c.hasMode && c.mode && (
                  <>
                    <span className="text-xs font-bold text-slate-600 border border-slate-300 rounded-full px-2.5 py-1">mode: {c.mode.toUpperCase()}</span>
                    {c.mode !== 'live'
                      ? <button type="button" disabled={running !== null} onClick={() => setMode(c.key, 'live')} className="text-sm font-bold text-white px-3 py-2 rounded-lg disabled:opacity-60" style={{ backgroundColor: '#B45309' }}>Go live</button>
                      : <button type="button" disabled={running !== null} onClick={() => setMode(c.key, 'dry')} className="text-sm font-semibold text-slate-700 border border-slate-300 rounded-lg px-3 py-2 disabled:opacity-60">Pause (dry)</button>}
                  </>
                )}
              </div>

              {log && (
                <ul className="mt-3 space-y-1 text-xs border-t border-slate-300/60 pt-2">
                  {log.map(l => (
                    <li key={l.label} className={l.state === 'fail' ? 'text-red-700' : l.state === 'ok' ? 'text-emerald-800' : 'text-slate-600'}>
                      <b>{l.state === 'ok' ? '✓' : l.state === 'fail' ? '✗' : '◔'} {l.label}:</b> {l.text}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
