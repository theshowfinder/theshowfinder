'use client'

import { useState } from 'react'

interface CopyLinkButtonProps {
  link: string
  label?: string
  copiedLabel?: string
  className?: string
}

export function CopyLinkButton({
  link,
  label = 'Copy link to share',
  copiedLabel = 'Link copied!',
  className = 'inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-slate-700 transition-colors',
}: CopyLinkButtonProps) {
  const [copied, setCopied] = useState(false)

  async function handleClick() {
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard API unavailable (e.g. insecure context) — fail silently
    }
  }

  return (
    <button type="button" onClick={handleClick} className={className}>
      {copied ? `✓ ${copiedLabel}` : `🔗 ${label}`}
    </button>
  )
}
