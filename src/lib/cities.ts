// Shared 36-city list — used by the city pages and the admin "Local
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
]
