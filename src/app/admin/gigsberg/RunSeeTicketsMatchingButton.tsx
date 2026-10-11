'use client'

import { useFormStatus } from 'react-dom'

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <button type="submit" disabled={pending} className="font-bold text-white px-5 py-2.5 rounded-lg text-sm disabled:opacity-70 disabled:cursor-wait" style={{ backgroundColor: '#0F766E' }}>
      {pending ? 'Matching See Tickets…' : 'Match See Tickets'}
    </button>
  )
}

export default function RunSeeTicketsMatchingButton({ action }: { action: () => void }) {
  return (
    <form action={action} className="flex flex-col items-end gap-1">
      <SubmitButton />
      <span className="text-xs text-slate-400">Runs separately after the import completes.</span>
    </form>
  )
}
