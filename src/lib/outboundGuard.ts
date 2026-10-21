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

import { getTicketmasterAffiliateLink } from './affiliate.ts'

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

// The redirect may only ever lead to a Ticketmaster page, so it can never be used
// as an open redirect to some other site.
export function isTicketmasterDestination(value: string | null | undefined): boolean {
  if (!value) return false
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return false
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return false
  if (url.username || url.password) return false
  const host = url.hostname.toLowerCase()
  return host === 'ticketmaster.co.uk' || host.endsWith('.ticketmaster.co.uk')
    || host === 'ticketmaster.com' || host.endsWith('.ticketmaster.com')
    || host === 'ticketmaster.ie' || host.endsWith('.ticketmaster.ie')
}

export type OutboundDecision =
  | { kind: 'invalid' }
  | { kind: 'redirect'; location: string; tracked: boolean; reason: string | null }

// Reasons that are weak signals: real browsers can occasionally trip them (a privacy
// tool stripping headers, an unusual webview). A click that the page's own script
// marked as made by a person (see OutboundLinkMarker) overrides these, so nobody
// who really clicked loses the commission. The other reasons (a declared bot, no
// user-agent, a non-GET request, a prefetch) are never overridden.
const SOFT_REASONS = new Set(['not-a-navigation', 'not-a-document', 'no-accept-language'])

// Where should this request go? Invalid destinations (not a Ticketmaster page) are
// the only thing refused; everything else is sent to Ticketmaster. `humanSignal` is
// true when the link carries the marker our page script adds on a real pointer,
// touch or keyboard interaction (crawlers never run it, and it is not in the HTML).
export function decideOutbound(req: OutboundRequestLike, destination: string | null, tag?: string, humanSignal = false): OutboundDecision {
  if (!isTicketmasterDestination(destination)) return { kind: 'invalid' }
  const reason = automatedRequestReason(req)
  if (reason && !(humanSignal && SOFT_REASONS.has(reason))) return { kind: 'redirect', location: destination!, tracked: false, reason }
  return { kind: 'redirect', location: getTicketmasterAffiliateLink(destination!, tag), tracked: true, reason: reason ? `${reason}-overridden-by-click` : null }
}
