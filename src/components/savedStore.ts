'use client'

// Browser-side store for saved shows (see lib/savedShows.ts). Every component
// that reads it re-renders when any other component, tab or window changes the
// list. If localStorage is blocked, falls back to memory for the current page
// view so the heart still reacts.

import { useMemo, useSyncExternalStore } from 'react'
import { SAVED_STORAGE_KEY, parseSaved, serializeSaved } from '@/lib/savedShows'

const CHANGE_EVENT = 'tsf-saved-change'
let memoryRaw = ''

function readRaw(): string {
  try {
    return window.localStorage.getItem(SAVED_STORAGE_KEY) ?? ''
  } catch {
    return memoryRaw
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener('storage', onChange)
  window.addEventListener(CHANGE_EVENT, onChange)
  return () => {
    window.removeEventListener('storage', onChange)
    window.removeEventListener(CHANGE_EVENT, onChange)
  }
}

export function useSavedSlugs(): string[] {
  const raw = useSyncExternalStore(subscribe, readRaw, () => '')
  return useMemo(() => parseSaved(raw), [raw])
}

export function writeSaved(next: string[]): void {
  const raw = serializeSaved(next)
  memoryRaw = raw
  try {
    window.localStorage.setItem(SAVED_STORAGE_KEY, raw)
  } catch {
    // storage blocked: memory fallback above keeps this page view working
  }
  window.dispatchEvent(new Event(CHANGE_EVENT))
}
