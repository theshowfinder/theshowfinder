// Finding people who sell event tickets: Eventbrite's public city listings name each event's organiser, and the
// organiser's public profile gives their own website and social links. We only collect business contact routes
// (their website, Instagram, Facebook); the email address, if any, comes from their own website, never from
// Eventbrite. Pure module (no '@/' imports) so it runs under node --test.

export const EVENTBRITE = 'https://www.eventbrite.co.uk'

/** Our city name -> Eventbrite's location slug: "Milton Keynes" -> "united-kingdom--milton-keynes". */
export function eventbriteCitySlug(city: string): string {
  return `united-kingdom--${city.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`
}

export function citySearchUrl(city: string, page: number): string {
  return `${EVENTBRITE}/d/${eventbriteCitySlug(city)}/all-events/${page > 1 ? `?page=${page}` : ''}`
}

export function organiserUrl(id: string): string {
  return `${EVENTBRITE}/o/${id}`
}

/** The JSON Eventbrite puts in the page for its own app (window.__SERVER_DATA__ = {...}). */
export function serverData(html: string): Record<string, unknown> | null {
  const marker = '__SERVER_DATA__ = '
  const i = html.indexOf(marker)
  if (i < 0) return null
  const start = i + marker.length
  // Walk to the matching closing brace (strings may contain braces).
  let depth = 0, inStr = false, esc = false
  for (let j = start; j < html.length; j++) {
    const ch = html[j]
    if (inStr) {
      if (esc) esc = false
      else if (ch === '\\') esc = true
      else if (ch === '"') inStr = false
      continue
    }
    if (ch === '"') inStr = true
    else if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) {
        try { return JSON.parse(html.slice(start, j + 1)) as Record<string, unknown> } catch { return null }
      }
    }
  }
  return null
}

export interface ListedEvent {
  organiserId: string
  title: string
  url: string
  startDate: string | null
  venueName: string | null
  town: string | null
  postcode: string | null
}

type Loose = any // eslint-disable-line @typescript-eslint/no-explicit-any

/** Next.js page data (<script id="__NEXT_DATA__" type="application/json">), used on organiser profiles. */
export function nextData(html: string): Record<string, unknown> | null {
  const m = html.match(/<script id="__NEXT_DATA__" type="application\/json"[^>]*>([\s\S]*?)<\/script>/)
  if (!m) return null
  try { return JSON.parse(m[1]) as Record<string, unknown> } catch { return null }
}

/** Events on one city listing page, with the organiser behind each. Online events are left out. */
export function listedEvents(html: string): { events: ListedEvent[]; pageCount: number } {
  const d = serverData(html) as Loose
  const res = d?.search_data?.events
  const rows: Loose[] = [...(res?.results ?? []), ...(res?.promoted_results ?? [])]
  const events: ListedEvent[] = []
  for (const r of rows) {
    const organiserId = String(r?.primary_organizer_id ?? '')
    if (!/^\d{5,}$/.test(organiserId) || r?.is_online_event || r?.is_cancelled) continue
    const addr = r?.primary_venue?.address ?? {}
    if (addr.country && addr.country !== 'GB') continue
    events.push({
      organiserId,
      title: String(r?.name ?? '').slice(0, 200),
      url: String(r?.url ?? ''),
      startDate: r?.start_date ?? null,
      venueName: r?.primary_venue?.name ?? null,
      town: addr.city ?? null,
      postcode: addr.postal_code ?? null,
    })
  }
  return { events, pageCount: Number(res?.pagination?.page_count ?? 1) || 1 }
}

export interface OrganiserProfile {
  id: string
  name: string
  website: string | null
  facebook: string | null
  instagram: string | null
  twitter: string | null
  totalEvents: number | null
  attendeesHosted: string | null
  profileUrl: string | null
}

const socialUrl = (v: unknown, base: string): string | null => {
  const s = typeof v === 'string' ? v.trim() : ''
  if (!s) return null
  if (/^https?:\/\//i.test(s)) return s
  return `${base}${s.replace(/^@/, '')}`
}

/** The organiser's public profile: name, their own website and socials, how many events they've run. */
export function organiserProfile(html: string): OrganiserProfile | null {
  const d = { a: nextData(html), b: serverData(html) } as Loose
  // The profile sits under "organizer" somewhere in the page data; find the first one with an id and a name.
  let found: Loose = null
  const walk = (o: Loose, depth: number) => {
    if (found || !o || typeof o !== 'object' || depth > 10) return
    if (o.organizer && typeof o.organizer === 'object' && o.organizer.id && o.organizer.name) { found = o.organizer; return }
    for (const v of Object.values(o)) walk(v, depth + 1)
  }
  walk(d, 0)
  if (!found) return null
  const o = found as Loose
  const s = o.socials ?? {}
  return {
    id: String(o.id),
    name: String(o.name).slice(0, 150),
    website: socialUrl(s.website ?? o.website, 'https://'),
    facebook: socialUrl(s.facebook ?? s.facebook_page, 'https://www.facebook.com/'),
    instagram: socialUrl(s.instagram ?? s.instagram_page, 'https://www.instagram.com/'),
    twitter: socialUrl(s.x ?? s.twitter ?? s.twitter_page, 'https://x.com/'),
    totalEvents: Number.isFinite(Number(o.metrics?.totalEvents)) ? Number(o.metrics.totalEvents) : null,
    attendeesHosted: o.metrics?.attendeesHosted ? String(o.metrics.attendeesHosted) : null,
    profileUrl: o.profilePageUrl ? String(o.profilePageUrl) : null,
  }
}

/** A "website" that is really a social page, a link-in-bio or a ticket site can't be read for a contact email. */
export function isReadableWebsite(url: string | null | undefined): boolean {
  if (!url) return false
  let host = ''
  try { host = new URL(url).hostname.toLowerCase().replace(/^www\./, '') } catch { return false }
  return !/(^|\.)(facebook|fb|instagram|twitter|x|tiktok|linktr|linktree|beacons|eventbrite|skiddle|fatsoma|ticketsource|tickettailor|ticketmaster|seetickets|dice|youtube|soundcloud|spotify|bandcamp|google|wix|bit)\.(com|co\.uk|me|ee|ly|uk|fm|io|ai|site)$/.test(host)
}

/** Where to send someone if their website has no email: their Instagram or Facebook. */
export function socialFromWebsite(url: string | null | undefined): { instagram?: string; facebook?: string } {
  if (!url) return {}
  if (/instagram\.com\//i.test(url)) return { instagram: url }
  if (/facebook\.com\/|fb\.com\//i.test(url)) return { facebook: url }
  return {}
}
