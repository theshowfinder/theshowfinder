// Ticketmaster title suffixes that describe the production, not the show, and read as
// raw feed data on the page: "Mamma Mia! (International)", "Oliver (Touring)". The
// stored title (and slug / matching) is left alone; only the displayed text changes.
const PRODUCTION_SUFFIX = /\s*[([]\s*(?:international|touring|non[\s-]?touring|uk\s*(?:&\s*ireland\s*)?tour(?:\s*\d{4})?|original\s+london\s+cast)\s*[)\]]\s*$/i

export function displayTitle(title: string): string {
  const cleaned = title.replace(PRODUCTION_SUFFIX, '').trim()
  return cleaned || title
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
