// Readers for local-event sites that publish NO machine-readable event data (no schema.org Event markup).
// Each reader takes one event page's HTML and returns the same ScrapedLocalEvent the JSON-LD reader does, or
// null when the page has no upcoming date. Pure functions (no network / database), unit-tested in
// localEventHtml.test.ts against the real markup of each site (checked 21 Oct 2026).
//
// Rules shared by every reader:
//  - The NEXT upcoming date is used (a page listing several sessions stays live until its last one).
//  - A date with no time is stored at midnight UK time, which the site shows as a date only.
//  - A run that has already started (e.g. an exhibition open since June) is skipped, as with JSON-LD pages.
//  - Missing venue falls back to the city, missing title or date means "not an event page".

import { cleanText, startDateToIso, startOfUkDayIso, parseAddressString, type ScrapedLocalEvent } from './localEventParsing.ts'

export type HtmlParser = 'newmind' | 'edinburgh' | 'glasgow' | 'leeds' | 'cardiff' | 'cambridge' | 'sheffield' | 'bournemouth'
export const HTML_PARSERS: readonly HtmlParser[] = ['newmind', 'edinburgh', 'glasgow', 'leeds', 'cardiff', 'cambridge', 'sheffield', 'bournemouth']
export function isHtmlParser(v: string | null | undefined): v is HtmlParser {
  return !!v && (HTML_PARSERS as readonly string[]).includes(v)
}

// ── Dates and times written for people ────────────────────────────────────────

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 }
type Ymd = [number, number, number]

function ymdFromWords(day: string, month: string, year: string): Ymd | null {
  const m = MONTHS[month.toLowerCase().slice(0, month.toLowerCase().startsWith('sept') ? 4 : 3)]
  const d = Number(day), y = Number(year)
  if (!m || !(d >= 1 && d <= 31) || !(y >= 2000 && y <= 2100)) return null
  return [y, m, d]
}

/**
 * "16th June 2025 - 30th June 2025", "Thu 29 Oct 2026", "19 Oct 2026 - 20 Oct 2026", "31 Oct  2026",
 * "16/06/2025", "2026-10-28" -> start (and end) day. A range written "1 - 3 Nov 2026" borrows the month/year.
 */
export function parseDateText(text: string | null | undefined): { start: Ymd; end: Ymd | null } | null {
  if (!text) return null
  const t = text.replace(/&nbsp;| /g, ' ').replace(/\s+/g, ' ').trim()
  const found: Ymd[] = []
  const wordRe = /(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,9})\.?,?\s+(\d{4})/g
  let m: RegExpExecArray | null
  while ((m = wordRe.exec(t))) { const v = ymdFromWords(m[1], m[2], m[3]); if (v) found.push(v) }
  if (!found.length) {
    const slash = /(\d{1,2})\/(\d{1,2})\/(\d{4})/g
    while ((m = slash.exec(t))) { const d = Number(m[1]), mo = Number(m[2]), y = Number(m[3]); if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) found.push([y, mo, d]) }
  }
  if (!found.length) {
    const iso = /(\d{4})-(\d{2})-(\d{2})/g
    while ((m = iso.exec(t))) found.push([Number(m[1]), Number(m[2]), Number(m[3])])
  }
  if (!found.length) {
    // "1 - 3 Nov 2026": a bare day before the dash
    const short = t.match(/^(\d{1,2})(?:st|nd|rd|th)?\s*[-–]\s*(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,9})\s+(\d{4})/)
    if (short) { const e = ymdFromWords(short[2], short[3], short[4]); if (e) return { start: [e[0], e[1], Number(short[1])], end: e } }
    return null
  }
  if (found.length === 1) {
    const lead = t.match(/^(\d{1,2})(?:st|nd|rd|th)?\s*[-–]\s*\d{1,2}(?:st|nd|rd|th)?\s+[A-Za-z]{3,9}/)
    if (lead) return { start: [found[0][0], found[0][1], Number(lead[1])], end: found[0] }
  }
  return { start: found[0], end: found.length > 1 ? found[1] : null }
}

/** First clock time in "7:30 pm", "12:00 pm - 5:30 pm", "19:00", "2pm", "10.30am" -> "19:30", else null. */
export function parseClock(text: string | null | undefined): string | null {
  if (!text) return null
  const t = text.replace(/&nbsp;| /g, ' ').toLowerCase()
  const m = t.match(/\b(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)\b/) ?? t.match(/\b(\d{1,2})[:.](\d{2})\b/)
  if (!m) return null
  let h = Number(m[1])
  const min = Number(m[2] ?? 0)
  const ap = m[3]
  if (ap === 'pm' && h < 12) h += 12
  if (ap === 'am' && h === 12) h = 0
  if (h > 23 || min > 59) return null
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`
}

function ymdKey(d: Ymd): string { return `${d[0]}-${String(d[1]).padStart(2, '0')}-${String(d[2]).padStart(2, '0')}` }

/** UK local day (+ optional "HH:MM") -> UTC ISO; no time = midnight UK = "time not known". */
export function ukIso(day: Ymd, time: string | null): string | null {
  return startDateToIso(time ? `${ymdKey(day)}T${time}:00` : ymdKey(day))
}

export interface Session { start: Ymd; end: Ymd | null; time: string | null }

/** The next session that has not started before today (UK); null when all are past or already running. */
export function nextSession(sessions: Session[], now: number): Session | null {
  const todayStart = startOfUkDayIso(now)   // UTC instant of midnight UK today
  const upcoming = sessions
    .map(s => ({ s, iso: ukIso(s.start, null) }))
    .filter((x): x is { s: Session; iso: string } => !!x.iso && x.iso >= todayStart)
    .sort((a, b) => a.iso.localeCompare(b.iso))
  return upcoming[0]?.s ?? null
}

// ── Small HTML helpers ──────────────────────────────────────────────────────────

function first(html: string, re: RegExp): string | null {
  const m = html.match(re)
  return m ? m[1] : null
}
function metaContent(html: string, prop: string): string | null {
  const re = new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]*content=["']([^"']*)["']|<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${prop}["']`, 'i')
  const m = html.match(re)
  return m ? (m[1] ?? m[2] ?? null) : null
}
function h1(html: string): string | null {
  return cleanText(first(html, /<h1[^>]*>([\s\S]*?)<\/h1>/i))
}
function titleFrom(html: string): string | null {
  const t = h1(html) ?? cleanText(metaContent(html, 'og:title'))
  return t ? t.replace(/\s*[|–-]\s*(Visit\s+\w+|Events in \w+)\s*$/i, '').trim() || null : null
}
function imageFrom(html: string, pageUrl: string): string | null {
  const raw = metaContent(html, 'og:image')
  if (!raw) return null
  try { return new URL(raw.replace(/&amp;/g, '&'), pageUrl).toString() } catch { return null }
}
function descriptionFrom(html: string): string | null {
  return cleanText(metaContent(html, 'og:description') ?? metaContent(html, 'description'))?.slice(0, 1200) ?? null
}
function textOf(fragment: string | null): string | null {
  return fragment ? cleanText(fragment) : null
}
const POSTCODE_RE = /\b([A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2})\b/i

interface Where { venueName: string | null; address: string | null; city: string | null; postcode: string | null; lat: number | null; lng: number | null }
const NOWHERE: Where = { venueName: null, address: null, city: null, postcode: null, lat: null, lng: null }

/** "Venue, 1 Street, Town, County, AB1 2CD" (or its lines) -> parts. */
function whereFromLines(lines: string[], townHint: string | null = null): Where {
  const parts = lines.map(l => cleanText(l)).filter((l): l is string => !!l)
  if (!parts.length) return NOWHERE
  const joined = parts.join(', ')
  const postcode = joined.match(POSTCODE_RE)?.[1]?.toUpperCase() ?? null
  const parsed = parseAddressString(joined)
  const firstPart = parts[0]
  const looksLikeStreet = /^\d/.test(firstPart) || POSTCODE_RE.test(firstPart)
  // A single name with no address ("The Burrell Collection") is the venue, not a town.
  if (parts.length === 1 && !postcode && !looksLikeStreet) return { ...NOWHERE, venueName: firstPart, city: townHint }
  return {
    venueName: looksLikeStreet || parts.length < 2 ? null : firstPart,
    address: parts.length > 1 ? parts.slice(looksLikeStreet ? 0 : 1, -1).filter(p => !POSTCODE_RE.test(p)).join(', ') || null : null,
    city: townHint ?? parsed.city,
    postcode,
    lat: null, lng: null,
  }
}

function build(html: string, pageUrl: string, fallbackCity: string, title: string | null, session: Session | null, where: Where): ScrapedLocalEvent | null {
  if (!title || !session) return null
  const start = ukIso(session.start, session.time)
  if (!start) return null
  const cancelled = /\bcancell?ed\b/i.test(title)
  return {
    title: title.replace(/^\s*cancell?ed\s*[:-]\s*/i, ''),
    description: descriptionFrom(html),
    imageUrl: imageFrom(html, pageUrl),
    startDate: start,
    status: cancelled ? 'cancelled' : 'upcoming',
    sourceUrl: pageUrl,
    venueName: where.venueName ?? fallbackCity,
    address: where.address,
    city: where.city ?? fallbackCity,
    postcode: where.postcode,
    lat: where.lat, lng: where.lng,
    ticketUrl: pageUrl,
  }
}

function sessionFromText(dateText: string | null, timeText: string | null): Session[] {
  const d = parseDateText(dateText)
  return d ? [{ start: d.start, end: d.end, time: parseClock(timeText) }] : []
}

// ── Site readers ────────────────────────────────────────────────────────────────

/**
 * The tourism platform used by Visit Nottinghamshire, Visit Plymouth, Visit Stoke, Visit Bradford, Visit Brighton,
 * Visit Exeter and Visit Bath (URLs end -p<id>). Each date is a <table class="dates ..."> with
 * <span class="date">(14 Nov 2026)</span> or a range, and <span class="from">14:00</span>. Venue and address are in
 * <div class="node address">; town and coordinates are in the page's product JSON.
 */
function readNewMind(html: string, pageUrl: string, fallbackCity: string, now: number): ScrapedLocalEvent | null {
  const sessions: Session[] = []
  const tableRe = /<table[^>]*class="dates[^"]*"[\s\S]*?<\/table>/gi
  let m: RegExpExecArray | null
  while ((m = tableRe.exec(html))) {
    const d = parseDateText(first(m[0], /<span class="date">\(([^)]*)\)<\/span>/i))
    if (d) sessions.push({ start: d.start, end: d.end, time: parseClock(first(m[0], /<span class="from">([^<]*)<\/span>/i)) })
  }
  const name = first(html, /"product_name":\s*"((?:[^"\\]|\\.)*)"/)
  const title = (name ? cleanText(name.replace(/\\"/g, '"').replace(/\\u0026/g, '&')) : null) ?? titleFrom(html)
  const addrBlock = first(html, /<div class="node address"[^>]*>([\s\S]*?)<\/div>/i)
  const lines = addrBlock ? addrBlock.split(/<br\s*\/?>|<\/span>|<\/p>|,/i).map(s => s.replace(/<[^>]+>/g, ' ')) : []
  const town = first(html, /"address4":\s*"([^"]*)"/)
  const where = whereFromLines(lines, town ? cleanText(town) : null)
  const lat = Number(first(html, /"latitude":\s*(-?\d+(?:\.\d+)?)/))
  const lng = Number(first(html, /"longitude":\s*(-?\d+(?:\.\d+)?)/))
  if (Number.isFinite(lat) && Number.isFinite(lng) && lat !== 0) { where.lat = lat; where.lng = lng }
  return build(html, pageUrl, fallbackCity, title, nextSession(sessions, now), where)
}

/** edinburgh.org (Forever Edinburgh): data-event-start-date="DD/MM/YYYY", address lines in the map link. */
function readEdinburgh(html: string, pageUrl: string, fallbackCity: string, now: number): ScrapedLocalEvent | null {
  const start = first(html, /data-event-start-date="([^"]+)"/)
  const end = first(html, /data-event-end-date="([^"]+)"/)
  const d = parseDateText(start)
  const e = parseDateText(end)
  const sessions = d ? [{ start: d.start, end: e?.start ?? null, time: null }] : []
  const query = first(html, /aria-label="Event location"[\s\S]{0,600}?href="[^"]*[?&]query=([^"&]+)/i)
  let lines: string[] = []
  if (query) { try { lines = decodeURIComponent(query.replace(/\+/g, ' ')).split(/\r?\n/) } catch { lines = [] } }
  const where = whereFromLines(lines)
  const lat = Number(first(html, /data-latitude="(-?\d+(?:\.\d+)?)"/))
  const lng = Number(first(html, /longitude="(-?\d+(?:\.\d+)?)"/))
  if (Number.isFinite(lat) && Number.isFinite(lng) && lat !== 0) { where.lat = lat; where.lng = lng }
  return build(html, pageUrl, fallbackCity, titleFrom(html), nextSession(sessions, now), where)
}

/** visitglasgow.com: "When" / "Where" header items; the date is also in the URL (-DDMMYYYY-id). */
function readGlasgow(html: string, pageUrl: string, fallbackCity: string, now: number): ScrapedLocalEvent | null {
  const when = textOf(first(html, /page-header__meta-label">\s*When\s*<\/div>\s*<div class="page-header__meta-value">([\s\S]*?)<\/div>/i))
  let sessions = sessionFromText(when, when)
  if (!sessions.length) {
    const u = pageUrl.match(/-(\d{2})(\d{2})(\d{4})-\d+\/?$/)
    if (u) sessions = [{ start: [Number(u[3]), Number(u[2]), Number(u[1])], end: null, time: null }]
  }
  const whereText = textOf(first(html, /page-header__meta-label">\s*Where\s*<\/div>\s*<div class="page-header__meta-value">([\s\S]*?)<\/div>/i))
  const where = whereText ? whereFromLines(whereText.split(/,/)) : NOWHERE
  return build(html, pageUrl, fallbackCity, titleFrom(html), nextSession(sessions, now), { ...where })
}

/** visitleeds.co.uk: <div class="date">…</div> then <div class="attraction"><a>Venue</a></div>. */
function readLeeds(html: string, pageUrl: string, fallbackCity: string, now: number): ScrapedLocalEvent | null {
  const sessions = sessionFromText(textOf(first(html, /<div class="date">([\s\S]*?)<\/div>/i)), null)
  const venue = textOf(first(html, /<div class="attraction">\s*<a[^>]*>([\s\S]*?)<\/a>/i))
  return build(html, pageUrl, fallbackCity, titleFrom(html), nextSession(sessions, now), { ...NOWHERE, venueName: venue })
}

/** visitcardiff.com: eventdetail blocks "Date(s)", "Times", "Venue". */
function readCardiff(html: string, pageUrl: string, fallbackCity: string, now: number): ScrapedLocalEvent | null {
  const block = (label: string) => textOf(first(html, new RegExp(`<h2 class="eventdetail-top">\\s*${label}\\s*</h2>\\s*<p class="eventdetail-text">([\\s\\S]*?)</p>`, 'i')))
  const sessions = sessionFromText(block('Date\\(s\\)'), block('Times'))
  const venueText = block('Venue')
  const where = venueText ? whereFromLines(venueText.split(',')) : NOWHERE
  return build(html, pageUrl, fallbackCity, titleFrom(html), nextSession(sessions, now), { ...where })
}

/** visitcambridge.org: <li class="period"><span>15th November 2026</span></li><li class="period"><span>12:00 pm - 5:30 pm</span>. */
function readCambridge(html: string, pageUrl: string, fallbackCity: string, now: number): ScrapedLocalEvent | null {
  const periods = [...html.matchAll(/<li class="period">\s*<span>([\s\S]*?)<\/span>/gi)].map(m => textOf(m[1]) ?? '')
  const dateText = periods.find(p => parseDateText(p)) ?? null
  const timeText = periods.find(p => p !== dateText && parseClock(p)) ?? null
  return build(html, pageUrl, fallbackCity, titleFrom(html), nextSession(sessionFromText(dateText, timeText), now), NOWHERE)
}

/** welcometosheffield.co.uk: <span class="nobreak">06 Dec 2026</span> … <span class="nobreak">19:00</span>. */
function readSheffield(html: string, pageUrl: string, fallbackCity: string, now: number): ScrapedLocalEvent | null {
  const spans = [...html.matchAll(/<span class="nobreak">([^<]*)<\/span>/gi)].map(m => m[1])
  const dateText = spans.find(s => parseDateText(s)) ?? null
  const timeText = spans.find(s => /^\s*\d{1,2}[:.]\d{2}\s*$/.test(s) || /\d\s*(am|pm)\b/i.test(s)) ?? null
  return build(html, pageUrl, fallbackCity, titleFrom(html), nextSession(sessionFromText(dateText, timeText), now), NOWHERE)
}

/** bournemouth.co.uk: "Start:" date and time blocks; venue name and coordinates from the Google Maps link. */
function readBournemouth(html: string, pageUrl: string, fallbackCity: string, now: number): ScrapedLocalEvent | null {
  const startBlock = first(html, /<div>\s*Start:\s*<\/div>([\s\S]{0,600}?)(?:<div>\s*End:|$)/i) ?? ''
  const bits = [...startBlock.matchAll(/<div[^>]*>([^<]*)<\/div>/gi)].map(m => m[1].trim()).filter(Boolean)
  const sessions = sessionFromText(bits.find(b => parseDateText(b)) ?? null, bits.find(b => parseClock(b) && !parseDateText(b)) ?? null)
  const loc = first(html, />Location<\/h3>([\s\S]{0,2500})/i) ?? ''
  const mapUrl = first(loc, /href="(https:\/\/www\.google\.[^"]*\/maps\/place\/[^"]+)"/i)
  const place = mapUrl ? first(mapUrl, /\/maps\/place\/([^/@]+)/) : null
  let venueName: string | null = null
  if (place) { try { venueName = cleanText(decodeURIComponent(place.replace(/\+/g, ' ')).replace(/&#x27;/g, "'").split(',')[0]) } catch { venueName = null } }
  const addr = textOf(first(loc, /<div class="action color-text-primary-black">([^<]+)<\/div>/i))
  const where = addr ? whereFromLines(addr.split(',')) : { ...NOWHERE }
  if (venueName) where.venueName = venueName
  const lat = Number(first(mapUrl ?? '', /!3d(-?\d+\.\d+)/)), lng = Number(first(mapUrl ?? '', /!4d(-?\d+\.\d+)/))
  if (Number.isFinite(lat) && Number.isFinite(lng) && lat !== 0) { where.lat = lat; where.lng = lng }
  return build(html, pageUrl, fallbackCity, titleFrom(html), nextSession(sessions, now), where)
}

const READERS: Record<HtmlParser, (html: string, pageUrl: string, fallbackCity: string, now: number) => ScrapedLocalEvent | null> = {
  newmind: readNewMind, edinburgh: readEdinburgh, glasgow: readGlasgow, leeds: readLeeds,
  cardiff: readCardiff, cambridge: readCambridge, sheffield: readSheffield, bournemouth: readBournemouth,
}

export function eventFromHtml(parser: HtmlParser, html: string, pageUrl: string, fallbackCity: string, now: number = Date.now()): ScrapedLocalEvent | null {
  return READERS[parser](html, pageUrl, fallbackCity, now)
}
