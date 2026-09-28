'use client'

import { useSyncExternalStore } from 'react'
import { readCityCookie, subscribeNoop, getServerCitySnapshot } from '@/lib/cityCookie'

// Swaps the hero headline + subtext for a localized version once a city is
// detected (tsf_city cookie from middleware.ts). Server always renders the
// generic UK-wide copy — identical to what this returns when city is null —
// so there's no hydration mismatch, just a same-shape client-side re-render
// a moment after mount once the cookie has been read.
export default function LocalHeroCopy() {
  const city = useSyncExternalStore(subscribeNoop, readCityCookie, getServerCitySnapshot)

  if (!city) {
    return (
      <>
        <h1 className="text-5xl sm:text-6xl md:text-7xl font-extrabold tracking-tight leading-[1.05] mb-6 text-white">
          Find Your Next<br />
          <span style={{ color: '#FFD700' }}>Unforgettable</span> Show
        </h1>
        <p className="text-xl text-white/70 mb-10 max-w-xl mx-auto leading-relaxed">
          Concerts, theatre, comedy, sports and family events — all across the UK in one place.
        </p>
      </>
    )
  }

  return (
    <>
      <h1 className="text-5xl sm:text-6xl md:text-7xl font-extrabold tracking-tight leading-[1.05] mb-6 text-white">
        What&apos;s On in<br />
        <span style={{ color: '#FFD700' }}>{city}</span>
      </h1>
      <p className="text-xl text-white/70 mb-10 max-w-xl mx-auto leading-relaxed">
        Concerts, theatre, comedy, sports and family events happening near you — updated daily.
      </p>
    </>
  )
}
