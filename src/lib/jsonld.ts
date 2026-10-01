// Shared Schema.org JSON-LD helpers. Server-rendered <script type="application/ld+json">
// tags — no client JS needed. `</` is escaped so a title/description containing a
// closing script tag can't break out of the <script> element.
import { SOCIAL_LINKS } from './socialLinks.ts'

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
  venue?: { name: string; address: string; city: string; postcode: string; website?: string | null } | null
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
    // The venue is the best available proxy for "organizer" — Ticketmaster's
    // feed doesn't supply a promoter/production-company name, and the venue
    // is genuinely the party that booked and is hosting the show. Falls back
    // to TheShowFinder itself only on the rare event with no venue at all.
    // `url` is only added when the venues table actually has a website for
    // that venue (a real, looked-up fact) — never invented or filled with a
    // placeholder when it's missing, which is still the common case today.
    organizer: input.venue
      ? {
          '@type': 'Organization',
          name:    input.venue.name,
          ...(input.venue.website ? { url: input.venue.website } : {}),
        }
      : { '@type': 'Organization', name: 'TheShowFinder', url: BASE_URL },
    ...(input.performers && input.performers.length
      ? { performer: input.performers.map(name => ({ '@type': 'PerformingGroup', name })) }
      : {}),
    // offers is always present — every event page has a ticket URL to point
    // to (the real tickets_url, or the event page itself as a fallback) and
    // this site is UK-only so priceCurrency is always correctly 'GBP'. Only
    // `price` is conditional: Ticketmaster's UK feed supplies almost no
    // price_from data (and when it does, it's the real lowest listed price
    // — exactly what Google's Event guidance wants for this field), and a
    // missing number is honest where a guessed one would not be — never
    // fabricate a price. Checked against `null`/`undefined` rather than
    // truthiness so a genuinely free event (priceFrom === 0) still reports
    // its real price instead of being silently treated as "unknown" and
    // dropped. Also guards out a negative value, which would only ever be
    // bad data, never a real price.
    offers: {
      '@type':      'Offer',
      url:           input.offerUrl ?? input.url,
      priceCurrency: input.priceCurrency ?? 'GBP',
      availability:  input.status === 'sold_out'
        ? 'https://schema.org/SoldOut'
        : 'https://schema.org/InStock',
      validFrom:     new Date().toISOString(),
      ...(input.priceFrom != null && input.priceFrom >= 0 ? { price: input.priceFrom } : {}),
    },
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

// `sameAs` lists TheShowFinder's official social profile URLs — the
// standard Schema.org way to link an Organization to its verified
// social accounts (feeds Google's knowledge-panel/entity understanding).
// Sourced from socialLinks.ts so the three URLs live in exactly one
// place, matching the footer's "Follow TheShowFinder" links.
export function buildOrganizationSchema() {
  return {
    '@context': 'https://schema.org',
    '@type':    'Organization',
    name:       'TheShowFinder',
    url:        BASE_URL,
    logo:       `${BASE_URL}/og-image.png`,
    sameAs:     SOCIAL_LINKS.map((link) => link.href),
  }
}
