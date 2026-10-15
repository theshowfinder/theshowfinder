// Towns that belong to a main city hub. A nearby town does NOT get a page of
// its own: its shows are folded into the hub's city page ("Around Derby") and
// each card already says which town the venue is in. A town should only be
// promoted to a standalone page when it has the events, venues or search
// demand to justify one (see the local-hub notes), never automatically.
//
// `match` lists the spellings Ticketmaster and the admin form use for the
// venue city, because events are matched on the venue_city text. A town with no
// upcoming events simply doesn't show, so listing one is harmless.

export interface NearbyArea {
  /** Display name. */
  name: string
  /** venue_city spellings that belong to this town (matched case-insensitively). */
  match: string[]
}

export const NEARBY_AREAS: Record<string, NearbyArea[]> = {
  Derby: [
    { name: 'Burton upon Trent', match: ['Burton upon Trent', 'Burton-on-Trent', 'Burton on Trent'] },
    { name: 'Chesterfield',      match: ['Chesterfield'] },
    { name: 'Ilkeston',          match: ['Ilkeston'] },
    { name: 'Long Eaton',        match: ['Long Eaton'] },
    { name: 'Castle Donington',  match: ['Castle Donington', 'Donington Park'] },
  ],
}

export function getNearbyAreas(cityName: string): NearbyArea[] {
  const key = Object.keys(NEARBY_AREAS).find(k => k.toLowerCase() === cityName.trim().toLowerCase())
  return key ? NEARBY_AREAS[key] : []
}

// PostgREST `or` filter value for "venue_city is one of these spellings".
// Characters that would break the filter syntax (commas, brackets, quotes,
// wildcards) are dropped from the spellings, so a stray character in the config
// can never alter the query.
export function nearbyOrFilter(areas: NearbyArea[]): string {
  const clean = (s: string) => s.replace(/[,()*%"\\]/g, '').trim()
  const spellings = areas.flatMap(a => a.match).map(clean).filter(Boolean)
  return spellings.map(s => `venue_city.ilike.${s}`).join(',')
}

// Which configured town a venue city belongs to (null when it matches none).
export function areaForVenueCity(areas: NearbyArea[], venueCity: string | null | undefined): NearbyArea | null {
  const c = (venueCity ?? '').trim().toLowerCase()
  if (!c) return null
  return areas.find(a => a.match.some(m => m.toLowerCase() === c)) ?? null
}

// The towns that actually have a show in this list, in config order, so the
// page only names places it has something for.
export function areasWithEvents(areas: NearbyArea[], events: { venue_city: string | null }[]): NearbyArea[] {
  const present = new Set<string>()
  for (const e of events) {
    const a = areaForVenueCity(areas, e.venue_city)
    if (a) present.add(a.name)
  }
  return areas.filter(a => present.has(a.name))
}
