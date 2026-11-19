// Seasonal city pages: /cities/Manchester/panto, /cities/Leeds/christmas, /cities/Glasgow/new-years-eve.
// These are among the busiest events searches of the year ("panto manchester", "christmas events leeds",
// "new years eve glasgow"), and we hold hundreds of matching listings. The pages are permanent: each year
// they fill with that season's listings and keep the authority they built up. Out of season (or with fewer
// than MIN_INDEXABLE listings) they stay up for visitors but are noindex.
// Pure module (no '@/' imports) so it runs under node --test.

export interface Season {
  slug: 'christmas' | 'panto' | 'new-years-eve'
  label: string            // "Christmas Events"
  plural: string           // "Christmas events"
  singular: string
  emoji: string
}

export const SEASONS: Season[] = [
  { slug: 'christmas',     label: 'Christmas Events',  plural: 'Christmas events',             singular: 'Christmas event',   emoji: '🎄' },
  { slug: 'panto',         label: 'Pantomimes',        plural: 'pantos',                       singular: 'panto',             emoji: '🎭' },
  { slug: 'new-years-eve', label: "New Year's Eve",    plural: "New Year's Eve events",        singular: "New Year's Eve event", emoji: '🎆' },
]

export function seasonBySlug(slug: string): Season | undefined {
  return SEASONS.find(s => s.slug === slug.toLowerCase())
}

/** The Christmas season a date belongs to: December of this year, or last year's if we are in January. */
export function seasonYear(now: Date = new Date()): number {
  const m = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', month: 'numeric' }).format(now))
  const y = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', year: 'numeric' }).format(now))
  return m === 1 ? y - 1 : y
}

/** Date window (UTC ISO) the season's listings must start in. */
export function seasonWindow(s: Season, now: Date = new Date()): { from: string; to: string } {
  const y = seasonYear(now)
  const from = new Date(Math.max(now.getTime(), Date.UTC(y, 9, 15)))   // never before 15 Oct, never in the past
  const to = s.slug === 'panto' ? Date.UTC(y + 1, 1, 1)                // pantos run to the end of January
    : s.slug === 'christmas' ? Date.UTC(y, 11, 27)                     // up to Boxing Day
    : Date.UTC(y + 1, 0, 1, 12)                                        // New Year's Eve night, into 1 Jan
  return { from: from.toISOString(), to: new Date(to).toISOString() }
}

const PANTO = /\b(panto|pantomime|cinderella|aladdin|jack and the beanstalk|snow white|peter pan|sleeping beauty|dick whittington|beauty and the beast|mother goose|goldilocks|robin hood|puss in boots|babes in the wood|rapunzel)\b/i
const NOT_PANTO = /\b(ballet|opera|film|screening|cinema|tribute|disney on ice|musical)\b/i
const CHRISTMAS = /\b(christmas|xmas|santa|festive|carol|carols|winter wonderland|grotto|nutcracker|yule|mistletoe|elf|elves|reindeer|winterfest|christmas market|lights trail|light trail|boxing day)\b/i
const NYE = /\b(new year'?s? eve|nye|hogmanay|new year party|new years party)\b/i

const londonDate = (iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' }).format(new Date(iso))

/** Does a listing belong on this season's page? (Window already applied by the query.) */
export function matchesSeason(s: Season, row: { title: string; category: string; start_date: string }, now: Date = new Date()): boolean {
  // 'local' too: most pantos reach us from council and tourist-board listings, not the big ticket sites.
  if (s.slug === 'panto') return (row.category === 'theatre' || row.category === 'family' || row.category === 'local') && PANTO.test(row.title) && !NOT_PANTO.test(row.title)
  if (s.slug === 'christmas') return CHRISTMAS.test(row.title) && !NYE.test(row.title)
  // New Year's Eve: anything on the night of 31 Dec (from 6pm) to 6am on 1 Jan, or billed as a NYE event.
  const y = seasonYear(now)
  const d = londonDate(row.start_date)                  // "2026-12-31, 21"
  const [date, hour] = d.split(', ')
  const onTheNight = (date === `${y}-12-31` && Number(hour) >= 18) || (date === `${y + 1}-01-01` && Number(hour) < 6)
  return onTheNight || (NYE.test(row.title) && (date === `${y}-12-31` || date === `${y + 1}-01-01` || date === `${y}-12-30`))
}

export function seasonTitle(cityName: string, s: Season, now: Date = new Date()): string {
  const y = seasonYear(now)
  if (s.slug === 'panto') return `Panto in ${cityName} ${y}/${String(y + 1).slice(2)}: Dates & Tickets`
  if (s.slug === 'christmas') return `Christmas Events in ${cityName} ${y}`
  return `New Year's Eve in ${cityName} ${y}: Events & Parties`
}

export function seasonH1(cityName: string, s: Season, now: Date = new Date()): string {
  const y = seasonYear(now)
  if (s.slug === 'panto') return `Pantomimes in ${cityName} ${y}/${String(y + 1).slice(2)}`
  if (s.slug === 'christmas') return `Christmas Events in ${cityName} ${y}`
  return `New Year's Eve in ${cityName} ${y}`
}

export function seasonDescription(cityName: string, s: Season, count: number, venues: string[], now: Date = new Date()): string {
  const y = seasonYear(now)
  const where = venues.length ? ` at ${venues.slice(0, 2).join(', ')}${venues.length > 2 ? ' and more' : ''}` : ''
  const what = s.slug === 'panto' ? `pantos in ${cityName} this ${y}/${String(y + 1).slice(2)} season`
    : s.slug === 'christmas' ? `Christmas events in ${cityName}: markets, Santa, festive shows and carols`
    : `things to do in ${cityName} on New Year's Eve ${y}`
  return `${count > 0 ? `${count} ` : ''}${what}${count > 0 ? where : ''}. Dates and tickets, updated daily.`.replace(/^./, c => c.toUpperCase()).slice(0, 160)
}

/** True from 1 October to the end of January: when the seasonal pages are linked from city pages. */
export function inSeason(now: Date = new Date()): boolean {
  const m = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', month: 'numeric' }).format(now))
  return m >= 10 || m === 1
}

export function seasonFaqs(cityName: string, s: Season, f: { count: number; venueNames: string[]; firstWhen: string | null; lastWhen: string | null; priceFrom: number | null }, now: Date = new Date()): Array<{ q: string; a: string }> {
  const y = seasonYear(now)
  const out: Array<{ q: string; a: string }> = []
  if (s.slug === 'panto') {
    if (f.count > 0) out.push({ q: `What pantos are on in ${cityName} this Christmas?`, a: `There are ${f.count} pantomimes listed in ${cityName} for ${y}/${String(y + 1).slice(2)}${f.venueNames.length ? `, at ${f.venueNames.slice(0, 3).join(', ')}` : ''}. Each listing above shows its dates and tickets.` })
    if (f.firstWhen && f.lastWhen) out.push({ q: `When is panto season in ${cityName}?`, a: `Listed performances run from ${f.firstWhen} to ${f.lastWhen}. Weekend and Christmas-week shows sell out first.` })
  } else if (s.slug === 'christmas') {
    if (f.count > 0) out.push({ q: `What's on in ${cityName} this Christmas?`, a: `${f.count} Christmas events are listed in ${cityName}${f.venueNames.length ? `, including at ${f.venueNames.slice(0, 3).join(', ')}` : ''}: festive shows, carols, Santa experiences and more.` })
    if (f.firstWhen) out.push({ q: `When do Christmas events start in ${cityName}?`, a: `The next listed Christmas event is on ${f.firstWhen}. New ones are added every day through December.` })
  } else {
    if (f.count > 0) out.push({ q: `What's on in ${cityName} on New Year's Eve?`, a: `${f.count} events are listed for New Year's Eve ${y} in ${cityName}${f.venueNames.length ? `, at venues including ${f.venueNames.slice(0, 3).join(', ')}` : ''}: club nights, gigs, comedy and parties.` })
    out.push({ q: `Should I book New Year's Eve tickets in advance?`, a: `Yes. New Year's Eve events often sell out, and prices usually rise closer to the night.` })
  }
  if (f.priceFrom !== null && f.priceFrom > 0) out.push({ q: `How much are tickets?`, a: `Listed face-value tickets start from £${f.priceFrom.toFixed(2).replace(/\.00$/, '')}. Each listing shows its own prices.` })
  return out
}
