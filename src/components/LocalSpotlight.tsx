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

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
}

const categoryEmoji: Record<string, string> = {
  concert: '🎵', theatre: '🎭', comedy: '😂', sports: '⚽', family: '🎠',
}

// Shows a handful of real upcoming events for the visitor's detected city
// (via the tsf_city cookie — see middleware.ts / cityCookie.ts) right below
// the hero. Fetches client-side from /api/city-spotlight rather than
// server-side so the homepage itself keeps its hourly ISR caching.
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
        <div className="flex items-end justify-between mb-6">
          <div>
            <p className="font-bold text-xs uppercase tracking-widest mb-1" style={{ color: '#E8003D' }}>
              📍 Near you
            </p>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900">What&apos;s on in {city}</h2>
          </div>
          <Link
            href={`/cities/${encodeURIComponent(city)}`}
            className="text-sm font-semibold hover:underline hidden sm:block"
            style={{ color: '#E8003D' }}
          >
            See all in {city} →
          </Link>
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
              </div>
              <div className="flex flex-col gap-0.5 p-3">
                <span className="text-xs font-bold text-slate-500">{formatDate(event.start_date)}</span>
                <span className="font-bold text-slate-900 text-sm leading-snug line-clamp-2">{event.title}</span>
                <span className="text-xs text-slate-500 truncate">{event.venue_name}</span>
              </div>
            </Link>
          ))}
        </div>

        <div className="mt-6 text-center sm:hidden">
          <Link href={`/cities/${encodeURIComponent(city)}`} className="text-sm font-semibold hover:underline" style={{ color: '#E8003D' }}>
            See all in {city} →
          </Link>
        </div>
      </div>
    </section>
  )
}
