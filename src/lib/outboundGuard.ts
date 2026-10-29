// Our own outbound ticket redirect (/out/tm): decides where a click on a Ticketmaster
// button goes.
//
// Why this exists: Ticketmaster's affiliate team (Impact) warned us that the
// account was generating a lot of clicks with no sales, which is what automated
// traffic looks like. Every public page used to contain the raw Impact tracking
// link (ticketmaster.evyy.net/...) in its HTML, and any crawler, link-checker or
// scraper that follows links "clicked" it. Public pages now link to /out/tm.
//
// Design rule: NEVER stop anybody reaching Ticketmaster. Every valid request is
// redirected to Ticketmaster. A request that looks like a person in a browser goes
// via our Impact tracking link (so we are credited); anything else, or anything we
// are unsure about, goes to the plain Ticketmaster page, which cannot register an
// Impact click. So a wrongly-judged person still lands on the right Ticketmaster
// page and only loses the commission on that one click.

import {
  getTicketmasterAffiliateLink, getSeeTicketsAffiliateLink, getGigsbergAffiliateLink, getViagogoAffiliateLink,
  getStubHubAffiliateLink, getVividSeatsAffiliateLink, getEventimAffiliateLink, getTheatreTicketsDirectAffiliateLink,
} from './affiliate.ts'

// Words that appear in the user-agent of crawlers, scrapers, HTTP libraries,
// link-preview fetchers, uptime monitors and headless browsers. Deliberately does
// NOT list app names (Instagram, Facebook, Twitter/X, LinkedIn, TikTok, Telegram,
// Slack, Discord, WhatsApp): their in-app browsers carry those names, and real people reach
// us from social posts that way. Their preview fetchers (Twitterbot, Slackbot...)
// are caught by 'bot'. WhatsApp's link-preview fetcher has a user-agent that STARTS
// with 'WhatsApp/'; its in-app browser starts with 'Mozilla/5.0', so only the former
// is matched.
const AUTOMATED_UA = /^whatsapp\/|bot|crawl|spider|slurp|scrape|bingpreview|skypeuripreview|archiver|lighthouse|pagespeed|headless|phantom|puppeteer|playwright|selenium|curl|wget|httpie|python|aiohttp|httpx|urllib|libwww|java\/|apache-http|okhttp|go-http|node-fetch|axios|undici|postman|insomnia|facebookexternalhit|google-read-aloud|petalsearch|yandex|baidu|duckduck|semrush|ahrefs|mj12|dotbot|bytespider|ccbot|perplexity|claude|anthropic/i

export interface OutboundRequestLike {
  method: string
  headers: { get(name: string): string | null }
}

// Returns a short reason when the request does not look like a person clicking a
// link in a browser, or null when it does. Deliberately conservative: a real
// browser always sends a user-agent, an Accept-Language and (modern browsers)
// Sec-Fetch-* headers, and never HEADs a link or prefetches it into the redirect.
export function automatedRequestReason(req: OutboundRequestLike): string | null {
  if (req.method !== 'GET') return 'method'
  const ua = (req.headers.get('user-agent') ?? '').trim()
  if (ua.length < 12) return 'no-user-agent'
  if (AUTOMATED_UA.test(ua)) return 'automated-user-agent'
  const mode = req.headers.get('sec-fetch-mode')
  if (mode && mode.toLowerCase() !== 'navigate') return 'not-a-navigation'
  const dest = req.headers.get('sec-fetch-dest')
  if (dest && !['document', 'iframe', 'frame'].includes(dest.toLowerCase())) return 'not-a-document'
  const purpose = `${req.headers.get('sec-purpose') ?? ''} ${req.headers.get('purpose') ?? ''} ${req.headers.get('x-purpose') ?? ''}`.toLowerCase()
  if (/prefetch|prerender|preview/.test(purpose)) return 'prefetch'
  if (req.headers.get('x-middleware-prefetch') || req.headers.get('next-router-prefetch')) return 'prefetch'
  if (!(req.headers.get('accept-language') ?? '').trim()) return 'no-accept-language'
  return null
}

// ── Providers ───────────────────────────────────────────────────────────────
// Every affiliate ticket button on public pages goes through our own /out/<provider>
// hop (tm Ticketmaster/Impact, st See Tickets/Awin, gb Gigsberg, vg Viagogo,
// sh StubHub, vs Vivid Seats, ev Eventim). A person in a browser is sent through
// the affiliate link; anything else goes to the plain page, which cannot register an
// affiliate click. Each provider only accepts its own hosts, so the hop can never be
// used as an open redirect. The host lists were built from every link in the live
// data (checked 21 Oct 2026); a host missing here gives a 400 (a dead button) and
// shows as outcome 'invalid' in the out_<provider> logs.

export type OutProvider = 'tm' | 'st' | 'gb' | 'vg' | 'sh' | 'vs' | 'ev' | 'td'
export const OUT_PROVIDERS: readonly OutProvider[] = ['tm', 'st', 'gb', 'vg', 'sh', 'vs', 'ev', 'td']
export function isOutProvider(value: string): value is OutProvider {
  return (OUT_PROVIDERS as readonly string[]).includes(value)
}

const TICKETMASTER_HOSTS = [
  'ticketmaster.co.uk', 'ticketmaster.ie', 'ticketmaster.com', 'ticketmaster.de', 'ticketmaster.es', 'ticketmaster.fr',
  'ticketmastergiftcard.com', 'tmtickets.co.uk',
  'universe.com',
  'ticketweb.uk', 'ticketweb.co.uk', 'ticketweb.com',
  'livenation.co.uk', 'livenation.com',
  'eticketing.co.uk', 'bundl.travel', 'eventtravel.com',
]
const HOSTS: Record<Exclude<OutProvider, 'tm' | 'st'>, string[]> = {
  gb: ['gigsberg.com'],
  vg: ['viagogo.co.uk', 'viagogo.com'],
  sh: ['stubhub.co.uk', 'stubhub.com'],
  vs: ['vividseats.com'],
  ev: ['eventim.co.uk', 'eventim.com'],
  td: ['theatreticketsdirect.co.uk'],   // Theatre Tickets Direct (Awin 1936): plain show pages, wrapped at the hop
}
const AWIN_PUBLISHER_ID = '2896631'
const SEE_TICKETS_MERCHANT_ID = '7816'

function parseWebUrl(value: string | null | undefined): URL | null {
  if (!value) return null
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
    if (url.username || url.password) return null
    return url
  } catch {
    return null
  }
}
function hostIn(url: URL, hosts: string[]): boolean {
  const host = url.hostname.toLowerCase()
  return hosts.some(h => host === h || host.endsWith(`.${h}`))
}
// One of OUR Awin links for See Tickets: a feed product link (pclick.php) or a deep
// link (cread.php) carrying our publisher id and the See Tickets merchant id.
function isOurSeeTicketsAwinLink(url: URL): boolean {
  if (!hostIn(url, ['awin1.com'])) return false
  const q = url.searchParams
  const path = url.pathname.toLowerCase()
  if (path === '/pclick.php') return q.get('a') === AWIN_PUBLISHER_ID && q.get('m') === SEE_TICKETS_MERCHANT_ID
  if (path === '/cread.php') return q.get('awinaffid') === AWIN_PUBLISHER_ID && q.get('awinmid') === SEE_TICKETS_MERCHANT_ID
  return false
}

export function isAllowedDestination(provider: OutProvider, value: string | null | undefined): boolean {
  const url = parseWebUrl(value)
  if (!url) return false
  if (provider === 'tm') return hostIn(url, TICKETMASTER_HOSTS)
  if (provider === 'st') return hostIn(url, ['seetickets.com']) || isOurSeeTicketsAwinLink(url)
  return hostIn(url, HOSTS[provider])
}

export function isTicketmasterDestination(value: string | null | undefined): boolean {
  return isAllowedDestination('tm', value)
}

function withoutParam(value: string, name: string): string {
  const url = new URL(value)
  url.searchParams.delete(name)
  return url.toString()
}

// The affiliate (tracked) link for a person.
function trackedLink(provider: OutProvider, dest: string, tag?: string): string {
  switch (provider) {
    case 'tm': return getTicketmasterAffiliateLink(dest, tag)
    case 'st': return getSeeTicketsAffiliateLink(dest, tag)
    case 'gb': return getGigsbergAffiliateLink(dest)
    case 'vg': return getViagogoAffiliateLink(dest)
    case 'sh': return getStubHubAffiliateLink(dest)
    case 'vs': return getVividSeatsAffiliateLink(dest)
    case 'ev': return getEventimAffiliateLink(dest)
    case 'td': return getTheatreTicketsDirectAffiliateLink(dest, tag)
  }
}

// The plain page for anything that is not clearly a person, so no affiliate click is
// registered. null = a See Tickets feed link (pclick) whose plain See Tickets page has
// to be looked up in the catalogue (done by the route).
function plainLink(provider: OutProvider, dest: string): string | null {
  if (provider === 'gb') return withoutParam(dest, 'aff')
  if (provider === 'st') {
    const url = new URL(dest)
    if (hostIn(url, ['seetickets.com'])) return withoutParam(dest, 'aff')
    if (url.pathname.toLowerCase() === '/cread.php') {
      const ued = url.searchParams.get('ued')
      return ued && parseWebUrl(ued) && hostIn(new URL(ued), ['seetickets.com']) ? withoutParam(ued, 'aff') : SEE_TICKETS_HOME
    }
    return null
  }
  return dest
}
export const SEE_TICKETS_HOME = 'https://www.seetickets.com/'

export type OutboundDecision =
  | { kind: 'invalid' }
  | { kind: 'redirect'; location: string; tracked: boolean; reason: string | null }
  | { kind: 'lookup-plain'; destination: string; reason: string }

// Reasons that are weak signals: real browsers can occasionally trip them (a privacy
// tool stripping headers, an unusual webview). A click that the page's own script
// marked as made by a person (see OutboundLinkMarker) overrides these, so nobody
// who really clicked loses the commission. The other reasons (a declared bot, no
// user-agent, a non-GET request, a prefetch) are never overridden.
const SOFT_REASONS = new Set(['not-a-navigation', 'not-a-document', 'no-accept-language'])

// Where should this request go? Only a destination that is not this provider's own
// site is refused; everything else is sent on. `humanSignal` is true when the link
// carries the marker our page script adds on a real pointer, touch or keyboard
// interaction (crawlers never run it, and it is not in the HTML).
// 22 Oct 2026: bots on residential proxies (Brazil, India, Saudi Arabia, Russia… desktop Chrome with full browser
// headers) passed every header check and were sent through the affiliate links (Impact: 3,635 clicks on 21 Oct, all
// desktop). They never run the page script, so the click marker is now REQUIRED: only a click a person made on
// our page (h=1), or a link we handed to a person to share (share buttons, emails: v=s) that also looks like a
// browser, goes through the affiliate link. Everything else reaches the same page without the affiliate link.
export function decideProviderOutbound(provider: OutProvider, req: OutboundRequestLike, destination: string | null, tag?: string, humanSignal = false, sharedLink = false): OutboundDecision {
  if (!isAllowedDestination(provider, destination)) return { kind: 'invalid' }
  const dest = destination!
  const headerReason = automatedRequestReason(req)
  const reason = headerReason ?? (humanSignal || sharedLink ? null : 'no-click-marker')
  if (reason && !(humanSignal && SOFT_REASONS.has(reason))) {
    const plain = plainLink(provider, dest)
    return plain === null
      ? { kind: 'lookup-plain', destination: dest, reason }
      : { kind: 'redirect', location: plain, tracked: false, reason }
  }
  return { kind: 'redirect', location: trackedLink(provider, dest, tag), tracked: true, reason: reason ? `${reason}-overridden-by-click` : null }
}

// Ticketmaster shorthand (kept for existing callers and tests).
export function decideOutbound(req: OutboundRequestLike, destination: string | null, tag?: string, humanSignal = false, sharedLink = false): OutboundDecision {
  return decideProviderOutbound('tm', req, destination, tag, humanSignal, sharedLink)
}
