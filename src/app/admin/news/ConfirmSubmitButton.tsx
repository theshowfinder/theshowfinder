'use client'

import type { ReactNode } from 'react'

interface Props {
  action: (formData: FormData) => void | Promise<void>
  confirmMessage: string
  className: string
  children: ReactNode
}

// A plain <form action={...}><button>...</button></form>, same as every
// other admin action button in this file, except it asks for confirmation
// before the form actually submits — for actions (like Unpublish) where a
// misclick has a visible, public effect.
export default function ConfirmSubmitButton({ action, confirmMessage, className, children }: Props) {
  return (
    <form
      action={action}
      onSubmit={event => {
        if (!window.confirm(confirmMessage)) {
          event.preventDefault()
        }
      }}
    >
      <button type="submit" className={className}>
        {children}
      </button>
    </form>
  )
}
