// "What's on in {City} in {Month}" pages: /cities/Leeds/december-2026.
// People plan ahead by month ("what's on in leeds in december", "manchester events march 2027"), and each
// month page gathers every listing in the city for that month, spread across the month so it is not just
// the first two days. The next 12 months have pages; a month that has passed redirects to the current one.
// Under MIN_INDEXABLE shows a page stays up but is noindex. Pure module (no '@/' imports) for node --test.

export const MONTH_NAMES = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'] as const
export const MONTHS_AHEAD = 12

export interface CityMonth { year: number; month: number; slug: string; label: string; short: string }

const cap = (s: string) => s[0].toUpperCase() + s.slice(1)

export function cityMonth(year: number, month: number): CityMonth {
  const name = MONTH_NAMES[month]
  return { year, month, slug: `${name}-${year}`, label: `${cap(name)} ${year}`, short: cap(name).slice(0, 3) }
}

export function parseMonthSlug(slug: string): CityMonth | null {
  const m = /^([a-z]+)-(\d{4})$/.exec(slug.toLowerCase())
  if (!m) return null
  const month = (MONTH_NAMES as readonly string[]).indexOf(m[1])
  return month < 0 ? null : cityMonth(Number(m[2]), month)
}

function londonYearMonth(now: Date): { year: number; month: number } {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit' }).format(now).split('-')
  return { year: Number(p[0]), month: Number(p[1]) - 1 }
}

/** UTC instant of midnight on the 1st of a month in London (BST-aware). */
export function londonMonthStart(year: number, month: number): Date {
  const noon = new Date(Date.UTC(year, month, 1, 12))
  const londonHour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', hourCycle: 'h23' }).format(noon))
  return new Date(Date.UTC(year, month, 1) - (londonHour - 12) * 3600_000)
}

/** Months from this one forward that have pages. */
export function upcomingMonths(now: Date = new Date(), n: number = MONTHS_AHEAD): CityMonth[] {
  const { year, month } = londonYearMonth(now)
  return Array.from({ length: n }, (_, i) => cityMonth(year + Math.floor((month + i) / 12), (month + i) % 12))
}

export function monthState(m: CityMonth, now: Date = new Date()): 'past' | 'live' | 'too-far' {
  const months = upcomingMonths(now)
  if (months.some(x => x.slug === m.slug)) return 'live'
  return londonMonthStart(m.year, m.month) < londonMonthStart(months[0].year, months[0].month) ? 'past' : 'too-far'
}

/** Listings must start in this window (UTC ISO); the current month starts from now. */
export function monthWindow(m: CityMonth, now: Date = new Date()): { from: string; to: string } {
  const start = londonMonthStart(m.year, m.month)
  const end = londonMonthStart(m.month === 11 ? m.year + 1 : m.year, (m.month + 1) % 12)
  return { from: new Date(Math.max(start.getTime(), now.getTime())).toISOString(), to: end.toISOString() }
}

/** Pick shows spread across the month (a few per day, round-robin by day) so the page covers all of it. */
export function spreadAcrossDays<T extends { first: { start_date: string } }>(runs: T[], limit: number): T[] {
  const day = (iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso))
  if (runs.length <= limit) return runs
  const byDay = new Map<string, T[]>()
  for (const r of runs) { const d = day(r.first.start_date); if (!byDay.has(d)) byDay.set(d, []); byDay.get(d)!.push(r) }
  const picked: T[] = []
  for (let i = 0; picked.length < limit; i++) {
    let added = false
    for (const list of byDay.values()) if (list[i] && picked.length < limit) { picked.push(list[i]); added = true }
    if (!added) break
  }
  return picked.sort((a, b) => a.first.start_date.localeCompare(b.first.start_date))
}

export function monthTitle(cityName: string, m: CityMonth): string {
  return `What's On in ${cityName} in ${m.label}: Events & Tickets`
}

export function monthH1(cityName: string, m: CityMonth): string {
  return `What's On in ${cityName} in ${m.label}`
}

/** "42 concerts, 18 comedy shows and 30 theatre shows" from [plural, count] pairs, biggest first. */
export function categorySummary(counts: Array<[string, number]>, max = 3): string {
  const top = counts.filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]).slice(0, max).map(([p, n]) => `${n} ${p}`)
  return top.length > 1 ? `${top.slice(0, -1).join(', ')} and ${top[top.length - 1]}` : (top[0] ?? '')
}

export function monthDescription(cityName: string, m: CityMonth, count: number, summary: string, venues: string[]): string {
  if (count === 0) return `What's on in ${cityName} in ${m.label}: concerts, comedy, theatre, family days out and more. Dates and tickets, updated daily.`
  const where = venues.length ? ` at ${venues.slice(0, 2).join(', ')}${venues.length > 2 ? ' and more' : ''}` : ''
  return `${count} events in ${cityName} in ${m.label}${summary ? `, including ${summary}` : ''}${where}. Dates and tickets, updated daily.`.slice(0, 160)
}

export function monthFaqs(cityName: string, m: CityMonth, f: { count: number; summary: string; venueNames: string[]; priceFrom: number | null; busiestDay: string | null }): Array<{ q: string; a: string }> {
  const out: Array<{ q: string; a: string }> = []
  if (f.count > 0) out.push({ q: `What's on in ${cityName} in ${m.label}?`, a: `${f.count} events are listed in ${cityName} for ${m.label}${f.summary ? `: ${f.summary}` : ''}. New listings are added every day.` })
  if (f.venueNames.length) out.push({ q: `Which ${cityName} venues have events in ${m.label}?`, a: `Venues with listings this month include ${f.venueNames.slice(0, 5).join(', ')}.` })
  if (f.busiestDay) out.push({ q: `What is the busiest night in ${cityName} in ${m.label}?`, a: `${f.busiestDay} has the most events listed so far.` })
  if (f.priceFrom !== null && f.priceFrom > 0) out.push({ q: `How much are tickets?`, a: `Listed face-value tickets start from £${f.priceFrom.toFixed(2).replace(/\.00$/, '')}. Each listing shows its own prices.` })
  return out
}
