'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

type SyncState = {
  current_city_index:  number
  status:              string
  last_started_at:     string | null
  last_completed_at:   string | null
  total_events_synced: number
}

type SyncResult = {
  success:       boolean
  cities_synced: string[]
  events_synced: number
  next_index:    number
  total_cities:  number
  message?:      string
  error?:        string
}

interface Props {
  syncState:   SyncState | null
  totalCities: number
}

function fmtDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-GB', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  })
}

function statusColour(status: string) {
  if (status === 'running')  return 'text-amber-600 bg-amber-50'
  if (status === 'complete') return 'text-green-700 bg-green-50'
  return 'text-slate-600 bg-slate-100'
}

export default function SyncPanel({ syncState, totalCities }: Props) {
  const router = useRouter()
  const [loading, setLoading]     = useState(false)
  const [result,  setResult]      = useState<SyncResult | null>(null)
  const [errorMsg, setErrorMsg]   = useState<string | null>(null)

  const currentIndex = syncState?.current_city_index ?? 0

  async function runSync() {
    setLoading(true)
    setResult(null)
    setErrorMsg(null)
    try {
      const res  = await fetch('/api/sync-chunk', { credentials: 'include' })
      const data = await res.json() as SyncResult
      if (!res.ok || !data.success) {
        setErrorMsg(data.error ?? 'Sync failed')
      } else {
        setResult(data)
        router.refresh()
      }
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
      {/* Header */}
      <div className="flex items-start justify-between mb-5">
        <div>
          <h2 className="text-lg font-extrabold text-slate-900">Event Sync</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Processes 3 UK cities per run · {totalCities} cities total · cron 2–3 AM UTC
          </p>
        </div>
        <button
          onClick={runSync}
          disabled={loading}
          className="font-bold text-white px-5 py-2.5 rounded-xl hover:opacity-90 transition-opacity text-sm disabled:opacity-50 shrink-0"
          style={{ backgroundColor: '#026CDF' }}
        >
          {loading ? 'Running…' : '▶ Run Sync Chunk'}
        </button>
      </div>

      {/* Status tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <div className="bg-slate-50 rounded-xl p-3">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Status</p>
          <span className={`text-xs font-bold px-2 py-0.5 rounded-full capitalize ${statusColour(syncState?.status ?? 'idle')}`}>
            {syncState?.status ?? 'idle'}
          </span>
        </div>
        <div className="bg-slate-50 rounded-xl p-3">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Progress</p>
          <p className="font-bold text-slate-900 text-sm">{currentIndex} / {totalCities} cities</p>
          <div className="mt-1.5 h-1.5 bg-slate-200 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${(currentIndex / totalCities) * 100}%`, backgroundColor: '#026CDF' }}
            />
          </div>
        </div>
        <div className="bg-slate-50 rounded-xl p-3">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Events synced</p>
          <p className="font-bold text-slate-900">{(syncState?.total_events_synced ?? 0).toLocaleString()}</p>
        </div>
        <div className="bg-slate-50 rounded-xl p-3">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Last completed</p>
          <p className="font-bold text-slate-900 text-xs leading-snug">{fmtDate(syncState?.last_completed_at ?? null)}</p>
        </div>
      </div>

      {/* Next chunk preview */}
      {currentIndex < totalCities && (
        <p className="text-xs text-slate-500 mb-4">
          Next chunk will process cities at index {currentIndex}–{Math.min(currentIndex + 2, totalCities - 1)}
        </p>
      )}

      {/* Run result */}
      {result && (
        <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3">
          <p className="text-sm font-bold text-green-800 mb-1">
            ✓ Synced {result.events_synced} events from {result.cities_synced.join(', ')}
          </p>
          <p className="text-xs text-green-700">
            Next index: {result.next_index} / {result.total_cities}
            {result.message ? ` · ${result.message}` : ''}
          </p>
        </div>
      )}
      {errorMsg && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-800">
          Error: {errorMsg}
        </div>
      )}
    </div>
  )
}
