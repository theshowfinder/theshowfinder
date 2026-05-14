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

export default function CategoryPills() {
  const params  = useSearchParams()
  const current = params.get('category') ?? ''

  return (
    <div className="flex flex-wrap gap-2 justify-center">
      {categories.map(({ value, label, emoji }) => {
        const active = current === value
        const href   = value ? `/events?category=${value}` : '/events'

        return (
          <Link
            key={value}
            href={href}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-full text-sm font-semibold border transition-all duration-150 min-h-[44px]"
            style={active
              ? { backgroundColor: '#E8003D', color: 'white', borderColor: '#E8003D' }
              : { backgroundColor: 'white', color: '#475569', borderColor: '#e2e8f0' }
            }
          >
            <span>{emoji}</span>
            <span>{label}</span>
          </Link>
        )
      })}
    </div>
  )
}
