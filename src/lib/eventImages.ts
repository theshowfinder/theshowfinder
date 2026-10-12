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

const SPORTS_TERMS = /\b(football|soccer|fc|united|city|county|rovers?|wanderers?|rangers?|hotspur|derby|stoke|arsenal|chelsea|liverpool|leeds|cricket|rugby|boxing|wrestling|tennis|golf|darts|snooker|sport|race|racing|grand prix|motorsport|ice hockey|hockey)\b/i
const COMEDY_TERMS = /\b(comedy|comedian|stand[- ]?up|comic|laughs?|funny|humour|humor)\b/i
const THEATRE_TERMS = /\b(theatre|theater|musical|opera|ballet|play|drama|pantomime|west end)\b/i
const FAMILY_TERMS = /\b(family|kids?|children|disney|cbeebies|paw patrol|circus|magic|dinosaur|ice skating show)\b/i

export function inferEventCategory(title: string, category: EventCategory = 'concert'): EventCategory {
  if (SPORTS_TERMS.test(title)) return 'sports'
  if (COMEDY_TERMS.test(title)) return 'comedy'
  if (THEATRE_TERMS.test(title)) return 'theatre'
  if (FAMILY_TERMS.test(title)) return 'family'
  return category
}

export function fallbackEventImage(category: EventCategory, title = ''): string {
  return FALLBACKS[inferEventCategory(title, category)] ?? FALLBACKS.concert
}

export function eventImageUrl(imageUrl: string | null | undefined, category: EventCategory, title = ''): string {
  if (imageUrl && imageUrl !== GENERIC_IMAGE && !imageUrl.endsWith('/og-image.png')) return imageUrl
  return fallbackEventImage(category, title)
}

export function isGenericEventImage(imageUrl: string | null | undefined): boolean {
  return !imageUrl || imageUrl === GENERIC_IMAGE || imageUrl.endsWith('/og-image.png')
}
