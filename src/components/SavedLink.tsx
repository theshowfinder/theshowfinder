'use client'

import Link from 'next/link'
import { useSavedSlugs } from './savedStore'

// Header shortcut to /saved with a count once something is saved.
export default function SavedLink({ onNavigate }: { onNavigate?: () => void }) {
  const count = useSavedSlugs().length
  return (
    <Link
      href="/saved"
      onClick={onNavigate}
      aria-label={count > 0 ? `Saved shows (${count})` : 'Saved shows'}
      className="relative p-3 md:p-2 rounded-md text-white/80 hover:text-white hover:bg-white/10 transition-colors"
    >
      <svg viewBox="0 0 24 24" className="h-6 w-6 md:h-5 md:w-5" fill={count > 0 ? '#E8003D' : 'none'} stroke={count > 0 ? '#E8003D' : 'currentColor'} strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 21s-7.5-4.6-9.6-9.2C1 8.6 2.7 5 6.1 5c2 0 3.3 1.1 3.9 2.2C10.6 6.1 11.9 5 13.9 5c3.4 0 5.1 3.6 3.7 6.8C19.5 16.4 12 21 12 21z" />
      </svg>
      {count > 0 && (
        <span className="absolute top-1 right-0 md:top-0 md:-right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-white text-[11px] font-extrabold leading-[18px] text-center" style={{ color: '#E8003D' }}>
          {count > 99 ? '99+' : count}
        </span>
      )}
    </Link>
  )
}
