'use client'

import { useState } from 'react'

const JOBS: Array<{ job: string; label: string }> = [
  { job: 'refresh-listings', label: 'Refresh listings' },
  { job: 'match-see-tickets', label: 'See Tickets matching' },
  { job: 'sync-gigsberg-catalogue', label: 'Gigsberg catalogue' },
  { job: 'sync-see-tickets', label: 'See Tickets feed' },
  { job: 'match-gigsberg', label: 'Gigsberg matching' },
  { job: 'sync-onsale', label: 'Ticketmaster on-sale' },
  { job: 'sync-council-events', label: 'Council events' },
]

export default function RunJobButtons() {
  const [running, setRunning] = useState<string | null>(null)
  const [result, setResult] = useState('')

  async function run(job: string) {
    setRunning(job)
    setResult(`Running ${job}… this can take a few minutes.`)
    try {
      const response = await fetch('/api/admin/run-job', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ job }) })
      const text = await response.text()
      let pretty = text
      try { pretty = JSON.stringify(JSON.parse(text), null, 2) } catch { /* not JSON */ }
      setResult(`HTTP ${response.status}\n${pretty}`)
    } catch (e) {
      setResult(`Request failed: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setRunning(null)
    }
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {JOBS.map(j => (
          <button key={j.job} type="button" disabled={running !== null} onClick={() => run(j.job)} className="font-bold text-white px-4 py-2 rounded-lg text-sm disabled:opacity-60 disabled:cursor-wait" style={{ backgroundColor: '#334155' }}>
            {running === j.job ? 'Running…' : `Run ${j.label}`}
          </button>
        ))}
      </div>
      {result && <pre id="job-result" className="mt-3 text-xs bg-slate-900 text-slate-100 rounded-xl p-4 overflow-x-auto whitespace-pre-wrap">{result}</pre>}
    </div>
  )
}
