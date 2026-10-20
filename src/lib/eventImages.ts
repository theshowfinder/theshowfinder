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

// Our own pictures for clubs whose fixtures are a big part of a city's listings. Original artwork (a floodlit
// matchday scene in the club's colours with the club and ground names on the boards, no crest or logo),
// used for the club's matches and its artist page instead of a stock/feed image. Add a club by adding a line.
const TEAM_IMAGES: Array<{ test: RegExp; path: string }> = [
  { test: /^derby county\b/i, path: '/event-fallbacks/teams/derby-county.jpg' },
]

/** Path of our own image for a club ("Derby County vs Stoke City", "Derby County FC"), or null. */
export function teamImageFor(name: string | null | undefined): string | null {
  if (!name) return null
  return TEAM_IMAGES.find(t => t.test.test(name.trim()))?.path ?? null
}

/** An artist's picture, with our own image winning for clubs we have artwork for. */
export function artistPhotoUrl(name: string | null | undefined, imageUrl: string | null | undefined): string | null {
  return teamImageFor(name) ?? imageUrl ?? null
}

export function inferEventCategory(title: string, category: EventCategory = 'concert'): EventCategory {
  if (THEATRE_TERMS.test(title)) return 'theatre'
  if (COMEDY_TERMS.test(title)) return 'comedy'
  if (FAMILY_TERMS.test(title)) return 'family'
  if (SPORTS_TERMS.test(title)) return 'sports'
  return category
}

export function fallbackEventImage(category: EventCategory, title = ''): string {
  return FALLBACKS[inferEventCategory(title, category)] ?? FALLBACKS.concert
}

export function eventImageUrl(imageUrl: string | null | undefined, category: EventCategory, title = ''): string {
  const team = teamImageFor(title)
  if (team && inferEventCategory(title, category) === 'sports') return team
  if (imageUrl && imageUrl !== GENERIC_IMAGE && !imageUrl.endsWith('/og-image.png')) return imageUrl
  return fallbackEventImage(category, title)
}

export function isGenericEventImage(imageUrl: string | null | undefined): boolean {
  return !imageUrl || imageUrl === GENERIC_IMAGE || imageUrl.endsWith('/og-image.png')
}
