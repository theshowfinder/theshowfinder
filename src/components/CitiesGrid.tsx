import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'

const CITIES = [
  { name: 'London',     gradient: 'linear-gradient(135deg, #E8003D, #8B001F)', emoji: '🎡' },
  { name: 'Manchester', gradient: 'linear-gradient(135deg, #475569, #0f172a)', emoji: '🐝' },
  { name: 'Birmingham', gradient: 'linear-gradient(135deg, #d97706, #92400e)', emoji: '🏭' },
  { name: 'Glasgow',    gradient: 'linear-gradient(135deg, #4f46e5, #1e1b4b)', emoji: '🏴󠁧󠁢󠁳󠁣󠁴󠁿' },
  { name: 'Leeds',      gradient: 'linear-gradient(135deg, #eab308, #92400e)', emoji: '🦉' },
  { name: 'Edinburgh',  gradient: 'linear-gradient(135deg, #1A1A2E, #374151)', emoji: '🏰' },
  { name: 'Bristol',    gradient: 'linear-gradient(135deg, #059669, #064e3b)', emoji: '🌉' },
  { name: 'Liverpool',  gradient: 'linear-gradient(135deg, #dc2626, #7f1d1d)', emoji: '⚽' },
]

export default async function CitiesGrid() {
  const supabase = await createClient()

  const counts = await Promise.all(
    CITIES.map(async ({ name }) => {
      const { count } = await supabase
        .from('events_with_venue')
        .select('*', { count: 'exact', head: true })
        .eq('venue_city', name)
        .gte('start_date', new Date().toISOString())
      return { name, count: count ?? 0 }
    })
  )

  const countMap = Object.fromEntries(counts.map(({ name, count }) => [name, count]))

  return (
    <div className="flex gap-4 overflow-x-auto no-scrollbar pb-2 md:grid md:grid-cols-4 md:gap-5 md:pb-0">
      {CITIES.map(({ name, gradient, emoji }) => {
        const count = countMap[name] ?? 0

        return (
          <Link
            key={name}
            href={`/events?city=${name}`}
            className="flex-none w-44 md:w-auto relative flex flex-col justify-end p-5 rounded-2xl overflow-hidden h-36 md:h-48 hover:scale-[1.02] hover:shadow-xl transition-all duration-200 group"
            style={{ background: gradient }}
          >
            {/* Emoji watermark */}
            <span className="absolute top-3 right-4 text-4xl opacity-25 group-hover:opacity-40 transition-opacity select-none">
              {emoji}
            </span>

            {/* Text */}
            <div className="relative z-10">
              <p className="font-extrabold text-white text-xl leading-tight drop-shadow-sm">{name}</p>
              <p className="text-white/70 text-sm mt-0.5">
                {count > 0 ? `${count} event${count !== 1 ? 's' : ''}` : 'Coming soon'}
              </p>
            </div>

            {/* Yellow underline on hover */}
            <div
              className="absolute inset-x-0 bottom-0 h-1 scale-x-0 group-hover:scale-x-100 transition-transform duration-300 origin-left"
              style={{ backgroundColor: '#FFD700' }}
            />
          </Link>
        )
      })}
    </div>
  )
}
