'use client'

import { useFormStatus } from 'react-dom'

// A form button that shows it is working: disabled with a "Working…" label until the server answers, so a slow
// action never looks like nothing happened (and cannot be pressed twice).
export default function PendingButton({ children, className, pendingLabel = 'Working…' }: { children: React.ReactNode; className?: string; pendingLabel?: string }) {
  const { pending } = useFormStatus()
  return (
    <button type="submit" disabled={pending} aria-busy={pending} className={`${className ?? ''} disabled:opacity-60 disabled:cursor-wait`}>
      {pending ? pendingLabel : children}
    </button>
  )
}
