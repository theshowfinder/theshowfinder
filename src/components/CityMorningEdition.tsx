import Link from 'next/link'
import { displayTitle, venueLabel } from '@/lib/displayTitle'
import { eventImageUrl } from '@/lib/eventImages'
import type { EditionKind, EditionTile } from '@/lib/cityBrief'
import type { EventWithVenue } from '@/lib/types/database'

const CHIP: Record<EditionKind, string> = {
  onsale_today: 'bg-emerald-500 text-white',
  onsale_week: 'bg-emerald-500 text-white',
  presale_live: 'bg-[#FFB800] text-slate-900',
  top: 'bg-white/90 text-slate-900',
}

export interface EditionNavLink { href: string; label: string }

// The image-led block at the top of a city page. Server-rendered, no client JS: it must paint instantly
// on a phone. Every tile is a real, live listing; the stamp only appears when the data is genuinely fresh.
export default function CityMorningEdition({
  headline, stamp, tiles, nav,
}: {
  headline: string
  stamp: string | null
  tiles: EditionTile<EventWithVenue>[]
  nav: EditionNavLink[]
}) {
  if (tiles.length === 0) return null
  return (
    <section aria-label={headline || 'Top events'}>
      {(headline || stamp) && <div className="flex flex-wrap items-center gap-x-3 gap-y-2 mb-4">
        {stamp && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 text-emerald-700 text-xs font-semibold px-2.5 py-1">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
            {stamp}
          </span>
        )}
        {headline && <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 leading-tight">{headline}</h2>}
      </div>}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 auto-rows-[11rem] md:auto-rows-[12rem]">
        {tiles.map((tile, i) => {
          const e = tile.event
          const big = i === 0
          const img = eventImageUrl(e.image_url, e.category, e.title)
          return (
            <Link
              key={e.id}
              href={`/events/${e.slug}`}
              className={`group relative overflow-hidden rounded-2xl bg-slate-800 ${big ? 'col-span-2 row-span-2' : ''}`}
            >
              <div
                className="absolute inset-0 bg-cover bg-center transition-transform duration-500 group-hover:scale-105"
                style={{ backgroundImage: `url("${img}")` }}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent" />
              <span className={`absolute top-3 left-3 text-[11px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-full ${CHIP[tile.kind]}`}>
                {tile.label}
              </span>
              <div className="absolute inset-x-0 bottom-0 p-3.5 sm:p-4">
                <p className="text-[11px] sm:text-xs font-semibold uppercase tracking-wide text-white/75">{tile.when}</p>
                <h3 className={`font-extrabold text-white leading-snug line-clamp-2 ${big ? 'text-xl sm:text-3xl mt-1' : 'text-sm sm:text-base mt-0.5'}`}>
                  {displayTitle(e.title)}
                </h3>
                <p className="text-xs text-white/70 truncate mt-0.5">{venueLabel(e.venue_name, e.venue_city)}</p>
              </div>
            </Link>
          )
        })}
      </div>

      {nav.length > 0 && (
        <nav aria-label="Jump to" className="mt-4 flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
          {nav.map(l => (
            <a key={l.href} href={l.href} className="shrink-0 rounded-full border border-slate-300 bg-white px-3.5 py-1.5 text-sm font-semibold text-slate-700 hover:border-slate-900">
              {l.label}
            </a>
          ))}
        </nav>
      )}
    </section>
  )
}
