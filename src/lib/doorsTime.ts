// Doors times from listing text. Ticketmaster's UK feed never fills doorsTimes, but the event info often says
// "DOORS: 19:00 START: 20:00", "Doors open at 9pm" or "Doors 6pm Show 7pm" (about 1,400 upcoming events, Nov 2026).
// "Set times" are our best Google searches, so the doors time matters. A time is only used when it makes sense for
// the show: on the same day, no later than the start and at most 5 hours before it. Pure module for node --test.

const DOORS = /\bdoors?\b(?:\s*(?:open(?:s|ing)?|:|-|–|—|at|from|\|))*\s*(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)?/i

function londonParts(iso: string): { date: string; minutes: number } {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
  const p = Object.fromEntries(f.formatToParts(new Date(iso)).map(x => [x.type, x.value]))
  return { date: `${p.year}-${p.month}-${p.day}`, minutes: Number(p.hour) * 60 + Number(p.minute) }
}

/** The doors time as a UTC ISO string on the event's day, or null when the text has no sensible one. */
export function parseDoorsTime(text: string | null | undefined, startIso: string): string | null {
  const m = DOORS.exec(String(text ?? ''))
  if (!m) return null
  let hour = Number(m[1])
  const minute = m[2] ? Number(m[2]) : 0
  const ampm = m[3]?.toLowerCase()
  if (!ampm && !m[2]) return null                         // "Doors 7" alone is too vague
  if (hour > 23 || minute > 59) return null
  if (ampm === 'pm' && hour < 12) hour += 12
  if (ampm === 'am' && hour === 12) hour = 0
  const start = londonParts(startIso)
  if (!ampm && hour < 12 && start.minutes >= 12 * 60 && hour + 12 <= 23) hour += 12   // "Doors 7:30" for an evening show
  const doors = hour * 60 + minute
  if (start.minutes !== 0 && (doors > start.minutes || start.minutes - doors > 300)) return null
  // Same London day as the show; the offset (GMT/BST) is the show's own.
  const startMs = Date.parse(startIso)
  return new Date(startMs - (start.minutes - doors) * 60_000).toISOString()
}
