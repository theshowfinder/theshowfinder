// Shared 40-city list — used by the city pages and the admin "Local
// Businesses" form so both stay in sync (a city name here must match what
// venues.city / events_with_venue.venue_city contain, matched case-
// insensitively via .ilike() at the query sites).

export interface City {
  name: string
  emoji: string
}

export const CITIES: City[] = [
  { name: 'London',         emoji: '🎡' },
  { name: 'Manchester',     emoji: '🐝' },
  { name: 'Birmingham',     emoji: '🏭' },
  { name: 'Glasgow',        emoji: '🎭' },
  { name: 'Edinburgh',      emoji: '🏰' },
  { name: 'Leeds',          emoji: '🦉' },
  { name: 'Liverpool',      emoji: '⚽' },
  { name: 'Bristol',        emoji: '🌉' },
  { name: 'Cardiff',        emoji: '🐉' },
  { name: 'Belfast',        emoji: '☘️' },
  { name: 'Nottingham',     emoji: '🏹' },
  { name: 'Newcastle',      emoji: '⚫' },
  { name: 'Leicester',      emoji: '🦊' },
  { name: 'Sheffield',      emoji: '⚙️' },
  { name: 'Derby',          emoji: '🐏' },
  { name: 'Coventry',       emoji: '🕊️' },
  { name: 'Southampton',    emoji: '⚓' },
  { name: 'Portsmouth',     emoji: '🚢' },
  { name: 'Norwich',        emoji: '🐦' },
  { name: 'Brighton',       emoji: '🎠' },
  { name: 'Oxford',         emoji: '🎓' },
  { name: 'Cambridge',      emoji: '🚣' },
  { name: 'Exeter',         emoji: '🏛️' },
  { name: 'Plymouth',       emoji: '⛵' },
  { name: 'Hull',           emoji: '🐟' },
  { name: 'Middlesbrough',  emoji: '🏗️' },
  { name: 'Sunderland',     emoji: '🏟️' },
  { name: 'Bradford',       emoji: '🌺' },
  { name: 'Reading',        emoji: '📖' },
  { name: 'Milton Keynes',  emoji: '🦁' },
  { name: 'Bournemouth',    emoji: '🏖️' },
  { name: 'Ipswich',        emoji: '🌊' },
  { name: 'Stoke-on-Trent', emoji: '🏺' },
  { name: 'Wolverhampton',  emoji: '🐺' },
  { name: 'Swansea',        emoji: '🦢' },
  { name: 'Aberdeen',       emoji: '🪨' },
  { name: 'York',           emoji: '🏰' },
  { name: 'Blackpool',      emoji: '🎡' },
  { name: 'Scarborough',    emoji: '🏖️' },
  { name: 'Bath',           emoji: '♨️' },
]

// The /cities/<name> page for a place, or null when it is not one of our cities.
// Venues exist in many towns that have no city page (Swindon, Derry, Carlisle...);
// linking to /cities/<those> 404s, and Search Console was reporting dozens of
// "Not found (404)" URLs that came from exactly these links. Case-insensitive,
// returns the canonical casing.
export function cityPagePath(city: string | null | undefined): string | null {
  const wanted = city?.trim().toLowerCase()
  if (!wanted) return null
  const match = CITIES.find(c => c.name.toLowerCase() === wanted)
  return match ? `/cities/${encodeURIComponent(match.name)}` : null
}
