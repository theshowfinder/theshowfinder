'use client'

import { useState } from 'react'

export default function RunMatchingButton() {
  const [running, setRunning] = useState(false)

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={running}
        onClick={() => {
          setRunning(true)
          window.location.assign('/admin/gigsberg/match')
        }}
        className="font-bold text-white px-5 py-2.5 rounded-lg text-sm disabled:opacity-70 disabled:cursor-wait"
        style={{ backgroundColor: '#1E3A8A' }}
      >
        {running ? 'Matching catalogue…' : 'Run matching'}
      </button>
      <span className="text-xs text-slate-400">May take a few minutes for the full UK catalogue</span>
    </div>
  )
}
