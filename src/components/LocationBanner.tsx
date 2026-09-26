'use client'

import { useSyncExternalStore } from 'react'
import Link from 'next/link'
import { readCityCookie, subscribeNoop, getServerCitySnapshot } from '@/lib/cityCookie'

export default function LocationBanner() {
  const city = useSyncExternalStore(subscribeNoop, readCityCookie, getServerCitySnapshot)

  if (!city) return null

  return (
    <Link
      href={`/cities/${encodeURIComponent(city)}`}
      className="inline-flex items-center gap-2 mb-6 bg-white/10 hover:bg-white/20 transition-colors px-4 py-2 rounded-full border border-white/10 text-sm font-semibold text-white"
    >
      📍 Looks like you&apos;re near {city} — see what&apos;s on →
    </Link>
  )
}
