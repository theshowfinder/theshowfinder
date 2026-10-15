// Impact affiliate tracking for Ticketmaster UK links.
const IMPACT_PARTNER_ID     = '7328658'  // TheShowFinder's Impact media partner ID
const TICKETMASTER_CAMPAIGN_ID = '1965662'  // Ticketmaster UK campaign ID on Impact
const TICKETMASTER_AD_ID    = '24023'    // Ad ID for the Ticketmaster UK campaign

// Wraps a ticketmaster.co.uk destination URL in TheShowFinder's Impact
// affiliate tracking link so click-throughs are attributed correctly.
export function getTicketmasterAffiliateLink(destinationUrl: string, subId?: string): string {
  const encoded = encodeURIComponent(destinationUrl)
  const sub = cleanSubId(subId)
  // subId1 is Impact's free-text tracking field: it comes back on every click
  // and sale in the Impact reports, so commissions can be matched to the page
  // (and show) that earned them.
  return `https://ticketmaster.evyy.net/c/${IMPACT_PARTNER_ID}/${TICKETMASTER_CAMPAIGN_ID}/${TICKETMASTER_AD_ID}?u=${encoded}${sub ? `&subId1=${sub}` : ''}`
}

// Tracking tags are limited to letters, digits, dash and underscore (so they can
// never break the link or smuggle in extra parameters) and 50 characters.
export function cleanSubId(value: string | null | undefined): string {
  return (value ?? '').replace(/[^A-Za-z0-9_-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 50)
}

// Ticketmaster UK's Impact terms pay 0% on sales during an event's presale and
// the first 24 hours of its general on-sale (1% otherwise). True when a click
// now would be commissionable. Unknown dates count as eligible: the rule only
// applies when we can see the window.
export function isTicketmasterCommissionEligible(
  event: { presale_start?: string | null; public_onsale_start?: string | null; onsale_date?: string | null },
  now: Date = new Date(),
): boolean {
  const generalOnSale = event.public_onsale_start ?? event.onsale_date ?? null
  if (!generalOnSale) return true
  const onSaleMs = new Date(generalOnSale).getTime()
  if (!Number.isFinite(onSaleMs)) return true
  const presaleMs = event.presale_start ? new Date(event.presale_start).getTime() : NaN
  const windowStart = Number.isFinite(presaleMs) && presaleMs < onSaleMs ? presaleMs : onSaleMs
  const windowEnd = onSaleMs + 24 * 60 * 60 * 1000
  const t = now.getTime()
  return !(t >= windowStart && t < windowEnd)
}

// Awin tracking for See Tickets UK links.
const AWIN_PUBLISHER_ID    = '2896631'  // TheShowFinder's Awin publisher ID
const SEE_TICKETS_MERCHANT_ID = '7816'  // See Tickets UK's advertiser ID on Awin

// True for a URL that is already an Awin click-tracking link (awin1.com or a
// subdomain), whether pclick.php from the product feed or cread.php.
export function isAwinTrackingLink(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase()
    return host === 'awin1.com' || host.endsWith('.awin1.com')
  } catch {
    return false
  }
}

// Wraps a seetickets.com destination URL in TheShowFinder's Awin affiliate
// tracking link so click-throughs are attributed correctly. Confirmed
// against Awin's own Link Builder tool for the See Tickets UK programme.
export function getSeeTicketsAffiliateLink(destinationUrl: string, subId?: string): string {
  // The See Tickets product feed supplies its own Awin tracking link
  // (aw_deep_link, already carrying our publisher and merchant IDs). Wrapping
  // that in a second cread.php link nests one tracking link inside another,
  // which risks lost attribution — so an existing Awin link is returned as is.
  if (isAwinTrackingLink(destinationUrl)) return destinationUrl
  const encoded = encodeURIComponent(destinationUrl)
  const sub = cleanSubId(subId)
  // clickref is Awin's free-text tracking field (shown against each transaction).
  return `https://www.awin1.com/cread.php?awinmid=${SEE_TICKETS_MERCHANT_ID}&awinaffid=${AWIN_PUBLISHER_ID}&ued=${encoded}${sub ? `&clickref=${sub}` : ''}`
}

// Generic wrapper for affiliate networks where TheShowFinder only has a
// tracking-link *template* rather than a fixed merchant/publisher ID pair
// (used for Partnerize, and already the pattern for Booking.com/Trainline
// on the city pages). The env var's value is the network's full
// click-tracking URL with `{url}` where the destination should go, e.g.
// VIAGOGO_AFFILIATE_TEMPLATE="https://prf.hn/click/camref:XXXXX/destination:{url}"
// Until that env var is set in Vercel, this returns the plain destination
// link unchanged — no code change or redeploy needed once the real
// template is available, just set the env var.
export function wrapWithEnvTemplate(directUrl: string, envVar: string): string {
  const template = process.env[envVar]
  if (!template) return directUrl
  return template.replace('{url}', encodeURIComponent(directUrl))
}

// Wraps a viagogo.co.uk destination URL in TheShowFinder's Partnerize
// affiliate tracking template, once VIAGOGO_AFFILIATE_TEMPLATE is set in
// Vercel. viagogo's programme is confirmed on Partnerize, not Awin (Awin's
// viagogo programme was never joined on this account). Returns the plain
// link unchanged until the env var is set.
export function getViagogoAffiliateLink(destinationUrl: string): string {
  return wrapWithEnvTemplate(destinationUrl, 'VIAGOGO_AFFILIATE_TEMPLATE')
}

// Every remaining ticket provider on the site (Eventim, StubHub, Gigsberg,
// Vivid Seats, Eventbrite, Skiddle, Seat Unique) has no confirmed affiliate
// programme yet — these buttons currently send clicks out with zero
// tracking. Wrapping them all in wrapWithEnvTemplate now means the moment
// any one of these programmes is applied for and approved, turning on
// tracking is a single Vercel env var — no further code changes, no more
// buttons quietly leaking untracked clicks.
export function getEventimAffiliateLink(destinationUrl: string): string {
  return wrapWithEnvTemplate(destinationUrl, 'EVENTIM_AFFILIATE_TEMPLATE')
}
export function getStubHubAffiliateLink(destinationUrl: string): string {
  return wrapWithEnvTemplate(destinationUrl, 'STUBHUB_AFFILIATE_TEMPLATE')
}
export function getGigsbergAffiliateLink(destinationUrl: string): string {
  return wrapWithEnvTemplate(destinationUrl, 'GIGSBERG_AFFILIATE_TEMPLATE')
}
export function getVividSeatsAffiliateLink(destinationUrl: string): string {
  return wrapWithEnvTemplate(destinationUrl, 'VIVIDSEATS_AFFILIATE_TEMPLATE')
}
export function getEventbriteAffiliateLink(destinationUrl: string): string {
  return wrapWithEnvTemplate(destinationUrl, 'EVENTBRITE_AFFILIATE_TEMPLATE')
}
export function getSkiddleAffiliateLink(destinationUrl: string): string {
  return wrapWithEnvTemplate(destinationUrl, 'SKIDDLE_AFFILIATE_TEMPLATE')
}
export function getSeatUniqueAffiliateLink(destinationUrl: string): string {
  return wrapWithEnvTemplate(destinationUrl, 'SEATUNIQUE_AFFILIATE_TEMPLATE')
}
