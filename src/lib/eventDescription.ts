// Builds a per-event description when Ticketmaster doesn't supply one via
// its own info/pleaseNote fields (the large majority of events, in
// practice — TM's UK data is inconsistent about including this). Used by
// both the live Ticketmaster sync (src/lib/ticketmaster.ts, preferring
// TM's own text when present) and the one-off backfill script for events
// synced before this existed (scripts/backfill-event-descriptions.ts) — one
// shared function so the two never drift into different wording for the
// same kind of event.
import type { EventCategory } from './types/database'

const CATEGORY_PREFIX: Record<EventCategory, (title: string) => string> = {
  concert: t => `See ${t} live`,
  theatre: t => `Watch ${t} live on stage`,
  comedy:  t => `See ${t} live`,
  sports:  t => `Watch ${t}`,
  family:  t => `Bring the family to ${t}`,
  local:   t => `Join ${t}`,
}

function formatEventDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })
}

export interface FallbackDescriptionInput {
  title: string
  venueName: string | null
  city: string | null
  startDate: string
  category: EventCategory
}

export function buildFallbackDescription(input: FallbackDescriptionInput): string {
  const prefix = (CATEGORY_PREFIX[input.category] ?? CATEGORY_PREFIX.concert)(input.title)

  const where = input.venueName
    ? (input.city && input.city !== input.venueName ? `${input.venueName}, ${input.city}` : input.venueName)
    : (input.city ?? 'the UK')

  const when = formatEventDate(input.startDate)
  const dateClause = when ? ` on ${when}` : ''

  return `${prefix} at ${where}${dateClause}. Compare ticket prices across Ticketmaster, Viagogo, StubHub and more with TheShowFinder.`
}

// Strips any HTML Ticketmaster's info/pleaseNote fields occasionally
// contain and collapses whitespace, so what we store is always plain text.
export function cleanSourceDescription(raw: string): string {
  return raw
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}
