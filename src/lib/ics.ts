// Add-to-calendar helpers: an .ics file (Apple/Outlook/most apps) and a Google
// Calendar link. Start times are stored as UTC instants, so no time-zone
// definitions are needed in the file.
//
// Pure module (no '@/' imports) so it runs under `node --test`.

export interface CalendarEvent {
  uid: string
  title: string
  startISO: string
  /** Defaults to 3 hours; real end times are rarely known. */
  durationHours?: number
  location?: string | null
  description?: string | null
  url?: string | null
  /** Adds a pop-up reminder this many minutes before the start (e.g. tickets on sale). */
  alarmMinutesBefore?: number
}

const DEFAULT_HOURS = 3

function pad(n: number): string { return String(n).padStart(2, '0') }

// 20261017T183000Z
export function icsUtc(d: Date): string {
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
}

// Midnight in London means the time was never known: treat as all-day.
export function isAllDay(startISO: string): boolean {
  const d = new Date(startISO)
  const hm = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit', hour12: false }).format(d)
  return hm === '00:00' || hm === '24:00'
}

function londonDateCompact(d: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
  return parts.replace(/-/g, '')
}

export function icsEscape(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')
}

// RFC 5545: lines are at most 75 octets; continuation lines start with a space.
export function foldLine(line: string): string {
  const enc = new TextEncoder()
  if (enc.encode(line).length <= 75) return line
  const out: string[] = []
  let cur = ''
  let curBytes = 0
  let limit = 75
  for (const ch of line) {
    const b = enc.encode(ch).length
    if (curBytes + b > limit) {
      out.push(cur)
      cur = ''
      curBytes = 0
      limit = 74
    }
    cur += ch
    curBytes += b
  }
  if (cur) out.push(cur)
  return out.join('\r\n ')
}

function veventLines(ev: CalendarEvent, now: Date): string[] {
  const start = new Date(ev.startISO)
  const hours = ev.durationHours ?? DEFAULT_HOURS
  const end = new Date(start.getTime() + hours * 3600_000)
  const allDay = isAllDay(ev.startISO)
  return [
    'BEGIN:VEVENT',
    `UID:${ev.uid}@theshowfinder.com`,
    `DTSTAMP:${icsUtc(now)}`,
    allDay ? `DTSTART;VALUE=DATE:${londonDateCompact(start)}` : `DTSTART:${icsUtc(start)}`,
    allDay ? `DTEND;VALUE=DATE:${londonDateCompact(new Date(start.getTime() + 24 * 3600_000))}` : `DTEND:${icsUtc(end)}`,
    `SUMMARY:${icsEscape(ev.title)}`,
    ...(ev.location ? [`LOCATION:${icsEscape(ev.location)}`] : []),
    ...(ev.description ? [`DESCRIPTION:${icsEscape(ev.description)}`] : []),
    ...(ev.url ? [`URL:${ev.url}`] : []),
    ...(ev.alarmMinutesBefore != null && !allDay
      ? ['BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsEscape(ev.title)}`, `TRIGGER:-PT${Math.max(0, Math.round(ev.alarmMinutesBefore))}M`, 'END:VALARM']
      : []),
    'END:VEVENT',
  ]
}

export function buildIcs(ev: CalendarEvent, now: Date = new Date()): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//TheShowFinder//Events//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    ...veventLines(ev, now),
    'END:VCALENDAR',
  ]
  return lines.map(foldLine).join('\r\n') + '\r\n'
}

/** A subscribable calendar (many events). Calendar apps re-fetch it on their own schedule. */
export function buildIcsFeed(
  feed: { name: string; description?: string; events: CalendarEvent[] },
  now: Date = new Date(),
): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//TheShowFinder//Calendar Feed//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${icsEscape(feed.name)}`,
    `NAME:${icsEscape(feed.name)}`,
    ...(feed.description ? [`X-WR-CALDESC:${icsEscape(feed.description)}`] : []),
    'X-WR-TIMEZONE:Europe/London',
    'REFRESH-INTERVAL;VALUE=DURATION:PT6H',
    'X-PUBLISHED-TTL:PT6H',
    ...feed.events.flatMap(ev => veventLines(ev, now)),
    'END:VCALENDAR',
  ]
  return lines.map(foldLine).join('\r\n') + '\r\n'
}

export function googleCalendarUrl(ev: CalendarEvent): string {
  const start = new Date(ev.startISO)
  const end = new Date(start.getTime() + (ev.durationHours ?? DEFAULT_HOURS) * 3600_000)
  const dates = isAllDay(ev.startISO)
    ? `${londonDateCompact(start)}/${londonDateCompact(new Date(start.getTime() + 24 * 3600_000))}`
    : `${icsUtc(start)}/${icsUtc(end)}`
  const params = new URLSearchParams({ action: 'TEMPLATE', text: ev.title, dates })
  if (ev.location) params.set('location', ev.location)
  const details = [ev.description, ev.url].filter(Boolean).join('\n\n')
  if (details) params.set('details', details)
  return `https://calendar.google.com/calendar/render?${params.toString()}`
}
