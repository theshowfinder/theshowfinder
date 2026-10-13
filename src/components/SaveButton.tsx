'use client'

// Heart button: saves a show to this browser (no account). "card" is the round
// overlay for event cards; "dark" is the labelled pill for the event page hero.

import { trackEvent } from '@/lib/gtag'
import { toggleSaved } from '@/lib/savedShows'
import { useSavedSlugs, writeSaved } from './savedStore'

interface SaveButtonProps {
  slug: string
  title: string
  variant?: 'card' | 'dark'
}

function Heart({ filled, className }: { filled: boolean; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" fill={filled ? '#E8003D' : 'none'} stroke={filled ? '#E8003D' : 'currentColor'} strokeWidth="2" strokeLinejoin="round">
      <path d="M12 21s-7.5-4.6-9.6-9.2C1 8.6 2.7 5 6.1 5c2 0 3.3 1.1 3.9 2.2C10.6 6.1 11.9 5 13.9 5c3.4 0 5.1 3.6 3.7 6.8C19.5 16.4 12 21 12 21z" />
    </svg>
  )
}

export default function SaveButton({ slug, title, variant = 'card' }: SaveButtonProps) {
  const saved = useSavedSlugs()
  const isSaved = saved.includes(slug)

  function onClick(e: React.MouseEvent) {
    // Cards sit inside links in places: never navigate when saving.
    e.preventDefault()
    e.stopPropagation()
    writeSaved(toggleSaved(saved, slug))
    trackEvent('save_show', { action: isSaved ? 'remove' : 'add', item_id: slug })
  }

  const label = isSaved ? `Remove ${title} from saved shows` : `Save ${title}`

  if (variant === 'dark') {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-pressed={isSaved}
        aria-label={label}
        className="inline-flex items-center justify-center gap-2 min-h-[44px] px-5 rounded-xl border bg-white/10 border-white/30 text-white hover:bg-white/20 text-sm font-bold transition-colors"
      >
        <Heart filled={isSaved} className="h-5 w-5" />
        {isSaved ? 'Saved' : 'Save'}
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={isSaved}
      aria-label={label}
      className="flex items-center justify-center h-11 w-11 rounded-full bg-white/90 text-slate-700 shadow hover:bg-white active:scale-95 transition"
    >
      <Heart filled={isSaved} className="h-6 w-6" />
    </button>
  )
}
