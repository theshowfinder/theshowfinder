import { getTicketmasterAffiliateLink } from '@/lib/affiliate'
import { automatedRequestReason, isTicketmasterDestination } from '@/lib/outboundGuard'

// Our own hop in front of the Ticketmaster (Impact) affiliate link.
//
// Public pages link here (/out/tm?u=<ticketmaster url>&s=<tag>) instead of
// carrying the Impact tracking link in their HTML. Crawlers and scrapers that
// follow every link on a page therefore never reach Impact; only a request that
// looks like a person clicking in a browser is sent on to the tracking link.
// robots.txt disallows /out/ as well, so well-behaved crawlers do not even try.
export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'private, no-store, max-age=0', 'X-Robots-Tag': 'noindex, nofollow, noarchive' }

function log(outcome: string, request: Request, extra: Record<string, unknown> = {}) {
  // One structured line per request in the Vercel runtime logs, so any future
  // question about this traffic can be answered from real data.
  console.log(JSON.stringify({
    evt: 'out_tm', outcome,
    ua: (request.headers.get('user-agent') ?? '').slice(0, 160),
    ref: (request.headers.get('referer') ?? '').slice(0, 120),
    country: request.headers.get('x-vercel-ip-country') ?? undefined,
    ...extra,
  }))
}

function refuse(request: Request, reason: string, status = 403) {
  log('blocked', request, { reason })
  return new Response(null, { status, headers: NO_STORE })
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const destination = url.searchParams.get('u')
  const tag = url.searchParams.get('s') ?? undefined

  if (!isTicketmasterDestination(destination)) return refuse(request, 'bad-destination', 400)

  const reason = automatedRequestReason(request)
  if (reason) return refuse(request, reason)

  log('forwarded', request, { tag })
  return new Response(null, {
    status: 302,
    headers: { ...NO_STORE, Location: getTicketmasterAffiliateLink(destination!, tag) },
  })
}

// A HEAD request (link checkers) must never be forwarded to Impact.
export async function HEAD(request: Request) {
  return refuse(request, 'method', 405)
}
