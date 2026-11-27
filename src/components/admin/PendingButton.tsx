'use client'

import { useFormStatus } from 'react-dom'

// A form button that shows it is working: disabled with a "Working…" label until the server answers, so a slow
// action never looks like nothing happened (and cannot be pressed twice).
export default function PendingButton({ children, className, pendingLabel = 'Working…', formAction }: { children: React.ReactNode; className?: string; pendingLabel?: string; formAction?: (form: FormData) => void | Promise<void> }) {
  const { pending } = useFormStatus()
  return (
    <button type="submit" formAction={formAction} disabled={pending} aria-busy={pending} className={`${className ?? ''} disabled:opacity-60 disabled:cursor-wait`}>
      {pending ? pendingLabel : children}
    </button>
  )
}
