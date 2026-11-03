// "Scorpions UK Tour 2027: Dates & Tickets". People search with the year, so the
// title carries the year(s) of the upcoming dates. No dates: the plain title.
export function artistPageTitle(name: string, startDates: string[]): string {
  const years = [...new Set(startDates.map(d => Number(d.slice(0, 4))).filter(y => y > 2000))].sort()
  if (years.length === 0) return `${name} UK Tour Dates & Tickets`
  const span = years.length === 1 ? String(years[0]) : `${years[0]}–${String(years[years.length - 1]).slice(2)}`
  return `${name} UK Tour ${span}: Dates & Tickets`
}
