import Link from 'next/link'
import { BROWSE_CATEGORIES } from '@/lib/eventPools'

const LABELS: Record<string, { label: string; emoji: string }> = {
  concert: { label: 'Concerts', emoji: '🎵' },
  theatre: { label: 'Theatre',  emoji: '🎭' },
  comedy:  { label: 'Comedy',   emoji: '😂' },
  sports:  { label: 'Sport',    emoji: '⚽' },
  family:  { label: 'Family',   emoji: '🎠' },
}

// "Browse by type" chips for a city page. Only types the city actually has
// shows in are offered (a null count means the count failed, so the chip is
// still shown rather than silently hiding a type that may well have shows).
export default function CityBrowse({ cityName, counts }: { cityName: string; counts: Record<string, number | null> }) {
  const shown = BROWSE_CATEGORIES.filter(c => counts[c] === null || (counts[c] ?? 0) > 0)
  if (shown.length === 0) return null

  return (
    <nav aria-label={`Browse ${cityName} shows by type`} className="flex flex-wrap items-center gap-3">
      <span className="text-sm font-bold text-slate-500 mr-1">Browse by type</span>
      {shown.map(c => (
        <Link
          key={c}
          href={`/events?category=${c}&city=${encodeURIComponent(cityName)}`}
          className="flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-bold border border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:shadow-sm transition min-h-[44px]"
        >
          <span aria-hidden="true">{LABELS[c].emoji}</span>
          <span>{LABELS[c].label}</span>
          {typeof counts[c] === 'number' && <span className="text-slate-400 font-semibold">{counts[c]}</span>}
        </Link>
      ))}
    </nav>
  )
}
