'use client'

// Browser-side list of followed artists and venues (see lib/follows.ts) plus the
// email the visitor used, so the next follow is one tap. Every component that
// reads it re-renders when any other component, tab or window changes it. If
// localStorage is blocked, falls back to memory for the current page view.

import { useMemo, useSyncExternalStore } from 'react'
import { FOLLOW_STORAGE_KEY, FOLLOW_EMAIL_KEY, parseFollowed, serializeFollowed } from '@/lib/follows'

const CHANGE_EVENT = 'tsf-follow-change'
let memoryRaw = ''
let memoryEmail = ''

function readRaw(): string {
  try {
    return window.localStorage.getItem(FOLLOW_STORAGE_KEY) ?? ''
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

export function useFollowedKeys(): string[] {
  const raw = useSyncExternalStore(subscribe, readRaw, () => '')
  return useMemo(() => parseFollowed(raw), [raw])
}

export function writeFollowed(next: string[]): void {
  const raw = serializeFollowed(next)
  memoryRaw = raw
  try {
    window.localStorage.setItem(FOLLOW_STORAGE_KEY, raw)
  } catch {
    // storage blocked: memory fallback above keeps this page view working
  }
  window.dispatchEvent(new Event(CHANGE_EVENT))
}

function readEmailRaw(): string {
  try {
    return window.localStorage.getItem(FOLLOW_EMAIL_KEY) ?? ''
  } catch {
    return memoryEmail
  }
}

export function useRememberedEmail(): string {
  return useSyncExternalStore(subscribe, readEmailRaw, () => '')
}

export function rememberEmail(email: string): void {
  memoryEmail = email
  try {
    window.localStorage.setItem(FOLLOW_EMAIL_KEY, email)
  } catch {
    // ignore: the visitor just types it next time
  }
  window.dispatchEvent(new Event(CHANGE_EVENT))
}
