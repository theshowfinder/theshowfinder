'use client'

import { Fragment, type ReactNode } from 'react'
import Link from 'next/link'
import { useBrowseCity } from '@/lib/browseCity'

export interface CityItem { key: string; city: string | null; node: ReactNode }
export interface NextShowItem { slug: string; startDate: string; city: string | null }

function sameCity(a: string | null | undefined, b: string | null | undefined): boolean {
  return !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase()
}

/** The city to put first: the page's own (/in/<city>), else the city being browsed, if the artist plays there. */
function focusCity<T extends { city: string | null }>(items: T[], pageCity: string | undefined, browseCity: string | null): string | null {
  for (const c of [pageCity, browseCity]) if (c && items.some(i => sameCity(i.city, c))) return c
  return null
}

// The artist's dates, with the focus city's dates first under "In <city>" and the rest under "Other dates".
export function CityFirstDates({ items, pageCity }: { items: CityItem[]; pageCity?: string }) {
  const city = focusCity(items, pageCity, useBrowseCity())
  const first = city ? items.filter(i => sameCity(i.city, city)) : []
  const ordered = city ? [...first, ...items.filter(i => !sameCity(i.city, city))] : items
  return (
    <div className="space-y-3">
      {ordered.map((i, idx) => (
        <Fragment key={i.key}>
          {first.length > 0 && (idx === 0 || idx === first.length) && idx < ordered.length && (
            <p className="text-xs font-extrabold uppercase tracking-widest text-slate-500 pt-2">{idx === 0 ? `In ${first[0].city}` : 'Other dates'}</p>
          )}
          {i.node}
        </Fragment>
      ))}
    </div>
  )
}

// "Get tickets · next show": the focus city's next show when there is one, else the artist's next show.
export function CityNextShowButton({ shows, pageCity }: { shows: NextShowItem[]; pageCity?: string }) {
  const city = focusCity(shows, pageCity, useBrowseCity())
  const show = (city ? shows.find(s => sameCity(s.city, city)) : null) ?? shows[0]
  if (!show) return null
  return (
    <Link
      href={`/events/${show.slug}`}
      className="block w-full text-center font-bold text-white py-4 px-6 rounded-2xl text-lg shadow-lg hover:opacity-90 transition-opacity"
      style={{ backgroundColor: '#E8003D' }}
    >
      {city ? `Get tickets · ${show.city}` : 'Get tickets · next show'}
      <span className="block text-sm font-semibold text-white/80">
        {new Date(show.startDate).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Europe/London' })}
        {show.city ? ` · ${show.city}` : ''}
      </span>
    </Link>
  )
}
