import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'

const CITIES = [
  { name: 'London',          emoji: '🎡',  gradient: 'linear-gradient(135deg, #E8003D, #8B001F)'  },
  { name: 'Manchester',      emoji: '🐝',  gradient: 'linear-gradient(135deg, #0f172a, #475569)'  },
  { name: 'Birmingham',      emoji: '🏭',  gradient: 'linear-gradient(135deg, #d97706, #92400e)'  },
  { name: 'Glasgow',         emoji: '🎭',  gradient: 'linear-gradient(135deg, #7c3aed, #1e1b4b)'  },
  { name: 'Edinburgh',       emoji: '🏰',  gradient: 'linear-gradient(135deg, #374151, #111827)'  },
  { name: 'Leeds',           emoji: '🦉',  gradient: 'linear-gradient(135deg, #ca8a04, #78350f)'  },
  { name: 'Liverpool',       emoji: '⚽',  gradient: 'linear-gradient(135deg, #dc2626, #7f1d1d)'  },
  { name: 'Bristol',         emoji: '🌉',  gradient: 'linear-gradient(135deg, #059669, #064e3b)'  },
  { name: 'Cardiff',         emoji: '🐉',  gradient: 'linear-gradient(135deg, #15803d, #991b1b)'  },
  { name: 'Belfast',         emoji: '☘️',  gradient: 'linear-gradient(135deg, #166534, #134e4a)'  },
  { name: 'Nottingham',      emoji: '🏹',  gradient: 'linear-gradient(135deg, #15803d, #14532d)'  },
  { name: 'Newcastle',       emoji: '⚫',  gradient: 'linear-gradient(135deg, #171717, #404040)'  },
  { name: 'Leicester',       emoji: '🦊',  gradient: 'linear-gradient(135deg, #1d4ed8, #a16207)'  },
  { name: 'Sheffield',       emoji: '⚙️',  gradient: 'linear-gradient(135deg, #64748b, #1e293b)'  },
  { name: 'Derby',           emoji: '🐏',  gradient: 'linear-gradient(135deg, #1c1917, #374151)'  },
  { name: 'Coventry',        emoji: '🕊️',  gradient: 'linear-gradient(135deg, #0ea5e9, #0369a1)'  },
  { name: 'Southampton',     emoji: '⚓',  gradient: 'linear-gradient(135deg, #dc2626, #9a3412)'  },
  { name: 'Portsmouth',      emoji: '🚢',  gradient: 'linear-gradient(135deg, #1e3a5f, #a16207)'  },
  { name: 'Norwich',         emoji: '🐦',  gradient: 'linear-gradient(135deg, #eab308, #15803d)'  },
  { name: 'Brighton',        emoji: '🎠',  gradient: 'linear-gradient(135deg, #06b6d4, #1e40af)'  },
  { name: 'Oxford',          emoji: '🎓',  gradient: 'linear-gradient(135deg, #44403c, #a16207)'  },
  { name: 'Cambridge',       emoji: '🚣',  gradient: 'linear-gradient(135deg, #0284c7, #0c4a6e)'  },
  { name: 'Exeter',          emoji: '🏛️',  gradient: 'linear-gradient(135deg, #b91c1c, #ca8a04)'  },
  { name: 'Plymouth',        emoji: '⛵',  gradient: 'linear-gradient(135deg, #1e3a5f, #0c4a6e)'  },
  { name: 'Hull',            emoji: '🐟',  gradient: 'linear-gradient(135deg, #ca8a04, #171717)'  },
  { name: 'Middlesbrough',   emoji: '🏗️',  gradient: 'linear-gradient(135deg, #dc2626, #1e3a8a)'  },
  { name: 'Sunderland',      emoji: '🏟️',  gradient: 'linear-gradient(135deg, #b91c1c, #1c1917)'  },
  { name: 'Bradford',        emoji: '🌺',  gradient: 'linear-gradient(135deg, #9b1c1c, #d97706)'  },
  { name: 'Reading',         emoji: '📖',  gradient: 'linear-gradient(135deg, #1d4ed8, #1e3a5f)'  },
  { name: 'Milton Keynes',   emoji: '🦁',  gradient: 'linear-gradient(135deg, #6366f1, #4338ca)'  },
  { name: 'Bournemouth',     emoji: '🏖️',  gradient: 'linear-gradient(135deg, #e11d48, #f97316)'  },
  { name: 'Ipswich',         emoji: '🌊',  gradient: 'linear-gradient(135deg, #2563eb, #1e40af)'  },
  { name: 'Stoke-on-Trent', emoji: '🏺',  gradient: 'linear-gradient(135deg, #dc2626, #7c3aed)'  },
  { name: 'Wolverhampton',   emoji: '🐺',  gradient: 'linear-gradient(135deg, #ca8a04, #292524)'  },
  { name: 'Swansea',         emoji: '🦢',  gradient: 'linear-gradient(135deg, #374151, #0f172a)'  },
  { name: 'Aberdeen',        emoji: '🪨',  gradient: 'linear-gradient(135deg, #dc2626, #6b7280)'  },
]

export default async function CitiesGrid() {
  const supabase = await createClient()

  // Single query: fetch all upcoming event city names, then count in JS
  const { data: rows } = await supabase
    .from('events_with_venue')
    .select('venue_city')
    .gte('start_date', new Date().toISOString()) as unknown as { data: { venue_city: string }[] | null }

  const countMap: Record<string, number> = {}
  for (const row of rows ?? []) {
    countMap[row.venue_city] = (countMap[row.venue_city] ?? 0) + 1
  }

  return (
    <div className="flex gap-4 overflow-x-auto no-scrollbar pb-2 md:grid md:grid-cols-4 lg:grid-cols-6 md:gap-4 md:pb-0">
      {CITIES.map(({ name, gradient, emoji }) => {
        const count = countMap[name] ?? 0

        return (
          <Link
            key={name}
            href={`/events?city=${encodeURIComponent(name)}`}
            className="flex-none w-40 md:w-auto relative flex flex-col justify-end p-4 rounded-2xl overflow-hidden h-32 md:h-36 hover:scale-[1.02] hover:shadow-xl transition-all duration-200 group"
            style={{ background: gradient }}
          >
            {/* Emoji watermark */}
            <span className="absolute top-2 right-3 text-3xl opacity-25 group-hover:opacity-40 transition-opacity select-none">
              {emoji}
            </span>

            {/* Text */}
            <div className="relative z-10">
              <p className="font-extrabold text-white text-base leading-tight drop-shadow-sm">{name}</p>
              <p className="text-white/70 text-xs mt-0.5">
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
