'use client'

import { useSyncExternalStore } from 'react'
import Link from 'next/link'
import { readCityCookie, subscribeNoop, getServerCitySnapshot } from '@/lib/cityCookie'
import { groupDatesByCity, type ShowDate } from '@/lib/showDates'
import { londonTimeSuffix } from '@/lib/displayTitle'

const when = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { timeZone: 'Europe/London', weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) +
  londonTimeSuffix(iso)

const SHOWN = 6

// Every upcoming date of this show, grouped by city. The page itself is cached for everyone, so the
// visitor's own city (from the location cookie) is moved to the top here in the browser.
export default function ShowDatesList({ dates, currentId, truncated }: { dates: ShowDate[]; currentId: string; truncated: boolean }) {
  const home = useSyncExternalStore(subscribeNoop, readCityCookie, getServerCitySnapshot)
  const groups = groupDatesByCity(dates, home)
  const cities = groups.length

  const row = (d: ShowDate) => (
    <li key={d.id}>
      {d.id === currentId ? (
        <div className="flex items-center justify-between gap-4 px-4 py-2.5 bg-slate-50">
          <span className="text-sm font-semibold text-slate-900">{d.venue_name ?? 'Venue'} <span className="text-xs font-bold text-slate-500">(this date)</span></span>
          <span className="text-sm text-slate-500 whitespace-nowrap">{when(d.start_date)}</span>
        </div>
      ) : (
        <Link href={`/events/${d.slug}`} className="flex items-center justify-between gap-4 px-4 py-2.5 hover:bg-slate-50">
          <span className="text-sm font-semibold text-slate-800">{d.venue_name ?? 'Venue'}{d.status === 'sold_out' ? <span className="ml-2 text-xs font-bold text-red-600">Sold out · resale</span> : null}</span>
          <span className="text-sm text-slate-500 whitespace-nowrap">{when(d.start_date)}</span>
        </Link>
      )}
    </li>
  )

  return (
    <div>
      <h2 className="text-xl font-extrabold text-slate-900 mb-1">All dates</h2>
      <p className="text-sm text-slate-500 mb-4">{dates.length}{truncated ? '+' : ''} date{dates.length === 1 ? '' : 's'}{cities > 1 ? ` in ${cities} cities` : ''}{home && groups[0]?.isHome ? `, ${home} first` : ''}</p>
      <div className="space-y-4">
        {groups.map(g => (
          <section key={g.city} className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <h3 className="px-4 py-2 text-xs font-extrabold uppercase tracking-widest text-slate-500 bg-slate-50 border-b border-slate-100">
              {g.isHome ? `📍 ${g.city} (near you)` : g.city} · {g.dates.length} date{g.dates.length === 1 ? '' : 's'}
            </h3>
            <ul className="divide-y divide-slate-100">
              {g.dates.slice(0, SHOWN).map(row)}
            </ul>
            {g.dates.length > SHOWN && (
              <details>
                <summary className="px-4 py-2.5 text-sm font-semibold text-blue-700 cursor-pointer border-t border-slate-100">Show {g.dates.length - SHOWN} more in {g.city}</summary>
                <ul className="divide-y divide-slate-100 border-t border-slate-100">{g.dates.slice(SHOWN).map(row)}</ul>
              </details>
            )}
          </section>
        ))}
      </div>
    </div>
  )
}
