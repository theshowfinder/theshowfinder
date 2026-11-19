// Repeat events on "List your event": a weekly club night, a monthly comedy club, a run of shows. The organiser
// fills the form once; every date becomes its own listing (its own page, tickets and capacity), linked by a
// series id so one approval publishes the lot.

export const MAX_EXTRA_DATES = 12
export type RepeatPattern = 'weekly' | 'fortnightly' | 'monthly'
export interface ExtraDate { date: string; time: string }

const DATE = /^\d{4}-\d{2}-\d{2}$/
const TIME = /^\d{2}:\d{2}$/
const DAY = 86_400_000

const toDate = (d: string) => new Date(`${d}T12:00:00Z`)
const fmt = (d: Date) => d.toISOString().slice(0, 10)

/** The nth weekday of a month (n = 5 means the last one), or null. */
function nthWeekday(year: number, month: number, weekday: number, n: number): Date {
  if (n >= 5) {
    const last = new Date(Date.UTC(year, month + 1, 0, 12))
    last.setUTCDate(last.getUTCDate() - ((last.getUTCDay() - weekday + 7) % 7))
    return last
  }
  const first = new Date(Date.UTC(year, month, 1, 12))
  first.setUTCDate(1 + ((weekday - first.getUTCDay() + 7) % 7) + (n - 1) * 7)
  return first
}

/** "every 2nd Friday" style label for the monthly option. */
export function monthlyLabel(first: string): string {
  if (!DATE.test(first)) return 'Monthly'
  const d = toDate(first)
  const n = Math.ceil(d.getUTCDate() / 7)
  const day = d.toLocaleDateString('en-GB', { weekday: 'long', timeZone: 'UTC' })
  return `Monthly (every ${n >= 5 || d.getUTCDate() + 7 > new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate() ? 'last' : ['1st', '2nd', '3rd', '4th'][n - 1]} ${day})`
}

/** The dates after `first` for a repeat pattern: `count` is the total number of dates including the first. */
export function repeatDates(first: string, pattern: RepeatPattern, count: number): string[] {
  if (!DATE.test(first)) return []
  const total = Math.max(1, Math.min(MAX_EXTRA_DATES + 1, Math.floor(count)))
  const start = toDate(first)
  const out: string[] = []
  if (pattern === 'monthly') {
    const weekday = start.getUTCDay()
    const lastDay = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0)).getUTCDate()
    const n = start.getUTCDate() + 7 > lastDay ? 5 : Math.ceil(start.getUTCDate() / 7)
    for (let i = 1; i < total; i++) out.push(fmt(nthWeekday(start.getUTCFullYear(), start.getUTCMonth() + i, weekday, n)))
  } else {
    const step = pattern === 'weekly' ? 7 : 14
    for (let i = 1; i < total; i++) out.push(fmt(new Date(start.getTime() + i * step * DAY)))
  }
  return out
}

/** The extra dates the form sent (JSON), tidied: real dates after the first one, no repeats, at most 12, in order. */
export function parseExtraDates(raw: string, first: string, firstTime: string): ExtraDate[] {
  let list: unknown
  try { list = JSON.parse(raw || '[]') } catch { return [] }
  if (!Array.isArray(list)) return []
  const seen = new Set([`${first} ${firstTime}`])
  const out: ExtraDate[] = []
  for (const item of list) {
    const date = typeof item?.date === 'string' ? item.date : ''
    const time = typeof item?.time === 'string' && TIME.test(item.time) ? item.time : firstTime
    if (!DATE.test(date) || Number.isNaN(toDate(date).getTime()) || fmt(toDate(date)) !== date) continue
    const key = `${date} ${time}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ date, time })
  }
  return out.sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`)).slice(0, MAX_EXTRA_DATES)
}

/** Move an ISO time by the gap between two UK dates (a ticket type's "on sale until" follows its own date). */
export function shiftIsoByDates(iso: string | null, fromDate: string, toDateStr: string): string | null {
  if (!iso) return null
  const days = Math.round((toDate(toDateStr).getTime() - toDate(fromDate).getTime()) / DAY)
  return new Date(Date.parse(iso) + days * DAY).toISOString()
}
