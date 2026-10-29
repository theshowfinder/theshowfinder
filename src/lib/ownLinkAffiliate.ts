// Organiser / tourism-site links (events.own_ticket_url, info_links) are shown as they were scraped. Some of them
// are really Ticketmaster or See Tickets pages, and some are SOMEONE ELSE'S affiliate links (a tourism board's own
// Impact link for Ticketmaster: 29 Oct 2026, 49 upcoming shows). This sends those through our own /out hop, so the
// visitor reaches the same page and the commission is ours. Everything else is returned unchanged. Pure.
import { outLink } from './affiliate.ts'

const TM_HOST = /(^|\.)ticketmaster\.(co\.uk|ie|com)$/i
const IMPACT_HOST = /(^|\.)(evyy\.net|pxf\.io|tm\d{4}\.net|sjv\.io)$/i

function parse(value: string): URL | null {
  try { const u = new URL(value); return u.protocol === 'http:' || u.protocol === 'https:' ? u : null } catch { return null }
}

/** The Ticketmaster or See Tickets page a link really points at, with the provider, or null. */
export function sellerPage(value: string | null | undefined): { provider: 'tm' | 'st'; page: string } | null {
  const url = parse(value ?? '')
  if (!url) return null
  const host = url.hostname.toLowerCase()
  if (TM_HOST.test(host)) return { provider: 'tm', page: url.toString() }
  if (/(^|\.)seetickets\.com$/.test(host)) return { provider: 'st', page: url.toString() }
  // Another partner's Impact link: the real page is in ?u=
  if (IMPACT_HOST.test(host)) {
    const inner = parse(url.searchParams.get('u') ?? '')
    if (inner && TM_HOST.test(inner.hostname)) return { provider: 'tm', page: inner.toString() }
    return null
  }
  // Another partner's Awin link to See Tickets: the real page is in ?ued=
  if (/(^|\.)awin1\.com$/.test(host)) {
    const inner = parse(url.searchParams.get('ued') ?? '')
    if (inner && /(^|\.)seetickets\.com$/.test(inner.hostname.toLowerCase())) return { provider: 'st', page: inner.toString() }
  }
  return null
}

/** The link to put on the button: our /out hop for Ticketmaster / See Tickets pages, otherwise the link itself. */
export function monetisedOwnLink(value: string | null, subId?: string): string | null {
  if (!value) return value
  const seller = sellerPage(value)
  return seller ? outLink(seller.provider, seller.page, subId) : value
}
