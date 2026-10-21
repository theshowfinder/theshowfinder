// Ticketmaster title suffixes that describe the production, not the show, and read as
// raw feed data on the page: "Mamma Mia! (International)", "Oliver (Touring)". The
// stored title (and slug / matching) is left alone; only the displayed text changes.
const PRODUCTION_SUFFIX = /\s*[([]\s*(?:international|touring|non[\s-]?touring|uk\s*(?:&\s*ireland\s*)?tour(?:\s*\d{4})?|original\s+london\s+cast)\s*[)\]]\s*$/i

// A feed typo that leaves a stray "202" in front of a title ("202 BetMGM Premier League Darts").
const STRAY_YEAR_PREFIX = /^\s*202\s+(?=[A-Za-z])/

export function displayTitle(title: string): string {
  const cleaned = title.replace(PRODUCTION_SUFFIX, '').replace(STRAY_YEAR_PREFIX, '').trim()
  return cleaned || title
}

/**
 * Site-wide rule: an event whose start is exactly midnight London time has NO known start time
 * (Ticketmaster date-only listings, tourist-board pages that only give a day). Never show "00:00".
 */
export function isTimeUnknown(iso: string): boolean {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return true
  const t = d.toLocaleTimeString('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit', hour12: false })
  return t === '00:00' || t === '24:00'
}

/** "19:30" in London time, or null when the time is not known (midnight). */
export function londonTimeOrNull(iso: string): string | null {
  if (isTimeUnknown(iso)) return null
  return new Date(iso).toLocaleTimeString('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit', hour12: false })
}

/** " · 19:30" in London time, or '' when the feed gave no real time (midnight). */
export function londonTimeSuffix(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const t = d.toLocaleTimeString('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit', hour12: false })
  return t === '00:00' ? '' : ` · ${t}`
}

/** "Venue, City" without repeating the city when the venue name already carries it ("Vaillant Live, Derby"). */
export function venueLabel(name: string | null | undefined, city: string | null | undefined): string {
  const n = (name ?? '').trim()
  const c = (city ?? '').trim()
  if (!n) return c
  if (!c) return n
  return n.toLowerCase().includes(c.toLowerCase()) ? n : `${n}, ${c}`
}
