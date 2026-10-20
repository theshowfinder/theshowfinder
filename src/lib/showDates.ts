// Pure helpers for showing a tour that plays several towns.
//  * teaser: the "also in Leeds, Glasgow +11" line on a tile.
//  * groupDatesByCity: the "All dates" list on an event page, the visitor's own city first, the rest
//    ordered by whichever city plays soonest.

export interface ShowDate {
  id: string
  slug: string
  start_date: string
  status: string
  venue_name: string | null
  venue_city: string | null
}

export interface CityGroup {
  city: string
  isHome: boolean
  dates: ShowDate[]
}

/** Other cities to name on the tile, never the city the tile already shows, and how many more there are. */
export function teaser(otherCities: string[], totalOtherCities: number, shownCity: string | null, shownIsHome: boolean, max = 2) {
  const shown = (shownCity ?? '').toLowerCase()
  const names = otherCities.filter(c => c && c.toLowerCase() !== shown)
  // When the tile is not the visitor's own city, its city sits inside the "other" list: it is not "other".
  const total = Math.max(0, shownIsHome ? totalOtherCities : totalOtherCities - (otherCities.some(c => c?.toLowerCase() === shown) ? 1 : 0))
  const listed = names.slice(0, max)
  return { listed, more: Math.max(0, total - listed.length) }
}

export function groupDatesByCity(dates: ShowDate[], homeCity: string | null): CityGroup[] {
  const home = (homeCity ?? '').toLowerCase()
  const order: string[] = []
  const byCity = new Map<string, ShowDate[]>()
  for (const d of [...dates].sort((a, b) => a.start_date.localeCompare(b.start_date))) {
    const key = (d.venue_city ?? 'Other').trim() || 'Other'
    if (!byCity.has(key)) { byCity.set(key, []); order.push(key) }
    byCity.get(key)!.push(d)
  }
  const groups = order.map(city => ({ city, isHome: !!home && city.toLowerCase() === home, dates: byCity.get(city)! }))
  return [...groups.filter(g => g.isHome), ...groups.filter(g => !g.isHome)]
}
