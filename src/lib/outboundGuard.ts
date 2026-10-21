// Guards for our own outbound ticket redirect (/out/tm).
//
// Why this exists: Ticketmaster's affiliate team (Impact) warned us that the
// account was generating a lot of clicks with no sales, which is what automated
// traffic looks like. Every public page used to contain the raw Impact tracking
// link (ticketmaster.evyy.net/...) in its HTML, and any crawler, link-checker or
// scraper that follows links "clicked" it. Public pages now link to
// /out/tm?u=...; that route (disallowed in robots.txt) only forwards a request that
// looks like a person clicking a link in a browser.

// Words that appear in the user-agent of crawlers, scrapers, HTTP libraries,
// link-preview fetchers, uptime monitors and headless browsers.
const AUTOMATED_UA = /bot|crawl|spider|slurp|scrape|fetch|monitor|check|probe|scan|preview|archiver|validator|analy[sz]|lighthouse|pagespeed|headless|phantom|puppeteer|playwright|selenium|curl|wget|httpie|python|requests|aiohttp|httpx|urllib|libwww|java\/|apache-http|okhttp|go-http|node-fetch|axios|undici|got\(|postman|insomnia|facebookexternalhit|whatsapp|telegram|discord|slack|twitter|linkedin|skype|bingpreview|google-read-aloud|petalsearch|yandex|baidu|duckduck|semrush|ahrefs|mj12|dotbot|bytespider|gptbot|claude|anthropic|perplexity|ccbot|amazon/i

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
