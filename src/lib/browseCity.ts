'use client'

// The city someone is browsing right now (not where they live: that is the
// tsf_city cookie). Set by event, city and venue pages; read by artist pages so
// that after looking at a show in Derby, any artist you open from there shows
// their Derby dates first and "Get tickets" goes to the Derby show.
// Kept for this browser tab only (sessionStorage) and for 30 minutes after the
// last city page, so it never follows someone into a different visit.

import { useSyncExternalStore } from 'react'

const KEY = 'tsf_browse_city'
const EVENT = 'tsf-browse-city'
const MAX_AGE_MS = 30 * 60_000
let memory: string | null = null

function read(): string | null {
  try {
    const raw = window.sessionStorage.getItem(KEY)
    if (!raw) return memory
    const { city, at } = JSON.parse(raw) as { city?: string; at?: number }
    if (!city || !at || Date.now() - at > MAX_AGE_MS) return null
    return city
  } catch {
    return memory
  }
}

export function setBrowseCity(city: string | null | undefined): void {
  const c = (city ?? '').trim()
  if (!c) return
  memory = c
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify({ city: c, at: Date.now() }))
  } catch { /* storage blocked: memory only */ }
  window.dispatchEvent(new Event(EVENT))
}

function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange)
  return () => window.removeEventListener(EVENT, onChange)
}

/** Browsing city on the client; null on the server and during hydration. */
export function useBrowseCity(): string | null {
  return useSyncExternalStore(subscribe, read, () => null)
}
