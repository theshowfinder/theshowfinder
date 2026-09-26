'use client'

import { useSyncExternalStore } from 'react'
import Link from 'next/link'
import { CITIES } from '@/lib/cities'

const CITY_NAMES = new Set(CITIES.map(c => c.name))

// Reads the tsf_city cookie set by middleware.ts (from Vercel's IP
// geolocation) client-side rather than on the server, so this stays a tiny
// client-only island and the homepage itself keeps its hourly ISR caching —
// reading cookies/headers server-side would force the whole page dynamic.
function readCityCookie(): string | null {
  const match = document.cookie.match(/(?:^|;\s*)tsf_city=([^;]+)/)
  if (!match) return null
  const value = decodeURIComponent(match[1])
  return CITY_NAMES.has(value) ? value : null
}

// The cookie is set once by middleware.ts before this page ever loads and
// doesn't change during the page's lifetime, so there's nothing to
// subscribe to — the empty unsubscribe is intentional.
function subscribe() {
  return () => {}
}

// The server can't know the visitor's city (only Vercel's edge network sees
// the geo header), so it always renders nothing — useSyncExternalStore
// handles the server/client snapshot mismatch for us without a hydration
// warning, unlike reading the cookie inside a useEffect + setState.
function getServerSnapshot(): string | null {
  return null
}

export default function LocationBanner() {
  const city = useSyncExternalStore(subscribe, readCityCookie, getServerSnapshot)

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
