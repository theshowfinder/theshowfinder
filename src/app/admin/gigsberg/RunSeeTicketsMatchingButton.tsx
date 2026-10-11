'use client'

import { useState } from 'react'

function SubmitButton({ pending, onClick }: { pending: boolean; onClick: () => void }) {
  return (
    <button type="button" disabled={pending} onClick={onClick} className="font-bold text-white px-5 py-2.5 rounded-lg text-sm disabled:opacity-70 disabled:cursor-wait" style={{ backgroundColor: '#0F766E' }}>
      {pending ? 'Matching See Tickets…' : 'Match See Tickets'}
    </button>
  )
}

export default function RunSeeTicketsMatchingButton({ action: _action }: { action: () => void }) {
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState('')

  async function run() {
    setPending(true)
    setMessage('Starting…')
    let cursor: string | undefined
    let checked = 0
    let autoMatched = 0
    let review = 0
    let noMatch = 0
    let errors = 0
    try {
      do {
        const response = await fetch('/api/cron/match-see-tickets', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cursor, limit: 250 }),
        })
        const data = await response.json()
        if (!response.ok || !data.success) throw new Error(data.error || 'Matching failed')
        const result = data.matching
        checked += result.checked || 0
        autoMatched += result.autoMatched || 0
        review += result.review || 0
        noMatch += result.noMatch || 0
        errors += result.errors || 0
        cursor = result.nextCursor || undefined
        setMessage(`${checked} checked…`)
        if (!result.hasMore) break
      } while (cursor)
      window.location.href = `/admin/gigsberg?seeMatchChecked=${checked}&seeMatched=${autoMatched}&seeReview=${review}&seeNoMatch=${noMatch}&seeMatchErrors=${errors}`
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Matching failed')
      setPending(false)
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <SubmitButton pending={pending} onClick={run} />
      <span className="text-xs text-slate-400">{message || 'Runs safely in small batches.'}</span>
    </div>
  )
}
