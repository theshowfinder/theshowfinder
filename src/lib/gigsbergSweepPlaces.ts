// Which places the Gigsberg sweep searches: our 40 cities first, then every other town that has at least one
// upcoming show on the site. Pure (no '@/' imports) so it runs under `node --test`.

const tidy = (s: string) => s.replace(/\s+/g, ' ').trim()

export function sweepPlaces(cities: readonly string[], venueCities: readonly (string | null | undefined)[]): string[] {
  const seen = new Set(cities.map(c => c.toLowerCase()))
  const towns = new Map<string, string>()
  for (const raw of venueCities) {
    const name = tidy(raw ?? '')
    const key = name.toLowerCase()
    // Real town names only: no postcodes / numbers, no "London, UK" style or over-long values.
    if (!name || name.length > 30 || /\d|,/.test(name) || seen.has(key) || towns.has(key)) continue
    towns.set(key, name)
  }
  return [...cities, ...[...towns.values()].sort((a, b) => a.localeCompare(b))]
}
