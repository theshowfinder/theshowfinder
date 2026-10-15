'use client'

// Bottom-of-screen confirmation ("Saved", "Following ...") so a tap on a heart
// or Follow always gives visible feedback. Mounted once in the root layout.

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { TOAST_EVENT, type ToastDetail } from '@/lib/toast'

const SHOW_MS = 4000

export default function Toast() {
  const [toast, setToast] = useState<ToastDetail | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    function onToast(e: Event) {
      const detail = (e as CustomEvent<ToastDetail>).detail
      if (!detail?.message) return
      setToast(detail)
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => setToast(null), SHOW_MS)
    }
    window.addEventListener(TOAST_EVENT, onToast)
    return () => {
      window.removeEventListener(TOAST_EVENT, onToast)
      if (timer.current) clearTimeout(timer.current)
    }
  }, [])

  if (!toast) return null

  return (
    <div className="fixed inset-x-0 bottom-4 z-[100] flex justify-center px-4 pointer-events-none" role="status" aria-live="polite">
      <div className="pointer-events-auto flex items-center gap-3 rounded-full bg-slate-900 text-white text-sm font-semibold pl-5 pr-3 py-3 shadow-xl max-w-md">
        <span>{toast.message}</span>
        {toast.href && (
          <Link href={toast.href} onClick={() => setToast(null)} className="rounded-full px-3 py-1 text-xs font-extrabold" style={{ backgroundColor: '#E8003D' }}>
            {toast.linkLabel ?? 'View'}
          </Link>
        )}
        <button type="button" onClick={() => setToast(null)} aria-label="Dismiss" className="h-7 w-7 rounded-full text-white/70 hover:text-white">
          ×
        </button>
      </div>
    </div>
  )
}
