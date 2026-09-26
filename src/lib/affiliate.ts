// Impact affiliate tracking for Ticketmaster UK links.
const IMPACT_PARTNER_ID     = '7328658'  // TheShowFinder's Impact media partner ID
const TICKETMASTER_CAMPAIGN_ID = '1965662'  // Ticketmaster UK campaign ID on Impact
const TICKETMASTER_AD_ID    = '24023'    // Ad ID for the Ticketmaster UK campaign

// Wraps a ticketmaster.co.uk destination URL in TheShowFinder's Impact
// affiliate tracking link so click-throughs are attributed correctly.
export function getTicketmasterAffiliateLink(destinationUrl: string): string {
  const encoded = encodeURIComponent(destinationUrl)
  return `https://ticketmaster.evyy.net/c/${IMPACT_PARTNER_ID}/${TICKETMASTER_CAMPAIGN_ID}/${TICKETMASTER_AD_ID}?u=${encoded}`
}

// Awin tracking for See Tickets UK links.
const AWIN_PUBLISHER_ID    = '2896631'  // TheShowFinder's Awin publisher ID
const SEE_TICKETS_MERCHANT_ID = '7816'  // See Tickets UK's advertiser ID on Awin

// Wraps a seetickets.com destination URL in TheShowFinder's Awin affiliate
// tracking link so click-throughs are attributed correctly. Confirmed
// against Awin's own Link Builder tool for the See Tickets UK programme.
export function getSeeTicketsAffiliateLink(destinationUrl: string): string {
  const encoded = encodeURIComponent(destinationUrl)
  return `https://www.awin1.com/cread.php?awinmid=${SEE_TICKETS_MERCHANT_ID}&awinaffid=${AWIN_PUBLISHER_ID}&ued=${encoded}`
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
