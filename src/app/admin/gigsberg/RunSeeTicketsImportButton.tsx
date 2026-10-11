'use client'

import { useFormStatus } from 'react-dom'

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <button type="submit" disabled={pending} className="font-bold text-white px-5 py-2.5 rounded-lg text-sm disabled:opacity-70 disabled:cursor-wait" style={{ backgroundColor: '#B91C1C' }}>
      {pending ? 'Importing See Tickets…' : 'Run See Tickets import'}
    </button>
  )
}

export default function RunSeeTicketsImportButton({ action }: { action: () => void }) {
  return (
    <form action={action} className="flex flex-col items-end gap-1">
      <SubmitButton />
      <span className="text-xs text-slate-400">Imports UK See Tickets events across 24 months.</span>
    </form>
  )
}
