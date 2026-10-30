import type { EventCategory } from '@/lib/types/database'

const GENERIC_IMAGE = 'https://www.theshowfinder.com/og-image.png'

const FALLBACKS: Record<EventCategory, string> = {
  concert: '/event-fallbacks/concert.png',
  theatre: '/event-fallbacks/theatre.png',
  comedy: '/event-fallbacks/comedy.png',
  sports: '/event-fallbacks/sports.png',
  family: '/event-fallbacks/family.png',
  local: '/event-fallbacks/family.png',
}

const SPORTS_TERMS = /\b(football|soccer|fc|vs\.?|versus|match|fixture|united|rovers?|wanderers?|rangers?|hotspur|derby county|stoke city|arsenal|chelsea|liverpool|leeds|cricket|rugby|boxing|wrestling|tennis|golf|darts|snooker|sport|race|racing|grand prix|motorsport|ice hockey|hockey)\b/i
const COMEDY_TERMS = /\b(comedy|comedian|stand[- ]?up|comic|laughs?|funny|humour|humor)\b/i
const THEATRE_TERMS = /\b(theatre|theater|musical|opera|ballet|play|drama|pantomime|west end)\b/i
const FAMILY_TERMS = /\b(family|kids?|children|disney|cbeebies|paw patrol|circus|magic|dinosaur|ice skating show)\b/i
// Words that make a "circus" or "magic" night an adult show, not a family one ("The Circus Of Fools", queer cabaret).
const ADULT_TERMS = /\b(adults?|adult only|18\+|over 18s?|burlesque|cabaret|drag|\w*queer|lesbian|lgbtq?|after dark|xxx)\b/i

// Our own pictures for football clubs: passionate supporters in the club's colours holding scarves with the
// club's name (original artwork, no crests or logos). Used for the club's home fixtures ("Burnley FC vs Stoke
// City") and its artist page instead of a stock/feed image. Add a club with one line plus its image in
// public/event-fallbacks/teams/. `name` is a regex fragment for the club's name as it appears in titles.
const TEAMS: Array<{ name: string; image: string }> = [
  { name: 'derby county', image: 'derby-county' },
  { name: 'burnley', image: 'burnley' },
  { name: 'portsmouth', image: 'portsmouth' },
  { name: 'wigan athletic', image: 'wigan-athletic' },
  { name: 'blackburn rovers', image: 'blackburn-rovers' },
  { name: 'bradford city', image: 'bradford-city' },
  { name: 'chesterfield', image: 'chesterfield' },
  { name: 'blackpool', image: 'blackpool' },
  { name: 'luton town', image: 'luton-town' },
  { name: 'motherwell', image: 'motherwell' },
  { name: 'crystal palace', image: 'crystal-palace' },
  { name: 'barnsley', image: 'barnsley' },
  { name: 'notts county', image: 'notts-county' },
  { name: 'qpr|queens park rangers', image: 'queens-park-rangers' },
  { name: 'lincoln city', image: 'lincoln-city' },
  { name: 'bristol rovers', image: 'bristol-rovers' },
  { name: 'bromley', image: 'bromley' },
  { name: 'celtic', image: 'celtic' },
  { name: 'birmingham city', image: 'birmingham-city' },
  { name: 'west ham( united)?', image: 'west-ham-united' },
  { name: 'tottenham( hotspur)?', image: 'tottenham-hotspur' },
  { name: 'everton', image: 'everton' },
  { name: 'nottingham forest', image: 'nottingham-forest' },
]

// "Derby County", "Derby County FC", "Burnley FC Women" (the club, optionally FC/AFC and a women's side).
const CLUB_SUFFIX = '(?:\\s+(?:fc|afc))?(?:\\s+(?:women|ladies|lionesses))?'
const TEAM_PATTERNS = TEAMS.map(t => ({
  // a home fixture: the title starts with the club and then "vs"/"v"
  fixture: new RegExp(`^(?:${t.name})${CLUB_SUFFIX}\\s+(?:vs\\.?|v)\\s`, 'i'),
  // the club's own artist page
  club: new RegExp(`^(?:${t.name})${CLUB_SUFFIX}$`, 'i'),
  path: `/event-fallbacks/teams/${t.image}.jpg`,
}))

/** Our picture for a club's home fixture title ("Derby County vs Stoke City"), or null. */
export function teamFixtureImage(title: string | null | undefined): string | null {
  if (!title) return null
  const t = title.trim()
  return TEAM_PATTERNS.find(p => p.fixture.test(t))?.path ?? null
}

/** Our picture for a club's artist page ("Derby County FC"), or null. */
export function teamImageFor(name: string | null | undefined): string | null {
  if (!name) return null
  const n = name.trim()
  return TEAM_PATTERNS.find(p => p.club.test(n))?.path ?? null
}

/** An artist's picture, with our own image winning for clubs we have artwork for. */
export function artistPhotoUrl(name: string | null | undefined, imageUrl: string | null | undefined): string | null {
  return teamImageFor(name) ?? imageUrl ?? null
}

export function inferEventCategory(title: string, category: EventCategory = 'concert'): EventCategory {
  if (THEATRE_TERMS.test(title)) return 'theatre'
  if (COMEDY_TERMS.test(title)) return 'comedy'
  if (FAMILY_TERMS.test(title) && !ADULT_TERMS.test(title)) return 'family'
  if (SPORTS_TERMS.test(title)) return 'sports'
  return category
}

export function fallbackEventImage(category: EventCategory, title = ''): string {
  return FALLBACKS[inferEventCategory(title, category)] ?? FALLBACKS.concert
}

// Sites that refuse an image when the browser says it was asked for by another site (hotlink protection): the
// Stephen Joseph Theatre answers 403 to any request with our Referer. These go through our own image optimiser,
// which fetches them server-side (no Referer) and caches the result. The host must also be in next.config images.
const HOTLINK_BLOCKED_HOSTS = new Set(['sjt.uk.com'])

/** The URL a browser should load for a stored image: as-is, or via /_next/image when its host blocks hotlinking. */
export function displayImageUrl(url: string): string {
  try {
    if (HOTLINK_BLOCKED_HOSTS.has(new URL(url).hostname)) return `/_next/image?url=${encodeURIComponent(url)}&w=1080&q=75`
  } catch { /* not an absolute URL: leave it */ }
  return url
}

export function eventImageUrl(imageUrl: string | null | undefined, category: EventCategory, title = ''): string {
  const team = teamFixtureImage(title)
  if (team) return team
  if (imageUrl && imageUrl !== GENERIC_IMAGE && !imageUrl.endsWith('/og-image.png')) return displayImageUrl(imageUrl)
  return fallbackEventImage(category, title)
}

export function isGenericEventImage(imageUrl: string | null | undefined): boolean {
  return !imageUrl || imageUrl === GENERIC_IMAGE || imageUrl.endsWith('/og-image.png')
}
