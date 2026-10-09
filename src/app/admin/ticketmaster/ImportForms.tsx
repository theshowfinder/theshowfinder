'use client'

import { useFormStatus } from 'react-dom'
import type { FormHTMLAttributes, ReactNode } from 'react'

function SubmitButton({ children, className }: { children: ReactNode; className: string }) {
  const { pending } = useFormStatus()

  return (
    <>
      <button disabled={pending} className={`${className} disabled:cursor-wait disabled:opacity-60`}>
        {pending ? 'Importing…' : children}
      </button>
      {pending && <p className="text-sm text-blue-700 font-semibold sm:col-span-2 lg:col-span-5">Import started — keep this page open. This can take up to a minute.</p>}
    </>
  )
}

type FormProps = FormHTMLAttributes<HTMLFormElement> & { children: ReactNode }

export function ImportForm({ children, ...props }: FormProps) {
  return <form {...props}>{children}</form>
}

export { SubmitButton }
