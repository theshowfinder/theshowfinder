'use client'

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'

// A sideways-scrolling row of cards: swipe on touch, snap points, and
// previous/next buttons on devices with a pointer. The buttons hide themselves
// at either end (and entirely when everything already fits). Children are
// sized by the .h-rail rules in globals.css; pass `columns={4}` for the
// four-across variant used by the venue tiles.
export default function ScrollRail({
  children, label, columns = 3,
}: { children: ReactNode; label: string; columns?: 3 | 4 }) {
  const ref = useRef<HTMLDivElement>(null)
  const [canPrev, setCanPrev] = useState(false)
  const [canNext, setCanNext] = useState(false)

  const update = useCallback(() => {
    const el = ref.current
    if (!el) return
    setCanPrev(el.scrollLeft > 4)
    setCanNext(el.scrollLeft + el.clientWidth < el.scrollWidth - 4)
  }, [])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    update()
    el.addEventListener('scroll', update, { passive: true })
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => { el.removeEventListener('scroll', update); ro.disconnect() }
  }, [update])

  const scrollByPage = (dir: 1 | -1) => {
    const el = ref.current
    if (!el) return
    el.scrollBy({ left: dir * el.clientWidth * 0.9, behavior: 'smooth' })
  }

  const btn = 'hidden md:flex absolute top-1/2 -translate-y-1/2 z-10 h-10 w-10 items-center justify-center rounded-full bg-white border border-slate-200 shadow-md text-slate-700 hover:bg-slate-50 hover:shadow-lg transition'

  return (
    <div className="relative">
      <div ref={ref} role="region" aria-label={label} tabIndex={0} className={`h-rail${columns === 4 ? ' h-rail-4' : ''}`}>
        {children}
      </div>
      {canPrev && (
        <button type="button" aria-label={`Scroll ${label} back`} onClick={() => scrollByPage(-1)} className={`${btn} -left-4`}>
          <span aria-hidden="true">‹</span>
        </button>
      )}
      {canNext && (
        <button type="button" aria-label={`Scroll ${label} forward`} onClick={() => scrollByPage(1)} className={`${btn} -right-4`}>
          <span aria-hidden="true">›</span>
        </button>
      )}
    </div>
  )
}
