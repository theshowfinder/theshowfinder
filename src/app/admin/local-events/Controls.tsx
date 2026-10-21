'use client'

import { useState } from 'react'

async function call(body: Record<string, unknown>): Promise<{ ok: boolean; text: string }> {
  try {
    const res = await fetch('/api/admin/local-events', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    const json = await res.json().catch(() => null) as Record<string, unknown> | null
    if (!res.ok || !json || json.error) return { ok: false, text: String(json?.error ?? `HTTP ${res.status}`) + (json?.probe ? '\n' + JSON.stringify(json.probe, null, 2) : '') }
    return { ok: true, text: JSON.stringify(json, null, 2) }
  } catch (e) {
    return { ok: false, text: `Request failed: ${e instanceof Error ? e.message : String(e)}` }
  }
}

function summarise(text: string): string {
  try {
    const j = JSON.parse(text) as { sources?: Array<{ label: string; events: number; fetched: number; cancelled: number; gone: number; action: string; unseenLeft: number }>; note?: string }
    if (!j.sources) return text
    const parts = j.sources.map(s => s.action === 'clean'
      ? `${s.label}: ${s.fetched} checked, ${s.cancelled} removed`
      : `${s.label}: ${s.events} saved, ${s.cancelled} removed${s.unseenLeft ? `, ${s.unseenLeft} still to read` : ''}`)
    return parts.join(' · ') + (j.note ? ` — ${j.note}` : '')
  } catch { return text }
}

export function CityActions({ city }: { city: string }) {
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState('')
  async function run(action: 'refresh' | 'clean') {
    setBusy(action); setMsg(action === 'refresh' ? 'Reading the site… up to a few minutes.' : 'Re-checking events… up to a few minutes.')
    const r = await call({ action, city })
    setMsg(r.ok ? summarise(r.text) : r.text); setBusy(null)
    if (r.ok) setTimeout(() => window.location.reload(), 2500)
  }
  return (
    <div>
      <div className="flex gap-2">
        <button type="button" disabled={busy !== null} onClick={() => run('refresh')} className="font-bold text-white px-3 py-1.5 rounded-lg text-xs disabled:opacity-60" style={{ backgroundColor: '#334155' }}>{busy === 'refresh' ? 'Refreshing…' : 'Refresh'}</button>
        <button type="button" disabled={busy !== null} onClick={() => run('clean')} className="font-bold px-3 py-1.5 rounded-lg text-xs border border-slate-300 text-slate-700 disabled:opacity-60">{busy === 'clean' ? 'Cleaning…' : 'Clean'}</button>
      </div>
      {msg && <p className="text-xs text-slate-600 mt-2 max-w-xs whitespace-pre-wrap">{msg}</p>}
    </div>
  )
}

export function RunAll() {
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState('')
  async function run(action: 'refresh' | 'clean') {
    setBusy(action); setMsg('Running… this takes up to five minutes; the scheduled run carries on where it stops.')
    const r = await call({ action })
    setMsg(r.ok ? summarise(r.text) : r.text); setBusy(null)
  }
  return (
    <div>
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={busy !== null} onClick={() => run('refresh')} className="font-bold text-white px-4 py-2 rounded-lg text-sm disabled:opacity-60" style={{ backgroundColor: '#E8003D' }}>{busy === 'refresh' ? 'Refreshing…' : 'Refresh all cities now'}</button>
        <button type="button" disabled={busy !== null} onClick={() => run('clean')} className="font-bold px-4 py-2 rounded-lg text-sm border border-slate-300 text-slate-700 disabled:opacity-60">{busy === 'clean' ? 'Cleaning…' : 'Clean all cities now'}</button>
      </div>
      {msg && <p className="text-sm text-slate-600 mt-3 max-w-3xl whitespace-pre-wrap">{msg}</p>}
    </div>
  )
}

export function AddSource({ cities }: { cities: string[] }) {
  const [form, setForm] = useState({ city: cities[0], label: '', discovery: 'sitemap', discovery_url: '', detail_pattern: '^/event/[^/]+/$', sitemap_child_pattern: '', page_param: '', page_size: '' })
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState('')
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))
  async function run(action: 'test' | 'add') {
    setBusy(action); setMsg('Reading the site…')
    const r = await call({ action, ...form, page_size: form.page_size ? Number(form.page_size) : undefined })
    setMsg(r.text); setBusy(null)
    if (r.ok && action === 'add') setTimeout(() => window.location.reload(), 1500)
  }
  const input = 'w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white'
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 max-w-3xl space-y-3">
      <div className="grid sm:grid-cols-2 gap-3">
        <label className="text-xs font-bold text-slate-600">City
          <select className={input} value={form.city} onChange={e => set('city', e.target.value)}>{cities.map(c => <option key={c}>{c}</option>)}</select>
        </label>
        <label className="text-xs font-bold text-slate-600">Name of the site
          <input className={input} value={form.label} onChange={e => set('label', e.target.value)} placeholder="Visit Example" />
        </label>
        <label className="text-xs font-bold text-slate-600">Found through
          <select className={input} value={form.discovery} onChange={e => set('discovery', e.target.value)}><option value="sitemap">Sitemap</option><option value="listing">“What’s on” listing page</option></select>
        </label>
        <label className="text-xs font-bold text-slate-600">Address of the sitemap or listing
          <input className={input} value={form.discovery_url} onChange={e => set('discovery_url', e.target.value)} placeholder="https://www.example.com/sitemap.xml" />
        </label>
        <label className="text-xs font-bold text-slate-600">Event page addresses look like (pattern)
          <input className={input} value={form.detail_pattern} onChange={e => set('detail_pattern', e.target.value)} />
        </label>
        <label className="text-xs font-bold text-slate-600">Sitemap index: only follow maps containing (optional)
          <input className={input} value={form.sitemap_child_pattern} onChange={e => set('sitemap_child_pattern', e.target.value)} placeholder="event" />
        </label>
        {form.discovery === 'listing' && <>
          <label className="text-xs font-bold text-slate-600">Page number parameter (optional)
            <input className={input} value={form.page_param} onChange={e => set('page_param', e.target.value)} placeholder="page" />
          </label>
          <label className="text-xs font-bold text-slate-600">Results per page (optional)
            <input className={input} value={form.page_size} onChange={e => set('page_size', e.target.value)} placeholder="12" />
          </label>
        </>}
      </div>
      <div className="flex gap-2">
        <button type="button" disabled={busy !== null} onClick={() => run('test')} className="font-bold px-4 py-2 rounded-lg text-sm border border-slate-300 text-slate-700 disabled:opacity-60">{busy === 'test' ? 'Testing…' : 'Test'}</button>
        <button type="button" disabled={busy !== null} onClick={() => run('add')} className="font-bold text-white px-4 py-2 rounded-lg text-sm disabled:opacity-60" style={{ backgroundColor: '#334155' }}>{busy === 'add' ? 'Saving…' : 'Save source'}</button>
      </div>
      {msg && <pre className="text-xs bg-slate-900 text-slate-100 rounded-xl p-4 overflow-x-auto whitespace-pre-wrap">{msg}</pre>}
    </div>
  )
}
