// Shared Schema.org JSON-LD helpers. Server-rendered <script type="application/ld+json">
// tags — no client JS needed. `</` is escaped so a title/description containing a
// closing script tag can't break out of the <script> element.
export function jsonLdScript(data: Record<string, unknown>): string {
  return JSON.stringify(data).replace(/</g, '\\u003c')
}

const BASE_URL = 'https://www.theshowfinder.com'

interface EventSchemaInput {
  name: string
  url: string
  startDate: string        // ISO
  endDate?: string | null
  description?: string | null
  image?: string | null
  status: 'upcoming' | 'on_sale' | 'sold_out' | 'cancelled' | string
  venue?: { name: string; address: string; city: string; postcode: string } | null
  priceFrom?: number | null
  priceCurrency?: string
  offerUrl?: string | null
  performers?: string[]
}

const EVENT_STATUS_MAP: Record<string, string> = {
  cancelled: 'https://schema.org/EventCancelled',
  sold_out:  'https://schema.org/EventScheduled', // sold out ≠ cancelled — event is still happening
}

export function buildEventSchema(input: EventSchemaInput) {
  return {
    '@context':    'https://schema.org',
    '@type':       'Event',
    name:          input.name,
    url:           input.url,
    startDate:     input.startDate,
    ...(input.endDate ? { endDate: input.endDate } : {}),
    ...(input.description ? { description: input.description } : {}),
    ...(input.image ? { image: [input.image] } : {}),
    eventStatus:   EVENT_STATUS_MAP[input.status] ?? 'https://schema.org/EventScheduled',
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    location: input.venue
      ? {
          '@type': 'Place',
          name:    input.venue.name,
          address: {
            '@type':          'PostalAddress',
            streetAddress:    input.venue.address,
            addressLocality:  input.venue.city,
            postalCode:       input.venue.postcode,
            addressCountry:   'GB',
          },
        }
      : {
          '@type': 'Place',
          name:    'United Kingdom',
          address: { '@type': 'PostalAddress', addressCountry: 'GB' },
        },
    ...(input.performers && input.performers.length
      ? { performer: input.performers.map(name => ({ '@type': 'PerformingGroup', name })) }
      : {}),
    ...(input.priceFrom
      ? {
          offers: {
            '@type':         'Offer',
            url:              input.offerUrl ?? input.url,
            price:            input.priceFrom,
            priceCurrency:    input.priceCurrency ?? 'GBP',
            availability:     input.status === 'sold_out'
              ? 'https://schema.org/SoldOut'
              : 'https://schema.org/InStock',
            validFrom:        new Date().toISOString(),
          },
        }
      : {}),
  }
}

export function buildBreadcrumbSchema(items: { name: string; url: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type':    'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type':   'ListItem',
      position:  i + 1,
      name:      item.name,
      item:      item.url,
    })),
  }
}

export function buildItemListSchema(items: { name: string; url: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type':    'ItemList',
    itemListElement: items.map((item, i) => ({
      '@type':   'ListItem',
      position:  i + 1,
      name:      item.name,
      url:       item.url,
    })),
  }
}

export function buildWebsiteSchema() {
  return {
    '@context': 'https://schema.org',
    '@type':    'WebSite',
    name:       'TheShowFinder',
    url:        BASE_URL,
    potentialAction: {
      '@type':     'SearchAction',
      target:      `${BASE_URL}/events?search={search_term_string}`,
      'query-input': 'required name=search_term_string',
    },
  }
}

export function buildOrganizationSchema() {
  return {
    '@context': 'https://schema.org',
    '@type':    'Organization',
    name:       'TheShowFinder',
    url:        BASE_URL,
    logo:       `${BASE_URL}/og-image.png`,
  }
}
