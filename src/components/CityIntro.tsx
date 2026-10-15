import Link from 'next/link'
import { splitIntro } from '@/lib/cityGuides'

// The "About <city>" block at the top of a city page: a big lead sentence, live
// stat chips (computed from our own data, never invented), the rest of the
// researched guide text behind a native <details> (so it is still in the HTML
// for search engines and works without JavaScript), and quick links into the
// city's biggest venues.
export interface CityIntroVenue { name: string; slug: string; capacity: number | null }

export default function CityIntro({
  cityName, emoji, intro, totalCount, venueCount, venues,
}: { cityName: string; emoji: string; intro: string; totalCount: number; venueCount: number; venues: CityIntroVenue[] }) {
  const { lead, rest } = splitIntro(intro)
  const biggest = [...venues].filter(v => v.capacity).sort((a, b) => (b.capacity ?? 0) - (a.capacity ?? 0))[0]
  const chips: { icon: string; text: string }[] = []
  if (totalCount > 0) chips.push({ icon: '🎟️', text: `${totalCount}+ upcoming shows` })
  if (venueCount > 0) chips.push({ icon: '🏟️', text: `${venueCount} venue${venueCount !== 1 ? 's' : ''} with shows` })
  if (biggest?.capacity) chips.push({ icon: '🎤', text: `Biggest room: ${biggest.name} (${biggest.capacity.toLocaleString('en-GB')})` })

  return (
    <section aria-label={`About ${cityName}`} className="relative overflow-hidden rounded-3xl bg-white border border-slate-200 shadow-sm">
      <div className="absolute inset-y-0 left-0 w-1.5" style={{ background: 'linear-gradient(180deg, #E8003D, #026CDF)' }} />
      <div className="p-6 sm:p-9 pl-7 sm:pl-11">
        <div className="flex items-center gap-3 mb-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 text-2xl select-none" aria-hidden="true">{emoji}</span>
          <div>
            <p className="font-bold text-xs uppercase tracking-widest" style={{ color: '#026CDF' }}>About {cityName}</p>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 leading-tight">{cityName}&rsquo;s Live Scene</h2>
          </div>
        </div>

        <p className="text-lg sm:text-xl font-medium text-slate-800 leading-relaxed max-w-3xl">{lead}</p>

        {chips.length > 0 && (
          <ul className="flex flex-wrap gap-2 mt-5">
            {chips.map(c => (
              <li key={c.text} className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5 text-sm font-semibold text-slate-700">
                <span aria-hidden="true">{c.icon}</span>{c.text}
              </li>
            ))}
          </ul>
        )}

        {rest && (
          <details className="group mt-5 max-w-3xl">
            <summary className="inline-flex cursor-pointer select-none items-center gap-1.5 text-sm font-bold list-none [&::-webkit-details-marker]:hidden" style={{ color: '#E8003D' }}>
              <span className="group-open:hidden">Read more about {cityName}&rsquo;s scene</span>
              <span className="hidden group-open:inline">Show less</span>
              <span aria-hidden="true" className="transition-transform group-open:rotate-180">▾</span>
            </summary>
            <p className="mt-3 text-slate-600 leading-relaxed">{rest}</p>
          </details>
        )}

        {venues.length > 0 && (
          <div className="mt-6 pt-5 border-t border-slate-100">
            <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-2.5">Jump to a venue</p>
            <ul className="flex flex-wrap gap-2">
              {venues.slice(0, 5).map(v => (
                <li key={v.slug}>
                  <Link href={`/venues/${v.slug}`} className="inline-flex items-center min-h-[36px] rounded-lg border border-slate-200 px-3 text-sm font-semibold text-slate-700 hover:border-slate-400 hover:text-slate-900">
                    {v.name} →
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  )
}
