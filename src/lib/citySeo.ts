const BASE_URL = 'https://www.theshowfinder.com'

export function cityCanonicalUrl(cityName: string): string {
  return `${BASE_URL}/cities/${encodeURIComponent(cityName)}`
}

export function cityThisWeekCanonicalUrl(cityName: string): string {
  return `${cityCanonicalUrl(cityName)}/this-week`
}

export function cityPageTitle(cityName: string): string {
  return `Concerts & Live Events in ${cityName}`
}

export function cityPageDescription(cityName: string): string {
  return `What's on in ${cityName}: concerts, theatre, comedy, sport and family events, plus tonight's shows, presales and ticket links.`
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
