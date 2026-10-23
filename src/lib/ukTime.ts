// UK time for the whole site. Shows happen in UK time, so "today", a show's date and its start time are always
// worked out in Europe/London, never UTC (in British Summer Time UTC is an hour behind, so between midnight and
// 1am a UTC date is still yesterday). Pure: relative imports only, runs under `node --test`.
// Site rule: a start stored as midnight UK time means "time not announced" and is shown as a date only.

const UK_DAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' })

/** The UK calendar date (YYYY-MM-DD) of a moment; default now. */
export function ukDate(at: Date | string | number = new Date()): string {
  return UK_DAY.format(at instanceof Date ? at : new Date(at))
}

/** Today's date in the UK (YYYY-MM-DD). Use this, never `new Date().toISOString().slice(0, 10)`. */
export function ukToday(): string {
  return ukDate()
}
