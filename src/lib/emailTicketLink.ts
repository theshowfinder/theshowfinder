// "Buy tickets" in our emails goes straight to the seller (like Songkick's
// alerts), through our /out hop so the click is credited to us and email
// security scanners that "click" every link never register an affiliate click.
// Sellers we have no affiliate route for, or no ticket link at all, fall back
// to our own event page. Pure module (no '@/' imports).

import { outLink } from './affiliate.ts'

export type EmailSeller = 'tm' | 'st'

export function sellerFromUrl(url: string | null | undefined): EmailSeller | null {
  if (!url) return null
  let host: string
  try { host = new URL(url).hostname.toLowerCase() } catch { return null }
  if (/(^|\.)ticketmaster\.(co\.uk|com|ie)$/.test(host) || /(^|\.)livenation\.co\.uk$/.test(host)) return 'tm'
  if (/(^|\.)seetickets\.com$/.test(host)) return 'st'
  return null
}

export function sellerName(seller: EmailSeller): string {
  return seller === 'tm' ? 'Ticketmaster' : 'See Tickets'
}

/** Absolute link for an email button, or null when we should send people to our own page instead. */
export function emailTicketLink(ticketsUrl: string | null | undefined, subId: string): { href: string; seller: string } | null {
  const seller = sellerFromUrl(ticketsUrl)
  if (!seller || !ticketsUrl) return null
  return { href: outLink(seller, ticketsUrl, subId, true), seller: sellerName(seller) }
}
