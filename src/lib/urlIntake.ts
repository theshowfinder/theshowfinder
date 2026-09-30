// Phase 3 of the News Intelligence Inbox: safe server-side fetching and
// best-effort metadata extraction for an admin-pasted article URL. Kept
// dependency-free (no cheerio/jsdom/Readability) and regex/string-based,
// matching the pattern already established by src/lib/councilEvents.ts for
// this codebase's other HTML-scraping code.
//
// This module is split deliberately into pure, easily-unit-tested pieces
// (isPrivateOrReservedIp, extractArticleMetadata) and thin I/O wrappers
// (assertSafeFetchUrl, fetchArticleHtml) that talk to the network/DNS and
// are exercised indirectly rather than mocked in tests — same
// pure-logic/I/O split as src/lib/newsPublishing.ts.

import { lookup as dnsLookup } from 'dns/promises'

export const FETCH_TIMEOUT_MS = 10_000
export const MAX_RESPONSE_BYTES = 2_000_000 // 2MB — generous for article HTML, bounded for cost/memory
const USER_AGENT = 'Mozilla/5.0 (compatible; TheShowFinderBot/1.0; +https://theshowfinder.com)'

// ── SSRF protection ─────────────────────────────────────────────────────────
//
// Two layers: a cheap hostname-string check (catches the obvious cases —
// "localhost", a bare IP literal that's already private/loopback) plus a
// real DNS-resolution check (catches a public-looking hostname that
// actually resolves to a private/internal address — the case a string
// check alone can't see). Both must pass.

// Pure — fully unit-testable without any network/DNS access. Covers IPv4
// loopback/private/link-local/reserved ranges and their common IPv6
// equivalents (including IPv4-mapped IPv6). This is deliberately a
// blocklist of "known safe to reject" ranges, not an allowlist — an IP
// this doesn't recognize as unsafe is treated as fetchable.
export function isPrivateOrReservedIp(ip: string): boolean {
  const v4 = ip.startsWith('::ffff:') ? ip.slice(7) : ip

  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(v4)) {
    const parts = v4.split('.').map(Number)
    if (parts.some(p => Number.isNaN(p) || p < 0 || p > 255)) return true // malformed — treat as unsafe
    const [a, b] = parts
    if (a === 127) return true                              // loopback
    if (a === 10) return true                                // private
    if (a === 172 && b >= 16 && b <= 31) return true          // private
    if (a === 192 && b === 168) return true                   // private
    if (a === 169 && b === 254) return true                    // link-local (incl. cloud metadata, 169.254.169.254)
    if (a === 0) return true                                    // "this network"
    if (a === 100 && b >= 64 && b <= 127) return true            // carrier-grade NAT
    if (a === 198 && (b === 18 || b === 19)) return true          // benchmarking
    if (a >= 224) return true                                       // multicast/reserved (224-255)
    return false
  }

  const lower = ip.toLowerCase()
  if (lower === '::1') return true                    // loopback
  if (lower === '::') return true                      // unspecified
  if (/^fe80:/i.test(lower)) return true                 // link-local
  if (/^f[cd][0-9a-f]{2}:/i.test(lower)) return true       // unique local (fc00::/7)
  if (/^ff[0-9a-f]{2}:/i.test(lower)) return true            // multicast

  return false
}

function isObviouslyLocalHostname(hostname: string): boolean {
  const h = hostname.toLowerCase()
  return h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h === '0.0.0.0'
}

export class UnsafeUrlError extends Error {}

// Validates protocol, hostname pattern, and (via a real DNS lookup) the
// resolved IP, before any fetch is attempted. Throws UnsafeUrlError with a
// message safe to show the admin (never leaks the resolved IP) on any
// rejection.
export async function assertSafeFetchUrl(rawUrl: string): Promise<URL> {
  let parsed: URL
  try {
    parsed = new URL(rawUrl)
  } catch {
    throw new UnsafeUrlError('That is not a valid URL.')
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new UnsafeUrlError('Only http:// and https:// URLs are allowed.')
  }

  if (isObviouslyLocalHostname(parsed.hostname)) {
    throw new UnsafeUrlError('Local/private addresses are not allowed.')
  }

  if (isPrivateOrReservedIp(parsed.hostname)) {
    throw new UnsafeUrlError('Local/private addresses are not allowed.')
  }

  let addresses: { address: string }[]
  try {
    const result = await dnsLookup(parsed.hostname, { all: true })
    addresses = Array.isArray(result) ? result : [result]
  } catch {
    throw new UnsafeUrlError('Could not resolve that URL’s address.')
  }

  if (addresses.length === 0 || addresses.some(a => isPrivateOrReservedIp(a.address))) {
    throw new UnsafeUrlError('That address resolves to a private/internal network and cannot be fetched.')
  }

  return parsed
}

export class FetchArticleError extends Error {}

export interface FetchedArticle {
  html: string
  finalUrl: string // post-redirect URL, as reported by fetch()
}

const MAX_REDIRECTS = 5

// Fetches the page after the safety check above, with a timeout and a hard
// response-size cap (checked incrementally as bytes arrive, not just via
// Content-Length — a server can omit or lie about that header).
//
// Redirects are followed manually (redirect: 'manual'), one hop at a time,
// re-running the exact same assertSafeFetchUrl SSRF check against every
// redirect destination before following it. This matters because the
// initial URL passing the check only proves the URL the admin pasted is
// safe — a malicious or compromised page can still respond with a 3xx
// pointing at 127.0.0.1, a private range, or the 169.254.169.254 cloud
// metadata address, and letting fetch() follow that automatically
// (redirect: 'follow') would bypass the check entirely for that hop.
export async function fetchArticleHtml(rawUrl: string): Promise<FetchedArticle> {
  let currentUrl = await assertSafeFetchUrl(rawUrl)

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

  try {
    let res: Response | null = null

    for (let hop = 0; ; hop++) {
      try {
        res = await fetch(currentUrl.toString(), {
          headers: { 'User-Agent': USER_AGENT, Accept: 'text/html' },
          signal: controller.signal,
          redirect: 'manual',
        })
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          throw new FetchArticleError('Timed out fetching that page.')
        }
        throw new FetchArticleError('Could not fetch that page.')
      }

      const isRedirect = res.status >= 300 && res.status < 400
      if (!isRedirect) break

      if (hop >= MAX_REDIRECTS) {
        throw new FetchArticleError('That page redirected too many times.')
      }

      const location = res.headers.get('location')
      if (!location) {
        throw new FetchArticleError('That page redirected without a destination.')
      }

      let nextUrl: URL
      try {
        nextUrl = new URL(location, currentUrl)
      } catch {
        throw new FetchArticleError('That page redirected to an invalid address.')
      }

      // Re-validate the redirect destination with the same SSRF checks as
      // the original URL (protocol, hostname pattern, and a real DNS
      // lookup against the private/reserved IP blocklist) before following
      // it. Throws UnsafeUrlError, same as a directly-pasted unsafe URL.
      currentUrl = await assertSafeFetchUrl(nextUrl.toString())
    }

    if (!res.ok) {
      throw new FetchArticleError(`That page returned an error (HTTP ${res.status}).`)
    }

    const contentType = res.headers.get('content-type') ?? ''
    if (contentType && !contentType.includes('text/html') && !contentType.includes('application/xhtml')) {
      throw new FetchArticleError('That URL did not return an HTML page.')
    }

    const contentLength = res.headers.get('content-length')
    if (contentLength && Number(contentLength) > MAX_RESPONSE_BYTES) {
      throw new FetchArticleError('That page is too large to fetch.')
    }

    if (!res.body) {
      throw new FetchArticleError('That page returned no content.')
    }

    const reader = res.body.getReader()
    const chunks: Uint8Array[] = []
    let total = 0
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      if (value) {
        total += value.byteLength
        if (total > MAX_RESPONSE_BYTES) {
          await reader.cancel()
          throw new FetchArticleError('That page is too large to fetch.')
        }
        chunks.push(value)
      }
    }

    const html = Buffer.concat(chunks.map(c => Buffer.from(c))).toString('utf-8')
    return { html, finalUrl: res.url || currentUrl.toString() }
  } finally {
    clearTimeout(timeout)
  }
}

// ── Article metadata extraction (pure — html string in, structured data out) ─

export interface ExtractedArticle {
  title: string | null
  description: string | null
  headline: string | null
  sourceDomain: string
  publishedAt: string | null // ISO string, or null if absent/unparseable
  articleText: string | null // best-effort main text, capped
  originalUrl: string
}

const MAX_ARTICLE_TEXT_CHARS = 8000

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, '’')
    .replace(/&nbsp;/g, ' ')
    .trim()
}

function matchMetaContent(html: string, patterns: RegExp[]): string | null {
  for (const re of patterns) {
    const m = html.match(re)
    if (m && m[1]) return decodeEntities(m[1])
  }
  return null
}

function extractJsonLdArticle(html: string): Record<string, unknown> | null {
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html))) {
    let parsed: unknown
    try {
      parsed = JSON.parse(m[1])
    } catch {
      continue
    }
    const candidates = Array.isArray(parsed) ? parsed : [parsed]
    for (const c of candidates) {
      if (!c || typeof c !== 'object') continue
      const type = (c as { '@type'?: string | string[] })['@type']
      const types = Array.isArray(type) ? type : [type]
      if (types.some(t => t === 'NewsArticle' || t === 'Article' || t === 'BlogPosting')) {
        return c as Record<string, unknown>
      }
    }
  }
  return null
}

function stripTags(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<nav[\s\S]*?<\/nav>/gi, ' ')
    .replace(/<header[\s\S]*?<\/header>/gi, ' ')
    .replace(/<footer[\s\S]*?<\/footer>/gi, ' ')
    .replace(/<aside[\s\S]*?<\/aside>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
}

function extractArticleText(html: string): string | null {
  // Best-effort: prefer text inside <article>...</article> if present
  // (most news CMSes wrap the story body in one); otherwise fall back to
  // every <p> tag on the page. Neither is a real readability algorithm —
  // this is a bounded, dependency-free approximation good enough for an
  // admin to sanity-check against the AI suggestion, not a publishing
  // pipeline in its own right.
  const articleMatch = html.match(/<article[^>]*>([\s\S]*?)<\/article>/i)
  const source = articleMatch ? articleMatch[1] : html

  let text: string
  if (articleMatch) {
    text = decodeEntities(stripTags(source)).replace(/\s+/g, ' ').trim()
  } else {
    const paragraphs: string[] = []
    const re = /<p[^>]*>([\s\S]*?)<\/p>/gi
    let m: RegExpExecArray | null
    while ((m = re.exec(html))) {
      const t = decodeEntities(stripTags(m[1])).replace(/\s+/g, ' ').trim()
      if (t.length > 40) paragraphs.push(t) // skip short/boilerplate fragments
    }
    text = paragraphs.join('\n\n')
  }

  if (!text) return null
  return text.length > MAX_ARTICLE_TEXT_CHARS ? text.slice(0, MAX_ARTICLE_TEXT_CHARS) + '…' : text
}

function parseDate(value: unknown): string | null {
  if (typeof value !== 'string' || !value) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

export function extractArticleMetadata(html: string, finalUrl: string): ExtractedArticle {
  let sourceDomain = finalUrl
  try {
    sourceDomain = new URL(finalUrl).hostname.replace(/^www\./, '')
  } catch {
    // finalUrl should always be a real URL by the time this is called —
    // fall back to the raw string rather than throwing on malformed input.
  }

  const jsonLd = extractJsonLdArticle(html)

  const title = matchMetaContent(html, [
    /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']*)["']/i,
    /<meta[^>]+content=["']([^"']*)["'][^>]+property=["']og:title["']/i,
    /<title[^>]*>([^<]*)<\/title>/i,
  ])

  const description = matchMetaContent(html, [
    /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']*)["']/i,
    /<meta[^>]+content=["']([^"']*)["'][^>]+property=["']og:description["']/i,
    /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i,
    /<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["']/i,
  ])

  const jsonLdHeadline = jsonLd && typeof jsonLd.headline === 'string' ? decodeEntities(jsonLd.headline) : null
  const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)
  const h1 = h1Match ? decodeEntities(stripTags(h1Match[1])).trim() : null
  const headline = jsonLdHeadline || h1 || title

  const publishedAt =
    parseDate(jsonLd?.datePublished) ??
    parseDate(
      matchMetaContent(html, [
        /<meta[^>]+property=["']article:published_time["'][^>]+content=["']([^"']*)["']/i,
        /<meta[^>]+content=["']([^"']*)["'][^>]+property=["']article:published_time["']/i,
      ])
    )

  return {
    title,
    description,
    headline,
    sourceDomain,
    publishedAt,
    articleText: extractArticleText(html),
    originalUrl: finalUrl,
  }
}
