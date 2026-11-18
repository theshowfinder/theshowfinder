// "{Type} in {City}" pages (/cities/Coventry/concerts, /cities/Manchester/comedy): one real page for each
// search people type ("coventry concerts", "comedy manchester", "shows in hull"). Before these existed the
// only match was a filtered /events?category=&city= result, which Google does not rank (Search Console,
// Oct 2026: thousands of impressions at position 40-65). A page is only offered to search engines once it
// has MIN_INDEXABLE upcoming shows; thinner ones still work for visitors but are noindex.
// Pure module (no '@/' imports) so it runs under node --test.

export const SITE = 'https://www.theshowfinder.com'
export const MIN_INDEXABLE = 5

export interface CityType {
  slug: string          // URL part
  category: string      // events.category
  label: string         // "Concerts & Gigs"
  plural: string        // used in sentences: "concerts and gigs"
  singular: string      // "concert"
  emoji: string
}

export const CITY_TYPES: CityType[] = [
  { slug: 'concerts', category: 'concert', label: 'Concerts & Gigs',   plural: 'concerts and gigs',          singular: 'gig',         emoji: '🎵' },
  { slug: 'comedy',   category: 'comedy',  label: 'Comedy',            plural: 'comedy shows',               singular: 'comedy show', emoji: '😂' },
  { slug: 'theatre',  category: 'theatre', label: 'Theatre & Musicals', plural: 'theatre shows and musicals', singular: 'show',        emoji: '🎭' },
  { slug: 'family',   category: 'family',  label: 'Family Days Out',   plural: 'family shows and days out',  singular: 'family show', emoji: '🎠' },
  { slug: 'sport',    category: 'sports',  label: 'Sport',             plural: 'sporting events',            singular: 'match',       emoji: '⚽' },
]

export function cityTypeBySlug(slug: string): CityType | undefined {
  return CITY_TYPES.find(t => t.slug === slug.toLowerCase())
}

export function cityTypeByCategory(category: string): CityType | undefined {
  return CITY_TYPES.find(t => t.category === category)
}

export function cityTypePath(cityName: string, t: CityType): string {
  return `/cities/${encodeURIComponent(cityName)}/${t.slug}`
}

export function cityTypeUrl(cityName: string, t: CityType): string {
  return `${SITE}${cityTypePath(cityName, t)}`
}

/** Title tag (the layout adds " | TheShowFinder"). Leads with the words people search. */
export function cityTypeTitle(cityName: string, t: CityType): string {
  return t.slug === 'family' ? `Family Days Out & Kids Shows in ${cityName}` : `${t.label} in ${cityName}: Dates & Tickets`
}

export function cityTypeH1(cityName: string, t: CityType): string {
  return t.slug === 'family' ? `Family Days Out & Kids Shows in ${cityName}` : `${t.label} in ${cityName}`
}

/** "120+" style rounding so the description does not change every day. */
function rounded(n: number): string {
  if (n < 10) return String(n)
  const step = n >= 100 ? 50 : 10
  return `${Math.floor(n / step) * step}+`
}

export function cityTypeDescription(cityName: string, t: CityType, count: number, venues: string[]): string {
  const where = venues.length ? ` at ${venues.slice(0, 2).join(', ')}${venues.length > 2 ? ' and more' : ''}` : ''
  const lead = count > 0 ? `${rounded(count)} upcoming ${t.plural} in ${cityName}${where}.` : `Upcoming ${t.plural} in ${cityName}.`
  return `${lead} Dates, venues and tickets, updated every day.`.slice(0, 160)
}

export interface CityTypeFacts {
  count: number
  venueNames: string[]       // busiest first
  nextTitle: string | null
  nextWhen: string | null    // "Fri 21 Nov"
  weekendCount: number
  priceFrom: number | null   // lowest known face price, £
}

/** Questions people actually ask, answered from the live listings (never invented). */
export function cityTypeFaqs(cityName: string, t: CityType, f: CityTypeFacts): Array<{ q: string; a: string }> {
  const out: Array<{ q: string; a: string }> = []
  if (f.count > 0) {
    out.push({
      q: `What ${t.plural} are on in ${cityName}?`,
      a: `There are ${f.count} upcoming ${t.plural} in ${cityName} listed on TheShowFinder${f.nextTitle && f.nextWhen ? `. The next is ${f.nextTitle} on ${f.nextWhen}` : ''}. The list above is updated every day.`,
    })
  }
  if (f.venueNames.length) {
    out.push({
      q: `Where can I see ${t.plural} in ${cityName}?`,
      a: `The venues with the most ${t.plural} coming up are ${f.venueNames.slice(0, 4).join(', ')}.`,
    })
  }
  out.push({
    q: `Is there anything on in ${cityName} this weekend?`,
    a: f.weekendCount > 0
      ? `Yes: ${f.weekendCount} ${f.weekendCount === 1 ? t.singular : t.plural} this weekend, listed above. Our ${cityName} this weekend page has everything else on too.`
      : `Nothing in this category this weekend yet. See everything else on in ${cityName} this weekend on our weekend page.`,
  })
  if (f.priceFrom !== null && f.priceFrom > 0) {
    out.push({
      q: `How much are tickets?`,
      a: `Face-value tickets for ${t.plural} in ${cityName} currently start from £${f.priceFrom.toFixed(2).replace(/\.00$/, '')}. Prices vary by show and seat; each listing shows its own ticket options.`,
    })
  }
  return out
}

/** Repeat performances of one show at one venue (a theatre run) become a single card with a date count. */
export function groupRuns<T extends { title: string; venue_id: string | null; start_date: string }>(rows: T[]): Array<{ first: T; dates: number; last: string }> {
  const byKey = new Map<string, { first: T; dates: number; last: string }>()
  for (const r of rows) {
    const key = `${r.title.trim().toLowerCase()}|${r.venue_id ?? ''}`
    const g = byKey.get(key)
    if (!g) byKey.set(key, { first: r, dates: 1, last: r.start_date })
    else { g.dates++; if (r.start_date < g.first.start_date) g.first = r; if (r.start_date > g.last) g.last = r.start_date }
  }
  return [...byKey.values()].sort((a, b) => a.first.start_date.localeCompare(b.first.start_date))
}

/** London dates (YYYY-MM-DD) of the coming weekend: Fri, Sat, Sun (from Saturday on, just what is left of it). */
export function weekendDatesLondon(now: Date = new Date()): string[] {
  const day = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
  const dow = (d: Date) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', weekday: 'short' }).format(d)
  const out: string[] = []
  for (let i = 0; i < 7 && out.length < 3; i++) {
    const d = new Date(now.getTime() + i * 86_400_000)
    const w = dow(d)
    if (w === 'Fri' || w === 'Sat' || w === 'Sun') out.push(day(d))
    else if (out.length) break
  }
  return out
}
