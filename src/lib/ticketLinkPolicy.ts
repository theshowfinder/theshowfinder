// Pure logic for Tonight's ticket-link policy — deliberately stricter
// than the event-detail page's buildProviders() (src/app/events/[slug]/
// page.tsx), which falls back to a generic provider search URL for every
// event. Tonight must never invent a link: it only ever shows a link
// TheShowFinder actually has for this specific event or its headliner
// artist, labelled neutrally, never claiming availability the data
// doesn't confirm. No '@/' imports and no npm packages, matching
// on-sale.ts/intelligence.ts.

import { extractArtistName } from './on-sale.ts'
import { isBareProviderHomepage } from './intelligence.ts'
import {
  getTicketmasterAffiliateLink,
  getSeeTicketsAffiliateLink,
  getViagogoAffiliateLink,
  getStubHubAffiliateLink,
  getGigsbergAffiliateLink,
  getVividSeatsAffiliateLink,
  getEventimAffiliateLink,
} from './affiliate.ts'
import type { Artist } from './types/database'

export interface TonightTicketEvent {
  title:          string
  tickets_url:    string | null
  own_ticket_url: string | null
}

export type TicketOfferKind = 'official' | 'direct' | 'resale'

export interface TicketOffer {
  kind:  TicketOfferKind
  label: string
  href:  string
}

// Case-insensitive exact match on the artist name extracted from the
// event title — the same matcher groupEventsByArtist already uses
// (on-sale.ts), so Tonight's artist lookup can never disagree with how
// every other section on the site groups events to artists.
export function findHeadlinerArtist(title: string, artists: Artist[]): Artist | null {
  const name = extractArtistName(title).toLowerCase()
  return artists.find(a => a.name.toLowerCase() === name) ?? null
}

// Fixed lookup order across an artist's provider-link columns — first
// non-bare-homepage link wins. One resale link is enough per event card;
// showing all eight would be clutter, not usefulness, and the order
// itself carries no editorial weight (it's just "first one that's
// actually usable").
const RESALE_FIELDS: (keyof Pick<
  Artist,
  'viagogo_url' | 'stubhub_url' | 'gigsberg_url' | 'vivid_seats_url' | 'see_tickets_url' | 'eventim_url' | 'axs_url' | 'gigantic_url'
>)[] = ['viagogo_url', 'stubhub_url', 'gigsberg_url', 'vivid_seats_url', 'see_tickets_url', 'eventim_url', 'axs_url', 'gigantic_url']

function affiliateUrl(field: string, url: string): string {
  switch (field) {
    case 'viagogo_url': return getViagogoAffiliateLink(url)
    case 'stubhub_url': return getStubHubAffiliateLink(url)
    case 'gigsberg_url': return getGigsbergAffiliateLink(url)
    case 'vivid_seats_url': return getVividSeatsAffiliateLink(url)
    case 'see_tickets_url': return getSeeTicketsAffiliateLink(url)
    case 'eventim_url': return getEventimAffiliateLink(url)
    default: return url
  }
}

// The three possible offers, in display priority order, each included
// only when a genuine, specific link exists:
//  - official: event.tickets_url (Ticketmaster/sync-sourced — the real
//    official route for this exact show)
//  - direct:   event.own_ticket_url (TheShowFinder's own listing for
//    this exact show)
//  - resale:   the headliner artist's first non-bare-homepage provider
//    link — genuinely tour-specific, not a generic marketplace homepage
// Never falls back to a constructed search URL or a bare provider
// homepage — an event with none of the above simply gets no offer here
// (its card still links to the internal /events/[slug] page, which is
// always a safe destination).
export function buildTonightTicketOffers(event: TonightTicketEvent, artists: Artist[]): TicketOffer[] {
  const offers: TicketOffer[] = []

  if (event.tickets_url) {
    offers.push({ kind: 'official', label: 'Find tickets', href: getTicketmasterAffiliateLink(event.tickets_url) })
  }
  if (event.own_ticket_url) {
    offers.push({ kind: 'direct', label: 'Check availability', href: event.own_ticket_url })
  }

  const artist = findHeadlinerArtist(event.title, artists)
  if (artist) {
    for (const field of RESALE_FIELDS) {
      const url = artist[field] as string | null
      if (url && !isBareProviderHomepage(url)) {
        offers.push({ kind: 'resale', label: 'Resale tickets', href: affiliateUrl(field, url) })
        break
      }
    }
  }

  return offers
}
