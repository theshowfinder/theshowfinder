'use client'

import { useState } from 'react'

export default function RunSweepButton({ mode }: { mode: string }) {
  const [pending, setPending] = useState(false)
  const [result, setResult] = useState('')

  async function run() {
    setPending(true)
    setResult('Running… this can take up to five minutes.')
    try {
      const response = await fetch('/api/cron/sync-ticketmaster-sweep', { method: 'POST' })
      const text = await response.text()
      let pretty = text
      try { pretty = JSON.stringify(JSON.parse(text), null, 2) } catch { /* not JSON */ }
      setResult(`HTTP ${response.status}\n${pretty}`)
    } catch (e) {
      setResult(`Request failed: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setPending(false)
    }
  }

  return (
    <div>
      <button type="button" disabled={pending} onClick={run} className="font-bold text-white px-5 py-2.5 rounded-lg text-sm disabled:opacity-70 disabled:cursor-wait" style={{ backgroundColor: '#0F766E' }}>
        {pending ? 'Running sweep…' : `Run Ticketmaster sweep now (mode: ${mode})`}
      </button>
      {result && <pre id="sweep-result" className="mt-3 text-xs bg-slate-900 text-slate-100 rounded-xl p-4 overflow-x-auto whitespace-pre-wrap">{result}</pre>}
    </div>
  )
}
