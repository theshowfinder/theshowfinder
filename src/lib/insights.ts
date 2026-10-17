// Pure helpers for the /insights page ("UK live events index"): turn raw
// counts into ranked, rounded, citable figures. No database access here so it
// can be unit tested with `node --test`.

export interface CountRow {
  label: string
  count: number
}

export interface MonthRow extends CountRow {
  /** First day of the month, YYYY-MM-01 (UTC). */
  monthStart: string
}

/** Sort high to low, drop zeros, ties broken alphabetically so output is stable. */
export function rankCounts(rows: CountRow[], limit?: number): CountRow[] {
  const sorted = rows
    .filter(r => r.count > 0)
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
  return typeof limit === 'number' ? sorted.slice(0, limit) : sorted
}

/** Whole-number percentage of total, 0 when the total is 0. */
export function sharePercent(count: number, total: number): number {
  if (!total || total <= 0) return 0
  return Math.round((count / total) * 100)
}

/** "13,400" style, UK grouping. */
export function formatCount(n: number): string {
  return Math.round(n).toLocaleString('en-GB')
}

/** Round down to a figure that is safe to quote and will not change daily: 13,400 -> "13,000+". */
export function quotableCount(n: number): string {
  if (n < 100) return String(n)
  const step = n >= 10000 ? 1000 : n >= 1000 ? 100 : 10
  return `${formatCount(Math.floor(n / step) * step)}+`
}

/** Start/end (exclusive) of the next `count` calendar months from `now`, UTC, current month first. */
export function nextMonthRanges(now: Date, count = 12): { label: string; monthStart: string; startISO: string; endISO: string }[] {
  const out: { label: string; monthStart: string; startISO: string; endISO: string }[] = []
  for (let i = 0; i < count; i++) {
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + i, 1))
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + i + 1, 1))
    out.push({
      label: start.toLocaleString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }),
      monthStart: start.toISOString().slice(0, 10),
      startISO: start.toISOString(),
      endISO: end.toISOString(),
    })
  }
  return out
}

/** Today's date as "17 October 2026" in the UK. */
export function ukDateLabel(now: Date): string {
  return now.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/London' })
}

export interface InsightsSummary {
  total: number
  cities: CountRow[]
  categories: CountRow[]
  months: MonthRow[]
}

/** One plain sentence a journalist can lift. Falls back gracefully on thin data. */
export function insightsHeadline(s: InsightsSummary): string {
  const topCity = rankCounts(s.cities, 1)[0]
  const topCategory = rankCounts(s.categories, 1)[0]
  const parts = [`${quotableCount(s.total)} live events are on sale across the UK`]
  if (topCity) parts.push(`${topCity.label} has the most with ${formatCount(topCity.count)}`)
  if (topCategory) parts.push(`${topCategory.label.toLowerCase()} makes up ${sharePercent(topCategory.count, s.total)}% of everything listed`)
  return parts.join('; ') + '.'
}

/** The busiest and quietest month, or null when there is not enough data. */
export function busiestMonth(months: MonthRow[]): { busiest: MonthRow; quietest: MonthRow } | null {
  const withData = months.filter(m => m.count > 0)
  if (withData.length < 2) return null
  const busiest = withData.reduce((a, b) => (b.count > a.count ? b : a))
  const quietest = withData.reduce((a, b) => (b.count < a.count ? b : a))
  return { busiest, quietest }
}

export const CATEGORY_LABELS: Record<string, string> = {
  concert: 'Concerts',
  theatre: 'Theatre',
  comedy: 'Comedy',
  family: 'Family shows',
  sports: 'Sport',
  local: 'Local events',
}

export function categoryLabel(raw: string): string {
  return CATEGORY_LABELS[raw] ?? raw.charAt(0).toUpperCase() + raw.slice(1)
}
