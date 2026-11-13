'use client'

import { useEffect } from 'react'
import { setBrowseCity } from '@/lib/browseCity'

// Drop on any page that is "in" a city (event, city, venue pages): remembers it
// for artist pages opened from here. Renders nothing.
export default function SetBrowseCity({ city }: { city: string | null | undefined }) {
  useEffect(() => { setBrowseCity(city) }, [city])
  return null
}
