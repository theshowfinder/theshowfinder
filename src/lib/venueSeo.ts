// Search-result copy and structured data for venue pages. Pure functions, no
// imports, so `node --test` can run them. Everything is built from facts we
// hold (venue name, city, capacity, upcoming listings) — nothing invented.

const BASE_URL = 'https://www.theshowfinder.com'

/** The root layout appends " | TheShowFinder" (16 chars); keep the whole title under ~60. */
const TITLE_BUDGET = 44

export function venueSeoTitle(name: string, city: string): string {
  const cityInName = name.toLowerCase().includes(city.toLowerCase())
  const options = [
    cityInName ? `${name}: Events & Tickets` : `${name}, ${city}: Events & Tickets`,
    `${name} Events & Tickets`,
    `${name} Tickets`,
    name,
  ]
  return options.find(o => o.length <= TITLE_BUDGET) ?? name
}

function joinNatural(items: string[]): string {
  if (items.length <= 1) return items.join('')
  if (items.length === 2) return `${items[0]} and ${items[1]}`
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`
}

/** Meta description, at most 160 characters. */
export function venueSeoDescription(input: {
  name: string
  city: string
  capacity: number | null
  upcomingCount: number
  nextTitles: string[]
}): string {
  const { name, city, capacity, upcomingCount } = input
  const limit = 160
  if (upcomingCount <= 0) {
    return `${name} in ${city}: venue details and ticket options. No shows are listed right now. Follow the venue to hear when new dates are added.`.slice(0, limit)
  }
  const shows = `${upcomingCount} upcoming show${upcomingCount === 1 ? '' : 's'}`
  const tail = ' Find tickets in one place.'
  const unique = [...new Set(input.nextTitles.map(t => t.trim()).filter(Boolean))]
  for (let n = Math.min(3, unique.length); n >= 0; n--) {
    const acts = n > 0 ? `, including ${joinNatural(unique.slice(0, n))}` : ''
    const cap = capacity ? ` (capacity ${capacity.toLocaleString('en-GB')})` : ''
    const text = `What's on at ${name}, ${city}${cap}: ${shows}${acts}.${tail}`
    if (text.length <= limit) return text
  }
  return `What's on at ${name}, ${city}: ${shows}.${tail}`.slice(0, limit)
}

export interface VenueSchemaInput {
  name: string
  slug: string
  address: string
  city: string
  postcode: string
  capacity: number | null
  website: string | null
}

/** schema.org Place for the venue, only with fields we actually hold. */
export function buildVenueSchema(v: VenueSchemaInput) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Place',
    name: v.name,
    url: `${BASE_URL}/venues/${v.slug}`,
    address: {
      '@type': 'PostalAddress',
      ...(v.address ? { streetAddress: v.address } : {}),
      addressLocality: v.city,
      ...(v.postcode ? { postalCode: v.postcode } : {}),
      addressCountry: 'GB',
    },
    ...(v.capacity && v.capacity > 0 ? { maximumAttendeeCapacity: v.capacity } : {}),
    ...(v.website ? { sameAs: [v.website] } : {}),
  }
}
