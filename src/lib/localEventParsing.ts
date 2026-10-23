// Pure helpers for the local-events sweep (council / venue / tourist-board "what's on" sites):
// reading schema.org Event markup, sitemaps, and choosing which pages to fetch next.
// No network or database in here, so every rule is unit-tested (localEventParsing.test.ts).

export interface SchemaEvent {
  '@type'?: string | string[]
  name?: string
  description?: string
  image?: unknown
  startDate?: string
  endDate?: string
  eventStatus?: string
  url?: string
  location?: unknown
  offers?: unknown
}

function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#039;|&apos;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
}

export function cleanText(s: string | undefined | null): string | null {
  if (!s) return null
  const out = decodeEntities(String(s)).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  return out || null
}

function isEventType(t: unknown): boolean {
  const list = Array.isArray(t) ? t : [t]
  return list.some(x => typeof x === 'string' && /Event$/.test(x) && !/^(EventSeries|EventVenue|EventReservation)$/.test(x))
}

/** Every schema.org Event (any subtype: MusicEvent, TheaterEvent, Festival…) in a page's JSON-LD, including @graph and arrays. */
export function extractEventsJsonLd(html: string): SchemaEvent[] {
  const out: SchemaEvent[] = []
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html))) {
    let parsed: unknown
    try { parsed = JSON.parse(m[1].trim()) } catch { continue }
    const stack: unknown[] = [parsed]
    let guard = 0
    while (stack.length && guard++ < 500) {
      const x = stack.pop()
      if (Array.isArray(x)) { stack.push(...x); continue }
      if (!x || typeof x !== 'object') continue
      const obj = x as Record<string, unknown>
      if (isEventType(obj['@type']) && typeof obj.startDate === 'string') out.push(obj as SchemaEvent)
      for (const k of ['@graph', 'mainEntity', 'itemListElement', 'item']) if (obj[k]) stack.push(obj[k])
    }
  }
  return out
}

const LONDON = 'Europe/London'

function londonOffsetMinutes(utcMs: number): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: LONDON, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(utcMs))
  const get = (t: string) => Number(parts.find(p => p.type === t)?.value)
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'))
  return Math.round((asUtc - Math.floor(utcMs / 1000) * 1000) / 60000)
}

/**
 * schema.org startDate -> UTC ISO. A value with a Z / offset is taken as written. A value with no zone
 * ("2026-10-24T19:30:00") is UK wall-clock time, not UTC. A bare date ("2026-10-24") becomes MIDNIGHT UK
 * time: the site-wide rule is that a midnight start means "time not known", so it is shown as a date only
 * (never a made-up "12:00" or "00:00"). A listed time of exactly 00:00 is treated the same way.
 */
export function startDateToIso(raw: string | undefined | null): string | null {
  if (!raw) return null
  const s = raw.trim()
  // "2026-10-24T00:00:00Z" / "+00:00" is how many sites write a date with no time. Read as UTC it lands at 1am
  // in British Summer Time (Fever walking tours on yorkshire.com showed as 01:00): treat it as the bare date.
  const utcMidnight = s.match(/^(\d{4}-\d{2}-\d{2})T00:00(?::00(?:\.0+)?)?(?:[zZ]|[+-]00:?00)$/)
  if (utcMidnight) return startDateToIso(utcMidnight[1])
  if (/[zZ]$|[+-]\d{2}:?\d{2}$/.test(s) && /T/.test(s)) {
    const d = new Date(s)
    return Number.isNaN(d.getTime()) ? null : d.toISOString()
  }
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/)
  if (!m) { const d = new Date(s); return Number.isNaN(d.getTime()) ? null : d.toISOString() }
  const [y, mo, da] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const hasTime = m[4] != null
  const [h, mi, se] = hasTime ? [Number(m[4]), Number(m[5]), Number(m[6] ?? 0)] : [0, 0, 0]
  const guess = Date.UTC(y, mo - 1, da, h, mi, se)
  let utc = guess - londonOffsetMinutes(guess) * 60000
  utc = guess - londonOffsetMinutes(utc) * 60000   // second pass settles the hour around a clock change
  return new Date(utc).toISOString()
}

/** True when an ISO start is midnight UK time, i.e. the listing gave no start time. */
export function isUkMidnight(iso: string): boolean {
  const ms = Date.parse(iso)
  if (!Number.isFinite(ms)) return false
  const local = ms + londonOffsetMinutes(ms) * 60000
  return local % 86_400_000 === 0
}

/** UTC ISO of midnight UK time at the start of the UK day containing `now`. */
export function startOfUkDayIso(now: number): string {
  const local = now + londonOffsetMinutes(now) * 60000
  const midnightLocal = local - (((local % 86_400_000) + 86_400_000) % 86_400_000)
  let utc = midnightLocal - londonOffsetMinutes(midnightLocal) * 60000
  utc = midnightLocal - londonOffsetMinutes(utc) * 60000
  return new Date(utc).toISOString()
}

/**
 * Has this event already happened? A timed event is past 6 hours after it starts; a date-only one
 * (midnight UK) stays current for the whole of its day, so a market "today" is still listed today.
 */
export function isPastStart(startIso: string, now: number): boolean {
  const t = Date.parse(startIso)
  if (!Number.isFinite(t)) return true
  if (isUkMidnight(startIso)) return startIso < startOfUkDayIso(now)
  return t < now - 6 * 3_600_000
}

export interface ParsedLocation {
  venueName: string | null
  address: string | null
  city: string | null
  postcode: string | null
  lat: number | null
  lng: number | null
}

const POSTCODE_RE = /\b([A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2})\b/i
const COUNTRY_PARTS = /^(united kingdom|uk|gb|great britain|england|scotland|wales|northern ireland)$/i

/** "60 Low Petergate, York, YO1 7HZ, United Kingdom" -> street, town, postcode. A lone "Portlethen, AB12 4PT" is a town. */
export function parseAddressString(raw: string): { address: string | null; city: string | null; postcode: string | null } {
  const text = cleanText(raw) ?? ''
  const pc = text.match(POSTCODE_RE)?.[1]?.toUpperCase().replace(/\s+/, ' ') ?? null
  const parts = text.replace(POSTCODE_RE, '').split(',').map(p => p.trim()).filter(p => p && !COUNTRY_PARTS.test(p))
  if (parts.length === 0) return { address: null, city: null, postcode: pc }
  if (parts.length === 1) return { address: null, city: parts[0], postcode: pc }
  return { address: parts.slice(0, -1).join(', '), city: parts[parts.length - 1], postcode: pc }
}

export function parseLocation(loc: unknown): ParsedLocation {
  const first = Array.isArray(loc) ? loc[0] : loc
  const blank: ParsedLocation = { venueName: null, address: null, city: null, postcode: null, lat: null, lng: null }
  if (!first) return blank
  if (typeof first === 'string') return { ...blank, venueName: cleanText(first) }
  const o = first as Record<string, unknown>
  const num = (v: unknown) => (v == null || v === '' || Number.isNaN(Number(v)) ? null : Number(v))
  const str = (v: unknown) => (typeof v === 'string' ? cleanText(v) : null)

  // Some sites put a whole map-place object in "name" ({name, city, post_code, lat, lng…}).
  const nameObj = o.name && typeof o.name === 'object' ? (o.name as Record<string, unknown>) : null
  const addr = o.address
  const a = (addr && typeof addr === 'object' ? addr : {}) as Record<string, unknown>
  const geo = (o.geo && typeof o.geo === 'object' ? o.geo : {}) as Record<string, unknown>
  const fromString = typeof addr === 'string' ? parseAddressString(addr) : null

  const street = str(a.streetAddress) ?? fromString?.address ?? (nameObj ? [str(nameObj.street_number), str(nameObj.street_name)].filter(Boolean).join(' ') || null : null)
  return {
    venueName: nameObj ? str(nameObj.name) : str(o.name),
    address:   street,
    city:      str(a.addressLocality) ?? fromString?.city ?? (nameObj ? str(nameObj.city) : null),
    postcode:  str(a.postalCode) ?? fromString?.postcode ?? (nameObj ? str(nameObj.post_code) : null),
    lat:       num(o.latitude ?? geo.latitude ?? nameObj?.lat),
    lng:       num(o.longitude ?? geo.longitude ?? nameObj?.lng),
  }
}

export function parseImage(img: unknown, baseUrl: string): string | null {
  const first = Array.isArray(img) ? img[0] : img
  const raw = typeof first === 'string' ? first : first && typeof first === 'object' ? (first as { url?: unknown }).url : null
  if (typeof raw !== 'string' || !raw.trim()) return null
  try { return new URL(raw.trim(), baseUrl).toString() } catch { return null }
}

export function parseOfferUrl(offers: unknown): string | null {
  const first = Array.isArray(offers) ? offers[0] : offers
  const u = first && typeof first === 'object' ? (first as { url?: unknown }).url : null
  return typeof u === 'string' && /^https?:\/\//.test(u) ? u : null
}

export type LocalEventStatus = 'upcoming' | 'cancelled' | 'postponed'
export function mapSchemaStatus(raw: string | undefined | null): LocalEventStatus {
  if (!raw) return 'upcoming'
  if (/cancel/i.test(raw)) return 'cancelled'
  if (/postpone/i.test(raw)) return 'postponed'
  return 'upcoming'
}

export interface ScrapedLocalEvent {
  title: string
  description: string | null
  imageUrl: string | null
  startDate: string
  status: LocalEventStatus
  sourceUrl: string
  venueName: string
  address: string | null
  city: string
  postcode: string | null
  lat: number | null
  lng: number | null
  ticketUrl: string
}

/** One page -> one event, or null when the page carries no usable Event markup (recurring listings, articles, categories). */
export function eventFromPage(html: string, pageUrl: string, fallbackCity: string): ScrapedLocalEvent | null {
  const ev = extractEventsJsonLd(html).find(e => e.name && e.startDate)
  if (!ev) return null
  const start = startDateToIso(ev.startDate)
  const title = cleanText(ev.name)
  if (!start || !title) return null
  const loc = parseLocation(ev.location)
  const canonical = typeof ev.url === 'string' && /^https?:\/\//.test(ev.url) ? ev.url : pageUrl
  return {
    title,
    description: cleanText(ev.description)?.slice(0, 1200) ?? null,
    imageUrl: parseImage(ev.image, pageUrl),
    startDate: start,
    status: mapSchemaStatus(ev.eventStatus),
    sourceUrl: pageUrl,   // the page we fetched is the key, so a re-fetch always updates the same row
    venueName: loc.venueName ?? fallbackCity,
    address: loc.address,
    city: loc.city ?? fallbackCity,
    postcode: loc.postcode,
    lat: loc.lat, lng: loc.lng,
    ticketUrl: parseOfferUrl(ev.offers) ?? canonical,
  }
}

// ── Sitemaps ────────────────────────────────────────────────────────────────

export interface SitemapEntry { url: string; lastmod: string | null }

export function parseSitemap(xml: string): { isIndex: boolean; entries: SitemapEntry[] } {
  const isIndex = /<sitemapindex/i.test(xml)
  const entries: SitemapEntry[] = []
  const re = /<(url|sitemap)>\s*<loc>\s*([^<]+?)\s*<\/loc>(?:\s*<lastmod>\s*([^<]+?)\s*<\/lastmod>)?/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(xml))) entries.push({ url: decodeEntities(m[2]), lastmod: m[3] ? decodeEntities(m[3]) : null })
  return { isIndex, entries }
}

export function matchesDetailPattern(url: string, pattern: string): boolean {
  let path: string
  try { path = new URL(url).pathname } catch { return false }
  try { return new RegExp(pattern).test(path) } catch { return false }
}

// ── What to fetch next ──────────────────────────────────────────────────────

export interface LedgerRow { state: 'event' | 'past' | 'noevent' | 'gone'; checked_at: string; start_date: string | null }

/** The numeric id in an event page address ("/event/slug/176524101/" or "/events/3163019-slug"), or 0. */
export function pageId(url: string): number {
  let path = ''
  try { path = new URL(url).pathname } catch { return 0 }
  // /slug/176524101/ · /3163019-slug · /slug-p1069321 (NewMind) · /slug-29102026-3162662/ (Visit Glasgow)
  const m = path.match(/-p(\d{4,})\/?$/) ?? path.match(/-\d{8}-(\d{4,})\/?$/) ?? path.match(/\/(\d{4,})\/?$/) ?? path.match(/\/(\d{4,})-[^/]*$/)
  return m ? Number(m[1]) : 0
}

const DAY = 86_400_000
/** How long a page in each state is left alone before it is looked at again. */
export const RECHECK_AFTER_DAYS: Record<LedgerRow['state'], number> = { event: 3, noevent: 21, gone: 60, past: 365 }

/**
 * Order the discovered pages for this run: pages never seen first (so a big sitemap is worked through once, with up to
 * 30% of the run held back for known live events that are due a refresh), then stale non-events. 'past' events never come back.
 * An 'event' whose start has since passed is not re-fetched either.
 */
export function chooseUrlsToFetch(
  discovered: SitemapEntry[],
  ledger: Map<string, LedgerRow>,
  now: number,
  limit: number,
): string[] {
  const fresh: SitemapEntry[] = []
  const due: { url: string; age: number }[] = []
  for (const e of discovered) {
    const row = ledger.get(e.url)
    if (!row) { fresh.push(e); continue }
    if (row.state === 'event' && row.start_date && new Date(row.start_date).getTime() < now - 6 * 3_600_000) continue
    const age = now - new Date(row.checked_at).getTime()
    if (age >= RECHECK_AFTER_DAYS[row.state] * DAY) due.push({ url: e.url, age })
  }
  // Never-seen pages: most recently modified day first (sitemaps with real lastmod dates put live events first), then the
  // highest id first (ids rise as events are added, so for a 14,000-page sitemap whose lastmod is "today" for every page,
  // the newest listings - the ones most likely to be upcoming - are read before the archive).
  fresh.sort((a, b) => (b.lastmod ?? '').slice(0, 10).localeCompare((a.lastmod ?? '').slice(0, 10)) || pageId(b.url) - pageId(a.url))
  due.sort((a, b) => b.age - a.age)
  // A big never-seen backlog must not starve refreshes: up to 30% of each run is kept for pages that are due a re-check,
  // and any share not needed by one list goes to the other.
  const max = Math.max(0, limit)
  const dueSlots = Math.min(due.length, Math.floor(max * 0.3))
  const freshTake = fresh.slice(0, max - dueSlots)
  const dueTake = due.slice(0, max - freshTake.length)
  return [...freshTake.map(e => e.url), ...dueTake.map(d => d.url)]
}

// ── Same show listed twice ──────────────────────────────────────────────────

export function normaliseTitle(t: string): string {
  return t.toLowerCase().replace(/&/g, ' and ').replace(/\b(live|tickets?|tour|the)\b/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim()
}


// ── robots.txt ───────────────────────────────────────────────────────────────

export interface RobotsRules { allow: string[]; disallow: string[]; crawlDelaySec: number | null }

/**
 * The rules that apply to our crawler: the group naming "theshowfinderbot" if there is one, otherwise the "*" group.
 * Only Allow / Disallow path prefixes ("*" and "$" wildcards supported) and Crawl-delay are used.
 */
export function parseRobots(text: string, agentToken = 'theshowfinderbot'): RobotsRules {
  const groups: Array<{ agents: string[]; rules: RobotsRules }> = []
  let current: { agents: string[]; rules: RobotsRules } | null = null
  let lastWasAgent = false
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, '').trim()
    const m = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/)
    if (!m) continue
    const key = m[1].toLowerCase()
    const value = m[2].trim()
    if (key === 'user-agent') {
      if (!current || !lastWasAgent) { current = { agents: [], rules: { allow: [], disallow: [], crawlDelaySec: null } }; groups.push(current) }
      current.agents.push(value.toLowerCase())
      lastWasAgent = true
      continue
    }
    lastWasAgent = false
    if (!current) continue
    if (key === 'disallow' && value) current.rules.disallow.push(value)
    else if (key === 'allow' && value) current.rules.allow.push(value)
    else if (key === 'crawl-delay') { const n = Number(value); if (Number.isFinite(n) && n > 0) current.rules.crawlDelaySec = n }
  }
  const own = groups.find(g => g.agents.some(a => a !== '*' && agentToken.includes(a)))
  const star = groups.find(g => g.agents.includes('*'))
  return (own ?? star)?.rules ?? { allow: [], disallow: [], crawlDelaySec: null }
}

function robotsPatternMatches(pattern: string, path: string): number {
  const anchored = pattern.endsWith('$')
  const body = anchored ? pattern.slice(0, -1) : pattern
  const re = new RegExp('^' + body.split('*').map(p => p.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*') + (anchored ? '$' : ''))
  return re.test(path) ? body.replace(/\*/g, '').length : -1
}

/** Longest matching rule wins; Allow wins a tie. */
export function robotsAllows(rules: RobotsRules, pathAndQuery: string): boolean {
  let best = -1, allowed = true
  for (const p of rules.disallow) { const n = robotsPatternMatches(p, pathAndQuery); if (n > best) { best = n; allowed = false } }
  for (const p of rules.allow) { const n = robotsPatternMatches(p, pathAndQuery); if (n >= best && n >= 0) { best = n; allowed = true } }
  return allowed
}

// ── Simpleview event data ────────────────────────────────────────────────────
// Visit Manchester, Bristol, Southampton, Birmingham, Belfast, Liverpool, Portsmouth and other tourism sites run on
// the Simpleview platform. Their schema.org data gives only the date and an area ("TRAFFORD", "Central Bristol"); the
// page draws the start time, the venue and the booking link with a script, from a `var data = {...}` block that is in
// the page we already fetch. Reading it gives the real time (Mk, 12 Mar 2027: 21:00), venue ("O2 Victoria
// Warehouse", M17 1AB) and booking link. Found 23 Oct 2026: about 2,600 local listings had no time because of this.

export interface SimpleviewDetails {
  /** "HH:MM" UK wall-clock start for `date`, when the listing gives one. */
  time: string | null
  venueName: string | null
  address: string | null
  city: string | null
  postcode: string | null
  lat: number | null
  lng: number | null
  bookingUrl: string | null
}

/** The JSON object that starts at `start` (a "{"), read with strings respected. */
function jsonObjectAt(text: string, start: number): unknown {
  let depth = 0, inString = false, escaped = false
  for (let i = start; i < text.length; i++) {
    const c = text[i]
    if (inString) {
      if (escaped) escaped = false
      else if (c === '\\') escaped = true
      else if (c === '"') inString = false
      continue
    }
    if (c === '"') inString = true
    else if (c === '{') depth++
    else if (c === '}' && --depth === 0) {
      try { return JSON.parse(text.slice(start, i + 1)) } catch { return null }
    }
  }
  return null
}

type SvOpening = { startdate?: string; enddate?: string; days?: Array<{ day?: number; open?: boolean; times?: Array<{ timeopen?: string }> }> }
type SvData = { latitude?: number; longitude?: number; linkUrl?: string; openings?: SvOpening[]; udfs?: Array<{ name?: string; value?: unknown; value_string?: string }> }

/** Start time, venue, address and booking link from a Simpleview page for the show on `date` (YYYY-MM-DD). */
export function simpleviewDetails(html: string, date: string): SimpleviewDetails | null {
  const at = html.indexOf('var data = {')
  if (at < 0) return null
  const data = jsonObjectAt(html, at + 'var data = '.length) as SvData | null
  if (!data || typeof data !== 'object') return null
  const udf = (name: string): string | null => {
    const u = (data.udfs ?? []).find(x => x?.name === name)
    const v = u ? (u.value_string ?? (typeof u.value === 'string' ? u.value : null)) : null
    return typeof v === 'string' && v.trim() ? v.trim() : null
  }
  // The opening that covers the date, and that weekday's first start time ("0001-01-01T21:00:00.000Z" = 21:00 local).
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay()
  let time: string | null = null
  for (const o of data.openings ?? []) {
    const from = (o.startdate ?? '').slice(0, 10), to = (o.enddate ?? o.startdate ?? '').slice(0, 10)
    if (!from || date < from || (to && date > to)) continue
    const dayRow = (o.days ?? []).find(d => d.day === weekday && d.open !== false) ?? ((o.days ?? []).length === 1 ? o.days![0] : undefined)
    const m = /T(\d{2}):(\d{2})/.exec(dayRow?.times?.[0]?.timeopen ?? '')
    if (m && !(m[1] === '00' && m[2] === '00')) { time = `${m[1]}:${m[2]}`; break }
  }
  const street = [udf('Address2'), udf('Address3')].filter(Boolean).join(', ') || null
  const booking = udf('Booking website') ?? (typeof data.linkUrl === 'string' ? data.linkUrl : null)
  return {
    time,
    venueName: udf('Address1'),
    address: [udf('Address1'), street].filter(Boolean).join(', ') || null,
    city: udf('City'),
    postcode: udf('Zip'),
    lat: typeof data.latitude === 'number' && data.latitude !== 0 ? data.latitude : null,
    lng: typeof data.longitude === 'number' && data.longitude !== 0 ? data.longitude : null,
    bookingUrl: booking && /^https?:\/\//.test(booking) ? booking : null,
  }
}

/**
 * Fill in what a local listing left out from its page's Simpleview data: the start time (only when the listing had
 * none), the real venue and postcode (only when the listing named just a town or area), and the booking link.
 */
export function withSimpleviewDetails(ev: ScrapedLocalEvent, html: string): ScrapedLocalEvent {
  const ukDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date(ev.startDate))
  const sv = simpleviewDetails(html, ukDay)
  if (!sv) return ev
  const out = { ...ev }
  if (sv.time && isUkMidnight(ev.startDate)) out.startDate = startDateToIso(`${ukDay}T${sv.time}:00`) ?? ev.startDate
  const venueIsArea = !ev.venueName || ev.venueName.trim().toLowerCase() === ev.city.trim().toLowerCase() || /^[A-Z\s&'-]+$/.test(ev.venueName.trim()) || /\b(central|north|south|east|west|greater)\b/i.test(ev.venueName)
  if (sv.venueName && venueIsArea) {
    out.venueName = sv.venueName
    out.address = sv.address ?? out.address
    out.postcode = sv.postcode ?? out.postcode
    if (sv.lat !== null && sv.lng !== null) { out.lat = sv.lat; out.lng = sv.lng }
  } else if (!out.postcode && sv.postcode) {
    out.postcode = sv.postcode
  }
  if (sv.bookingUrl) out.ticketUrl = sv.bookingUrl
  return out
}
