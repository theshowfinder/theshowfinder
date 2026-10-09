'use client'

import { useState } from 'react'

export default function RunCatalogueImportButton() {
  const [running, setRunning] = useState(false)

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={running}
        onClick={() => {
          setRunning(true)
          window.location.assign('/admin/gigsberg/sync')
        }}
        className="font-bold text-white px-5 py-2.5 rounded-lg text-sm disabled:opacity-70 disabled:cursor-wait"
        style={{ backgroundColor: '#1E3A8A' }}
      >
        {running ? 'Importing next city…' : 'Run catalogue import'}
      </button>
      <span className="text-xs text-slate-400">
        {running ? 'Please keep this page open — this may take a few minutes.' : 'Imports one city across the next 24 months.'}
      </span>
    </div>
  )
}
