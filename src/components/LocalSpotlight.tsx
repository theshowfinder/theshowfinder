'use client'

import { useEffect, useState, useSyncExternalStore } from 'react'
import Link from 'next/link'
import { readCityCookie, subscribeNoop, getServerCitySnapshot } from '@/lib/cityCookie'

interface SpotlightEvent {
  slug: string
  title: string
  start_date: string
  venue_name: string
  image_url: string | null
  price_from: number | null
  currency: string
  category: string
}

const CATEGORIES = [
  { value: 'concert', label: 'Concerts', emoji: '🎵' },
  { value: 'theatre', label: 'Theatre',  emoji: '🎭' },
  { value: 'comedy',  label: 'Comedy',   emoji: '😂' },
  { value: 'sports',  label: 'Sports',   emoji: '⚽' },
  { value: 'family',  label: 'Family',   emoji: '🎠' },
  { value: 'local',    label: 'Local',    emoji: '📍' },
]

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
}

const categoryEmoji: Record<string, string> = {
  concert: '🎵', theatre: '🎭', comedy: '😂', sports: '⚽', family: '🎠',
}

// Turns the homepage into a local hub the instant a visitor's city is known
// (tsf_city cookie — see middleware.ts / cityCookie.ts): category
// quick-links scoped to that city plus a grid of real upcoming events,
// fetched client-side from /api/city-spotlight so the ISR-cached homepage
// itself stays cached. Renders nothing until a city is detected.
export default function LocalSpotlight() {
  const city = useSyncExternalStore(subscribeNoop, readCityCookie, getServerCitySnapshot)
  const [events, setEvents] = useState<SpotlightEvent[]>([])

  useEffect(() => {
    if (!city) return
    let cancelled = false

    fetch(`/api/city-spotlight?city=${encodeURIComponent(city)}`)
      .then(res => (res.ok ? res.json() : null))
      .then(json => {
        if (!cancelled && Array.isArray(json?.events)) setEvents(json.events)
      })
      .catch(() => {})

    return () => { cancelled = true }
  }, [city])

  if (!city || events.length === 0) return null

  return (
    <section className="bg-white py-12 border-t border-slate-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-end justify-between mb-5">
          <div>
            <p className="font-bold text-xs uppercase tracking-widest mb-1" style={{ color: '#E8003D' }}>
              📍 Your local hub
            </p>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900">What&apos;s on in {city}</h2>
          </div>
          <Link
            href={`/cities/${encodeURIComponent(city)}`}
            className="text-sm font-semibold hover:underline hidden sm:block"
            style={{ color: '#E8003D' }}
          >
            Explore all of {city} →
          </Link>
        </div>

        {/* City-scoped category quick-links */}
        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1 mb-6">
          {CATEGORIES.map(({ value, label, emoji }) => (
            <Link
              key={value}
              href={`/events?city=${encodeURIComponent(city)}&category=${value}`}
              className="flex-none flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-bold border border-slate-200 text-slate-700 bg-white hover:border-slate-300 hover:bg-slate-50 transition-colors whitespace-nowrap"
            >
              <span>{emoji}</span>
              <span>{label} in {city}</span>
            </Link>
          ))}
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {events.map(event => (
            <Link
              key={event.slug}
              href={`/events/${event.slug}`}
              className="group flex flex-col rounded-xl overflow-hidden bg-white border border-slate-200 shadow-sm hover:shadow-md transition-all duration-200"
            >
              <div className="relative h-28 sm:h-32 bg-slate-100 overflow-hidden">
                {event.image_url ? (
                  <div
                    className="absolute inset-0 bg-cover bg-center transition-transform duration-300 group-hover:scale-105"
                    style={{ backgroundImage: `url("${event.image_url}")` }}
                  />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center text-3xl bg-slate-50">
                    {categoryEmoji[event.category] ?? '🎟️'}
                  </div>
                )}
                <span className="absolute top-2 left-2 text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-white/90 text-slate-700">
                  {categoryEmoji[event.category] ?? '🎟️'} {event.category}
                </span>
              </div>
              <div className="flex flex-col gap-0.5 p-3">
                <span className="text-xs font-bold text-slate-500">{formatDate(event.start_date)}</span>
                <span className="font-bold text-slate-900 text-sm leading-snug line-clamp-2">{event.title}</span>
                <span className="text-xs text-slate-500 truncate">{event.venue_name}</span>
              </div>
            </Link>
          ))}
        </div>

        <div className="mt-8 text-center">
          <Link
            href={`/cities/${encodeURIComponent(city)}`}
            className="inline-block font-bold px-8 py-3.5 rounded-xl text-sm hover:opacity-90 transition-opacity text-white"
            style={{ backgroundColor: '#E8003D' }}
          >
            Explore all of {city} →
          </Link>
        </div>
      </div>
    </section>
  )
}
