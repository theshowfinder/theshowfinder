'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { PlatformTile } from '@/lib/platformStats'

function ago(iso: string | null): string {
  if (!iso) return 'never'
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60_000)
  if (mins < 2) return 'just now'
  if (mins < 60) return `${mins} min ago`
  if (mins < 48 * 60) return `${Math.round(mins / 60)}h ago`
  return `${Math.round(mins / 1440)} days ago`
}
const TONE = { good: 'text-emerald-700', bad: 'text-red-700', warn: 'text-amber-700' } as const

export default function PlatformTiles({ tiles }: { tiles: PlatformTile[] }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState('')

  async function runImport() {
    setBusy(true)
    setResult('Importing… this can take a few minutes.')
    try {
      const res = await fetch('/api/cron/import-feed-events', { method: 'POST' })
      const json = await res.json().catch(() => null)
      if (!res.ok || json?.success === false) setResult(`Failed (HTTP ${res.status}): ${json?.error ?? 'no detail'}`)
      else {
        const line = (name: string, s: { eligible: number; wouldImport: number; imported: number; errors: number; skipped: Record<string, number> }) =>
          `${name}: ${s.eligible} eligible${json.mode === 'live' ? `, ${s.imported} imported` : `, ${s.wouldImport} would be imported`}, skipped ${Object.entries(s.skipped).map(([k, v]) => `${v} ${k.replace(/_/g, ' ')}`).join(', ') || 'none'}${s.errors ? `, ${s.errors} errors` : ''}`
        setResult(`${json.mode.toUpperCase()} mode${json.status === 'partial' ? ' (partial: run again for more)' : ''}\n${line('Gigsberg', json.gigsberg)}\n${line('See Tickets', json.see_tickets)}`)
      }
    } catch (e) {
      setResult(`Request failed: ${e instanceof Error ? e.message : String(e)}`)
    }
    setBusy(false)
    router.refresh()
  }

  async function setMode(mode: 'live' | 'dry') {
    if (mode === 'live' && !window.confirm('Live: each run creates new event pages for Gigsberg / See Tickets shows we do not have (capped per run). A show already on the site (same day, same city, similar title or venue) is never imported again, packages are skipped, and Gigsberg shows are re-checked for tickets right before publishing.\n\nSwitch the feed import to LIVE?')) return
    const res = await fetch('/api/admin/import-mode', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ source: 'feed_import', mode }) })
    if (!res.ok) window.alert('Could not change the mode')
    router.refresh()
  }

  const mode = tiles.find(t => t.lastImport)?.lastImport?.mode ?? 'dry'

  return (
    <div>
      <div className="grid md:grid-cols-2 gap-4">
        {tiles.map(t => (
          <div key={t.key} className="bg-white border border-slate-200 rounded-2xl p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-extrabold text-slate-900 text-lg leading-tight">{t.label}</h3>
                <p className="text-xs text-slate-500">{t.blurb}</p>
              </div>
              <div className="flex flex-col items-end gap-1">
                <Link href={`/admin/platforms/${t.key}`} className="text-xs font-bold text-blue-700 underline whitespace-nowrap">See all →</Link>
                {(t.key === 'gigsberg' || t.key === 'see_tickets') && <Link href={`/admin/unmatched?platform=${t.key}`} className="text-xs font-bold text-amber-800 underline whitespace-nowrap">Match the unmatched →</Link>}
                {t.key === 'ticketmaster' && <Link href="/admin/unmatched?platform=gigsberg&view=soldout" className="text-xs font-bold text-amber-800 underline whitespace-nowrap">Sold-out shows needing a Gigsberg button →</Link>}
              </div>
            </div>
            <ul className="mt-3 divide-y divide-slate-100 text-sm">
              {t.metrics.map(m => (
                <li key={m.label} className="flex items-baseline justify-between gap-3 py-1.5">
                  <span className="text-slate-700">{m.label}{m.hint && <span className="text-xs text-slate-400"> · {m.hint}</span>}</span>
                  {m.view
                    ? <Link href={`/admin/platforms/${t.key}?view=${m.view}`} className={`font-extrabold tabular-nums underline decoration-dotted ${m.tone ? TONE[m.tone] : 'text-slate-900'}`}>{m.value === null ? '?' : m.value.toLocaleString('en-GB')}</Link>
                    : <span className={`font-extrabold tabular-nums ${m.tone ? TONE[m.tone] : 'text-slate-900'}`}>{m.value === null ? '?' : m.value.toLocaleString('en-GB')}</span>}
                </li>
              ))}
            </ul>
            <p className="text-xs text-slate-500 mt-2">Data last refreshed: <b>{ago(t.lastRefresh)}</b></p>
            {t.lastImport && (t.key === 'gigsberg' || t.key === 'see_tickets') && (() => {
              const b = t.lastImport![t.key]
              return b ? <p className="text-xs text-slate-500 mt-1">Last feed import ({t.lastImport.mode}, {ago(t.lastImport.at)}): {b.eligible} eligible, {t.lastImport.mode === 'live' ? `${b.imported} imported` : `${b.wouldImport} would be imported`}{b.errors ? `, ${b.errors} errors` : ''}</p> : null
            })()}
          </div>
        ))}
      </div>

      <div className="mt-4 bg-white border border-slate-200 rounded-2xl p-4">
        <h3 className="font-extrabold text-slate-900">Import shows we do not have (Gigsberg and See Tickets)</h3>
        <p className="text-xs text-slate-500 mt-1">Creates a page for any Gigsberg / See Tickets show that is not already on the site. Never makes a duplicate (same day + city + similar title or venue), skips packages and past shows, and checks Gigsberg has tickets right before publishing. Runs daily at 05:30 UTC. DRY counts what it would create and writes nothing.</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button type="button" disabled={busy} onClick={runImport} className="font-bold text-white px-4 py-2 rounded-lg text-sm disabled:opacity-60 disabled:cursor-wait" style={{ backgroundColor: '#334155' }}>{busy ? 'Running…' : 'Run feed import now'}</button>
          <span className="text-xs font-bold text-slate-600 border border-slate-300 rounded-full px-2.5 py-1">mode: {mode.toUpperCase()}</span>
          {mode !== 'live'
            ? <button type="button" disabled={busy} onClick={() => setMode('live')} className="text-sm font-bold text-white px-3 py-2 rounded-lg disabled:opacity-60" style={{ backgroundColor: '#B45309' }}>Go live</button>
            : <button type="button" disabled={busy} onClick={() => setMode('dry')} className="text-sm font-semibold text-slate-700 border border-slate-300 rounded-lg px-3 py-2 disabled:opacity-60">Pause (dry)</button>}
        </div>
        {result && <pre className="mt-3 text-xs bg-slate-900 text-slate-100 rounded-xl p-4 overflow-x-auto whitespace-pre-wrap">{result}</pre>}
      </div>
    </div>
  )
}
