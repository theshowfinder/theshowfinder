'use client'

import { useState } from 'react'

export default function CopyBox({ code }: { code: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div>
      <textarea readOnly value={code} rows={4} onFocus={e => e.currentTarget.select()}
        className="w-full rounded-xl border border-slate-300 bg-slate-50 p-3 font-mono text-xs text-slate-700" aria-label="Badge code" />
      <button type="button" onClick={async () => { try { await navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 2000) } catch { /* select and copy by hand */ } }}
        className="mt-2 rounded-lg bg-rose-600 px-4 py-2 text-sm font-bold text-white hover:bg-rose-500">{copied ? 'Copied' : 'Copy the code'}</button>
    </div>
  )
}
