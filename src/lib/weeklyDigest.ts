// Weekly digest — pure, dependency-free helpers (no '@/' imports, no npm
// packages) so they run under plain `node --test`, matching newsletterContent.ts.
// The cron route (src/app/api/cron/weekly-digest/route.tsx) does the fetching
// and sending; every decision it makes lives here.

import { buildUtmUrl } from './analytics.ts'

const SITE = 'https://www.theshowfinder.com'

export interface DigestOnSaleItem {
  name: string
  slug: string
  dateCount: number
  /** Human label, e.g. "Fri 9 Oct 09:00 GMT". */
  whenLabel: string
  saleType: 'presale' | 'onsale'
}

export interface DigestEventItem {
  title: string
  slug: string
  /** ISO start date. */
  startDate: string
  venueName: string
  venueCity: string
}

export interface DigestShowItem {
  title: string
  venueName: string
  /** /west-end/<slug> */
  slug: string
  nextDate: string
}

export interface DigestContent {
  onSale: DigestOnSaleItem[]
  events: DigestEventItem[]
  shows: DigestShowItem[]
  /**
   * Set for a subscriber who signed up with a city: `events` then holds that
   * city's shows for the week and the email says so. Null/absent = national.
   */
  cityName?: string | null
}

// Which Monday this digest belongs to, as YYYY-MM-DD in UK time. Used for the
// campaign tag, the idempotency key and the subject, so a re-run on the same
// day can never produce a second send.
export function digestWeekKey(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now)
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? ''
  return `${get('year')}-${get('month')}-${get('day')}`
}

export function digestCampaignId(weekKey: string): string {
  return `weekly-digest-${weekKey}`
}

// Site link tagged for GA4 (source=newsletter, medium=email, campaign=this
// week's digest, content=which section) so the digest's traffic and the
// affiliate clicks it drives are separable from everything else.
export function digestLink(path: string, weekKey: string, content: string): string {
  const url = path.startsWith('http') ? path : `${SITE}${path.startsWith('/') ? '' : '/'}${path}`
  return buildUtmUrl(url, { source: 'newsletter', medium: 'email', campaign: digestCampaignId(weekKey), content })
}

export function digestSubject(content: DigestContent): string {
  const top = content.onSale[0]
  if (top) {
    const others = content.onSale.length - 1
    const verb = top.saleType === 'presale' ? 'presale' : 'on sale'
    return others > 0
      ? `${top.name} ${verb} + ${others} more on sale this week`
      : `${top.name} ${verb} this week`
  }
  if (content.shows[0]) return `This week: ${content.shows[0].title} and more UK shows`
  return 'This week on TheShowFinder'
}

export const MIN_DIGEST_ITEMS = 3

// A near-empty digest is worse than none (it teaches people to ignore the
// next one), so a week with too little to say is skipped rather than sent.
export function hasEnoughContent(content: DigestContent): boolean {
  return content.onSale.length + content.events.length + content.shows.length >= MIN_DIGEST_ITEMS
}

export type DigestMode = 'live' | 'preview'

// Real sending to the whole list is opt-in: only the exact string "true" in
// DIGEST_AUTO_SEND turns it on. Anything else (unset, "TRUE", "1", "yes")
// keeps the digest in preview mode, which emails one test address only.
export function resolveDigestMode(autoSend: string | undefined | null): DigestMode {
  return autoSend === 'true' ? 'live' : 'preview'
}

export const DEFAULT_PREVIEW_EMAIL = 'hello@theshowfinder.com'

export function resolvePreviewRecipient(raw: string | undefined | null): string {
  const v = (raw ?? '').trim().toLowerCase()
  return v && v.includes('@') ? v : DEFAULT_PREVIEW_EMAIL
}

// The newsletters-table subject used as the "already sent" marker, so the
// digest also shows up in the admin newsletter list.
export function digestMarkerSubject(weekKey: string): string {
  return `Weekly digest ${weekKey}`
}

// Trim/cap each section so the email stays scannable.
export function limitDigestContent(content: DigestContent): DigestContent {
  return {
    onSale: content.onSale.slice(0, 6),
    events: content.events.slice(0, 6),
    shows: content.shows.slice(0, 3),
    cityName: content.cityName ?? null,
  }
}

// A city only gets its own section when it has enough shows to be worth a
// heading; otherwise those subscribers get the national list like everyone else.
export const MIN_CITY_EVENTS = 3

export function hasEnoughCityEvents(events: DigestEventItem[]): boolean {
  return events.length >= MIN_CITY_EVENTS
}

// Match a subscriber's free-text city tag to one of our city names
// (case/space-insensitive). Anything else is treated as "no city".
export function resolveCityName(raw: string | null | undefined, cityNames: string[]): string | null {
  const wanted = (raw ?? '').trim().toLowerCase()
  if (!wanted) return null
  return cityNames.find(n => n.toLowerCase() === wanted) ?? null
}

export interface DigestSubscriber {
  email: string
  city: string | null
}

export interface RecipientGroup {
  /** Canonical city name, or null for the national digest. */
  city: string | null
  emails: string[]
}

// One group per city that has subscribers, plus the national group. Emails are
// de-duplicated and every subscriber lands in exactly one group.
export function groupRecipientsByCity(subscribers: DigestSubscriber[], cityNames: string[]): RecipientGroup[] {
  const groups = new Map<string | null, Set<string>>()
  for (const s of subscribers) {
    const email = s.email.trim().toLowerCase()
    if (!email) continue
    const key = resolveCityName(s.city, cityNames)
    const set = groups.get(key) ?? new Set<string>()
    set.add(email)
    groups.set(key, set)
  }
  return [...groups.entries()]
    .map(([city, set]) => ({ city, emails: [...set] }))
    .sort((a, b) => (a.city === null ? 1 : 0) - (b.city === null ? 1 : 0) || (a.city ?? '').localeCompare(b.city ?? ''))
}

// "/cities/<city>/this-weekend" — the page the city section links to.
export function cityWeekendPath(cityName: string): string {
  return `/cities/${encodeURIComponent(cityName)}/this-weekend`
}
