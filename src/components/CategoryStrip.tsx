'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'

const categories = [
  { value: '',         label: 'All Shows', emoji: '✨' },
  { value: 'concert',  label: 'Concerts',  emoji: '🎵' },
  { value: 'theatre',  label: 'Theatre',   emoji: '🎭' },
  { value: 'comedy',   label: 'Comedy',    emoji: '😂' },
  { value: 'sports',   label: 'Sports',    emoji: '⚽' },
  { value: 'family',   label: 'Family',    emoji: '🎠' },
]

export default function CategoryStrip() {
  const params  = useSearchParams()
  const current = params.get('category') ?? ''

  return (
    <div className="flex gap-3 overflow-x-auto no-scrollbar pb-1">
      {categories.map(({ value, label, emoji }) => {
        const active = current === value
        const href   = value ? `/events?category=${value}` : '/events'

        return (
          <Link
            key={value}
            href={href}
            className="flex-none flex items-center gap-2 px-5 py-3 rounded-full text-sm font-bold border transition-all duration-150 min-h-[48px] whitespace-nowrap"
            style={active
              ? { backgroundColor: '#E8003D', color: 'white', borderColor: '#E8003D', boxShadow: '0 2px 8px rgba(232,0,61,0.3)' }
              : { backgroundColor: 'white', color: '#374151', borderColor: '#e2e8f0' }
            }
          >
            <span className="text-base">{emoji}</span>
            <span>{label}</span>
          </Link>
        )
      })}
    </div>
  )
}
