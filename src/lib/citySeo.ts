const BASE_URL = 'https://www.theshowfinder.com'

export function cityCanonicalUrl(cityName: string): string {
  return `${BASE_URL}/cities/${encodeURIComponent(cityName)}`
}

export function cityThisWeekCanonicalUrl(cityName: string): string {
  return `${cityCanonicalUrl(cityName)}/this-week`
}

export function cityThisWeekendCanonicalUrl(cityName: string): string {
  return `${cityCanonicalUrl(cityName)}/this-weekend`
}

export function cityThisWeekendTitle(cityName: string): string {
  return `Things To Do in ${cityName} This Weekend`
}

export function cityThisWeekendDescription(cityName: string): string {
  return `What's on in ${cityName} this weekend: gigs, concerts, theatre, comedy and sport from Friday evening to Sunday, with dates and ticket links.`
}

// Searchers type "{city} concerts" or "concerts in {city}": lead with the city
// and the word concerts. The layout adds " | TheShowFinder", so keep this short.
export function cityPageTitle(cityName: string): string {
  return `${cityName} Concerts, Shows & Live Events`
}

/** "120+": a rounded-down count that will not change every day, or null when small. */
export function roundedShowCount(n: number | null | undefined): string | null {
  if (!n || n < 10) return null
  const step = n >= 100 ? 50 : 10
  return `${Math.floor(n / step) * step}+`
}

export function cityPageDescription(cityName: string, upcomingCount?: number | null): string {
  const count = roundedShowCount(upcomingCount)
  const what = count
    ? `${count} upcoming concerts, theatre, comedy, sport and family shows`
    : 'concerts, theatre, comedy, sport and family events'
  return `What's on in ${cityName}: ${what}, plus tonight's gigs, presales and ticket links.`
}

export function cityThisWeekTitle(cityName: string): string {
  return `Events This Week in ${cityName}`
}

export function cityThisWeekDescription(cityName: string): string {
  return `See what's on this week in ${cityName}, including concerts, theatre, comedy, sport and family events with dates and ticket links.`
}

export function buildCityCollectionSchema(input: {
  cityName: string
  url: string
  name: string
  description: string
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: input.name,
    url: input.url,
    description: input.description,
    about: {
      '@type': 'City',
      name: input.cityName,
      address: {
        '@type': 'PostalAddress',
        addressCountry: 'GB',
      },
    },
    isPartOf: {
      '@type': 'WebSite',
      name: 'TheShowFinder',
      url: BASE_URL,
    },
  }
}
