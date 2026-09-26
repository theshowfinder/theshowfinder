import { CITIES } from '@/lib/cities'

const CITY_NAMES = new Set(CITIES.map(c => c.name))

// Reads the tsf_city cookie set by middleware.ts (from Vercel's IP
// geolocation), client-side only. Shared by LocationBanner.tsx and
// LocalSpotlight.tsx, both of which read it via useSyncExternalStore rather
// than useEffect + setState — that avoids a hydration mismatch (the server
// can never know the visitor's city) and the react-hooks
// set-state-in-effect lint rule.
export function readCityCookie(): string | null {
  const match = document.cookie.match(/(?:^|;\s*)tsf_city=([^;]+)/)
  if (!match) return null
  const value = decodeURIComponent(match[1])
  return CITY_NAMES.has(value) ? value : null
}

// The cookie is set once by middleware.ts before the page ever loads and
// doesn't change during the page's lifetime, so there's nothing to
// subscribe to — the empty unsubscribe is intentional.
export function subscribeNoop(): () => void {
  return () => {}
}

// The server can never know the visitor's city (only Vercel's edge network
// sees the geo header), so the server snapshot is always null.
export function getServerCitySnapshot(): string | null {
  return null
}
