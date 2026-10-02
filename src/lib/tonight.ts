// Pure logic for "Tonight in <city>" (the Manchester pilot's new top-of-
// page section — src/app/cities/[city]/page.tsx). No '@/' imports and no
// npm packages, matching on-sale.ts/intelligence.ts, so this is
// unit-testable with plain `node --test`.
//
// Reuses londonDayWindow from intelligence.ts (Phase 6) rather than
// re-deriving Europe/London day-boundary arithmetic a second time — one
// definition of "today" for the whole admin + public site.

import { londonDayWindow, type DateWindow } from './intelligence.ts'

export { londonDayWindow }
export type { DateWindow }

// Only cancelled/postponed are excluded here — a sold-out show is still
// genuinely happening tonight (EventCard already shows a "Sold Out" badge
// for it elsewhere on the site), so it stays in the list.
const EXCLUDED_STATUSES = new Set(['cancelled', 'postponed'])

export interface TonightCheckEvent {
  start_date: string
  end_date:   string | null
  status:     string
}

// An event only counts as "finished" when there's positive evidence of
// that — an explicit end_date already in the past. The vast majority of
// rows are single showtimes with no stored end_date at all; for those,
// the event stays visible for the rest of its own Europe/London calendar
// day rather than being hidden by an invented fixed show-length (e.g.
// assuming every concert lasts exactly 3 hours), which would risk hiding
// something that's genuinely still on.
export function isEventFinished(event: Pick<TonightCheckEvent, 'end_date'>, now: number): boolean {
  if (!event.end_date) return false
  return new Date(event.end_date).getTime() < now
}

// The full "belongs in Tonight" test: falls on today's London calendar
// day, isn't cancelled/postponed, and isn't already finished.
export function isTonightEvent(
  event: TonightCheckEvent,
  now: number,
  window: DateWindow,
): boolean {
  if (EXCLUDED_STATUSES.has(event.status)) return false
  const start = new Date(event.start_date).getTime()
  if (start < new Date(window.startISO).getTime()) return false
  if (start >= new Date(window.endISO).getTime()) return false
  if (isEventFinished(event, now)) return false
  return true
}

// Soonest first — Tonight is "what's on, in order", same ordering
// philosophy as the fixed fetchEventsThisWeek sort.
export function sortTonightEvents<T extends { start_date: string }>(events: T[]): T[] {
  return [...events].sort((a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime())
}
