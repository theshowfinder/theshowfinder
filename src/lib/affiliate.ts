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
