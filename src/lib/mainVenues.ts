// The "main venues" a local partner is labelled against ("3 min walk to Theatre Royal"). Pure, so it is testable.
// Venue capacity is missing for most venues, so venues are ranked by how many upcoming shows they hold, with any
// venue that does have a capacity (the arenas) first. Duplicate rows ("Royal Concert Hall" / "Royal Concert Hall
// Nottingham") are merged, and combined rows ("Theatre Royal and Royal Concert Hall") count as both venues.
import { metresApart, type AreaVenue } from './localPlacements.ts'

export interface VenueRow { name: string; lat: number | null; lng: number | null; capacity?: number | null; upcoming?: number | null }
export interface MainVenue extends AreaVenue { lat: number; lng: number; capacity: number | null; upcoming: number }

const MAX_WALK_M = 1600 // about a 20-minute walk (distanceLabel: metres * 1.3 / 80)

export function venueKey(name: string, city?: string | null): string {
  let n = name.toLowerCase()
  if (city) n = n.split(city.toLowerCase()).join(' ')
  return n.replace(/^the\s+/, '').replace(/[^a-z0-9]/g, '')
}

/** Ranked, de-duplicated main venues for a city (at most `max`). */
export function rankMainVenues(rows: readonly VenueRow[], city?: string | null, max = 12): MainVenue[] {
  const merged = new Map<string, MainVenue>()
  for (const row of rows) {
    if (row.lat == null || row.lng == null) continue
    if (/\bvarious\b/i.test(row.name)) continue
    const parts = row.name.split(/\s+(?:and|&)\s+/i).map(p => p.trim()).filter(p => p.length >= 3)
    const names = parts.length > 1 ? parts : [row.name.trim()]
    for (const raw of names) {
      const name = city ? raw.replace(new RegExp(`\\s*,?\\s*${city.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'), '').replace(new RegExp(`^${city.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')},?\\s+`, 'i'), '') || raw : raw
      const key = venueKey(name, city)
      if (!key) continue
      const seen = merged.get(key)
      if (seen) {
        seen.upcoming += row.upcoming ?? 0
        seen.capacity = Math.max(seen.capacity ?? 0, row.capacity ?? 0) || null
        if (name.length < seen.name.length) seen.name = name
      } else {
        merged.set(key, { name, lat: row.lat, lng: row.lng, capacity: row.capacity ?? null, upcoming: row.upcoming ?? 0 })
      }
    }
  }
  return [...merged.values()]
    .sort((a, b) => (b.capacity ?? 0) - (a.capacity ?? 0) || b.upcoming - a.upcoming)
    .slice(0, max)
}

/**
 * The venues to name on a partner: the nearest `nearest` main venues within walking reach, plus the city's
 * biggest venue (an arena with a known capacity) if it is within reach and not already named. `exclude` drops the
 * show's own venue on a show page (named separately there).
 */
export function venuesToName(point: { lat: number | null; lng: number | null }, venues: readonly MainVenue[], nearest = 3, exclude?: string | null, city?: string | null): { name: string; metres: number }[] {
  if (point.lat == null || point.lng == null) return []
  const p = { lat: point.lat, lng: point.lng }
  const skip = exclude ? venueKey(exclude, city) : null
  const within = venues
    .filter(v => !skip || (venueKey(v.name, city) !== skip && !skip.includes(venueKey(v.name, city))))
    .map(v => ({ v, metres: metresApart(p, v) }))
    .filter(x => x.metres <= MAX_WALK_M)
  const chosen = [...within].sort((a, b) => a.metres - b.metres).slice(0, nearest)
  const biggest = within.filter(x => (x.v.capacity ?? 0) > 0).sort((a, b) => (b.v.capacity ?? 0) - (a.v.capacity ?? 0))[0]
  if (biggest && !chosen.includes(biggest)) chosen.push(biggest)
  return chosen.sort((a, b) => a.metres - b.metres).map(x => ({ name: x.v.name, metres: x.metres }))
}
