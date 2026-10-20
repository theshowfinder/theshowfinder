'use client'

import { useRef, useState } from 'react'

type StepState = 'wait' | 'run' | 'ok' | 'warn' | 'fail'
interface Step { key: string; label: string; state: StepState; detail: string }
interface Problem { url: string; status: number | string; note?: string }
type Report = Record<string, number>

const JOBS: Array<{ job: string; label: string }> = [
  { job: 'sync-see-tickets', label: 'See Tickets feed' },
  { job: 'sync-council-events', label: 'Council events' },
  { job: 'match-gigsberg', label: 'Gigsberg matching' },
  { job: 'match-see-tickets', label: 'See Tickets matching' },
  { job: 'refresh-listings', label: 'Refresh listings' },
]

const INITIAL: Step[] = [
  { key: 'tm', label: 'Ticketmaster sweep (full lap + dead-event check)', state: 'wait', detail: '' },
  { key: 'gb', label: 'Gigsberg sweep', state: 'wait', detail: '' },
  ...JOBS.map(j => ({ key: j.job, label: j.label, state: 'wait' as StepState, detail: '' })),
  { key: 'clean', label: 'Cleanliness counts', state: 'wait', detail: '' },
  { key: 'crawl', label: 'Sitemap crawl (404s and passed events)', state: 'wait', detail: '' },
]

const ICON: Record<StepState, string> = { wait: '○', run: '◔', ok: '✓', warn: '!', fail: '✗' }
const COLOUR: Record<StepState, string> = { wait: 'text-slate-400', run: 'text-blue-600', ok: 'text-emerald-600', warn: 'text-amber-600', fail: 'text-red-600' }

async function postJson(url: string, body?: unknown): Promise<{ status: number; json: any }> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })
  const text = await res.text()
  let json: any = null // eslint-disable-line @typescript-eslint/no-explicit-any
  try { json = JSON.parse(text) } catch { json = { error: text.slice(0, 300) } }
  return { status: res.status, json }
}

// One crawl batch, retried: a dropped connection ("Load failed" in Safari, a deploy swapping the
// server mid-crawl, the Mac napping) used to abort the whole 18k-URL crawl.
async function postBatchWithRetry(url: string, body: unknown, attempts = 4): Promise<{ status: number; json: any } | null> { // eslint-disable-line @typescript-eslint/no-explicit-any
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const res = await postJson(url, body)
      if (res.status === 200) return res
      if (res.status === 401 || res.status === 403) return res            // not a blip: stop at once
    } catch { /* network drop: retry */ }
    if (attempt < attempts) await new Promise(r => setTimeout(r, 2000 * attempt))
  }
  return null
}

export default function MorningCleanup() {
  const [steps, setSteps] = useState<Step[]>(INITIAL)
  const [running, setRunning] = useState(false)
  const [verdict, setVerdict] = useState<{ clean: boolean; reasons: string[] } | null>(null)
  const [problems, setProblems] = useState<Problem[]>([])
  const [skipCrawl, setSkipCrawl] = useState(false)
  const stop = useRef(false)

  function set(key: string, state: StepState, detail = '') {
    setSteps(prev => prev.map(s => (s.key === key ? { ...s, state, detail } : s)))
  }

  async function runSweepUntilDone(key: string, endpoint: string, body: unknown, maxPresses: number) {
    let verifyOk = false
    for (let i = 1; i <= maxPresses; i++) {
      if (stop.current) return { ok: false, detail: 'stopped' }
      set(key, 'run', `press ${i} of up to ${maxPresses}…`)
      const { status, json } = await postJson(endpoint, i === 1 ? body : (key === 'gb' ? { force: false } : undefined))
      if (status !== 200) return { ok: false, detail: `HTTP ${status}: ${json?.error ?? 'failed'}` }
      const sweep = json?.sweep
      const verify = json?.verify
      if (sweep?.status === 'rate_limited') return { ok: false, detail: 'Ticketmaster rate-limited the run — wait a few minutes and press again' }
      if (sweep?.status === 'busy') return { ok: false, detail: 'another run is still going — wait a minute and press again' }
      if (sweep?.status === 'disabled') return { ok: true, warn: true, detail: 'sweep is switched off' }
      const sweepDone = sweep?.status === 'complete' || sweep?.status === 'idle'
      verifyOk = verify ? (verify.status === 'done' || verify.status === 'skipped') : true
      if (sweepDone && verifyOk) {
        const mode = sweep?.mode ? ` (${sweep.mode} mode)` : ''
        return { ok: true, detail: `lap complete${mode}; verify: ${verify ? `${verify.refreshed ?? 0} refreshed, ${verify.removed ?? 0} removed` : 'n/a'}` }
      }
      set(key, 'run', `press ${i}: sweep ${sweep?.status ?? '?'}, verify ${verify?.status ?? 'n/a'}${verify ? ` (${verify.candidates ?? 0} candidates)` : ''}`)
    }
    return { ok: false, detail: `still going after ${maxPresses} presses — run again to finish` }
  }

  async function runAll() {
    stop.current = false
    setRunning(true)
    setVerdict(null)
    setProblems([])
    setSteps(INITIAL)
    const reasons: string[] = []

    // 1 + 2: sweeps
    const tm = await runSweepUntilDone('tm', '/api/cron/sync-ticketmaster-sweep', undefined, 15)
    set('tm', tm.ok ? ((tm as { warn?: boolean }).warn ? 'warn' : 'ok') : 'fail', tm.detail)
    if (!tm.ok) reasons.push(`Ticketmaster sweep: ${tm.detail}`)

    const gb = await runSweepUntilDone('gb', '/api/cron/sync-gigsberg-sweep', { force: true }, 4)
    set('gb', gb.ok ? ((gb as { warn?: boolean }).warn ? 'warn' : 'ok') : 'fail', gb.detail)
    if (!gb.ok) reasons.push(`Gigsberg sweep: ${gb.detail}`)

    // 3: jobs, refresh-listings last
    for (const { job, label } of JOBS) {
      if (stop.current) break
      set(job, 'run', 'running…')
      try {
        const { status, json } = await postJson('/api/admin/run-job', { job })
        const http = json?.httpStatus
        if (status !== 200 || (http && http >= 400)) {
          const msg = `HTTP ${http ?? status}${json?.body?.error ? `: ${json.body.error}` : ''}`
          set(job, 'fail', msg)
          reasons.push(`${label}: ${msg}`)
        } else {
          set(job, 'ok', `${Math.round((json?.ms ?? 0) / 1000)}s`)
        }
      } catch (e) {
        set(job, 'fail', e instanceof Error ? e.message : String(e))
        reasons.push(`${label}: request failed`)
      }
    }

    // 4: counts
    let report: Report | null = null
    try {
      const res = await fetch('/api/admin/cleanliness', { cache: 'no-store' })
      const json = await res.json()
      report = json.report as Report
      if (!res.ok || !report) throw new Error(json.error ?? `HTTP ${res.status}`)
      const tmFuture = Math.max(report.tm_future_events || 1, 1)
      const share = report.tm_not_refreshed_48h / tmFuture
      const hard: Array<[string, number]> = [
        ['links to listings that are gone (Gigsberg)', report.gigsberg_links_to_gone_listings],
        ['links to listings that are gone (See Tickets)', report.see_tickets_links_to_gone_listings],
        ['live pages whose listing is gone', report.catalogue_pages_live_but_listing_gone],
        ['live events with no way to buy', report.live_events_with_no_way_to_buy],
        ['council events not refreshed in 48h', report.other_source_not_refreshed_48h],
      ]
      const bad = hard.filter(([, n]) => n > 0)
      const warnBits: string[] = []
      if (share > 0.01) bad.push([`Ticketmaster events not refreshed in 48h (${(share * 100).toFixed(1)}%)`, report.tm_not_refreshed_48h])
      if (report.gigsberg_rows_unseen_48h > 0) warnBits.push(`${report.gigsberg_rows_unseen_48h} Gigsberg rows unseen 48h`)
      if (report.see_tickets_rows_unseen_48h > 0) warnBits.push(`${report.see_tickets_rows_unseen_48h} See Tickets rows unseen 48h`)
      bad.forEach(([label, n]) => reasons.push(`${n} ${label}`))
      set('clean', bad.length ? 'fail' : warnBits.length ? 'warn' : 'ok',
        `${report.live_future_events} live future events · TM stale ${report.tm_not_refreshed_48h}/${report.tm_future_events}${warnBits.length ? ' · ' + warnBits.join(', ') + ' (clears once those sweeps run live)' : ''}`)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      set('clean', 'fail', msg)
      reasons.push(`Cleanliness counts failed: ${msg}`)
    }

    // 5: crawl
    let crawled = false
    if (skipCrawl || stop.current) {
      set('crawl', 'warn', 'skipped')
      reasons.push('Sitemap crawl was skipped, so 404s are unchecked')
    } else {
      try {
        set('crawl', 'run', 'reading sitemap…')
        const list = await fetch('/api/admin/site-check', { cache: 'no-store' })
        const listJson = await list.json()
        if (!list.ok) throw new Error(listJson.error ?? `HTTP ${list.status}`)
        const urls: string[] = listJson.urls
        const found: Problem[] = []
        let unchecked = 0
        const BATCH = 150
        for (let i = 0; i < urls.length; i += BATCH) {
          if (stop.current) break
          set('crawl', 'run', `checked ${Math.min(i, urls.length)} of ${urls.length}… ${found.length} problem${found.length === 1 ? '' : 's'} so far${unchecked ? `, ${unchecked} could not be reached` : ''}`)
          const res = await postBatchWithRetry('/api/admin/site-check', { urls: urls.slice(i, i + BATCH) })
          if (res && (res.status === 401 || res.status === 403)) throw new Error(`HTTP ${res.status}: admin session expired, log in again`)
          if (!res) { unchecked += urls.slice(i, i + BATCH).length; continue }   // keep going, report it at the end
          found.push(...(res.json.problems as Problem[]))
          setProblems([...found])
        }
        crawled = !stop.current
        set('crawl', found.length ? 'fail' : unchecked ? 'warn' : crawled ? 'ok' : 'warn', `${urls.length - unchecked} of ${urls.length} URLs checked · ${found.length} problem${found.length === 1 ? '' : 's'}${unchecked ? ` · ${unchecked} could not be reached after retries` : ''}`)
        if (unchecked) reasons.push(`${unchecked} sitemap URLs could not be checked (connection kept dropping); run the crawl again`)
        if (found.length) reasons.push(`${found.length} sitemap URL${found.length === 1 ? '' : 's'} not returning a clean 200 (listed below)`)
        if (!crawled) reasons.push('Sitemap crawl was stopped before it finished')
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        set('crawl', 'fail', msg)
        reasons.push(`Sitemap crawl failed: ${msg}`)
      }
    }

    setVerdict({ clean: reasons.length === 0, reasons })
    setRunning(false)
  }

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5">
      <div className="flex flex-wrap items-center gap-3 mb-3">
        <button type="button" disabled={running} onClick={runAll} className="font-bold text-white px-5 py-2.5 rounded-lg text-sm disabled:opacity-70 disabled:cursor-wait" style={{ backgroundColor: '#0F766E' }}>
          {running ? 'Cleaning up… keep this tab open' : 'Run morning clean-up'}
        </button>
        {running && <button type="button" onClick={() => { stop.current = true }} className="text-sm font-semibold text-slate-600 border border-slate-300 rounded-lg px-3 py-2">Stop after this step</button>}
        <label className="text-xs text-slate-500 flex items-center gap-1.5">
          <input type="checkbox" checked={skipCrawl} disabled={running} onChange={e => setSkipCrawl(e.target.checked)} /> skip the sitemap crawl
        </label>
      </div>
      <p className="text-xs text-slate-500 mb-3">Runs every sweep in order (each obeys its own off / dry / live mode), then counts anything stale, then requests every page in the sitemap looking for 404s and “This event has passed” pages. Takes roughly 10–25 minutes; keep the tab open.</p>

      <ul className="space-y-1.5 text-sm">
        {steps.map(s => (
          <li key={s.key} className="flex gap-2">
            <span className={`font-bold w-4 text-center ${COLOUR[s.state]}`}>{ICON[s.state]}</span>
            <span className="text-slate-800">{s.label}{s.detail && <span className="text-slate-500"> — {s.detail}</span>}</span>
          </li>
        ))}
      </ul>

      {verdict && (
        <div className={`mt-4 rounded-xl border p-4 ${verdict.clean ? 'bg-emerald-50 border-emerald-300' : 'bg-red-50 border-red-300'}`}>
          <p className="font-extrabold text-slate-900">{verdict.clean ? 'CLEAN — no dead events, no stale links, no 404s found.' : 'NOT CLEAN'}</p>
          {verdict.reasons.length > 0 && <ul className="list-disc pl-5 mt-1 text-sm text-slate-800 space-y-0.5">{verdict.reasons.map((r, i) => <li key={i}>{r}</li>)}</ul>}
        </div>
      )}

      {problems.length > 0 && (
        <div className="mt-3 max-h-80 overflow-auto rounded-xl bg-slate-900 text-slate-100 text-xs p-3 space-y-1">
          {problems.map((p, i) => <div key={i}><b>{p.status}</b> {p.url}{p.note ? ` — ${p.note}` : ''}</div>)}
        </div>
      )}
    </div>
  )
}
