import { decideOutbound } from '@/lib/outboundGuard'

// Our own hop in front of the Ticketmaster (Impact) affiliate link.
//
// Public pages link here (/out/tm?u=<ticketmaster url>&s=<tag>) instead of carrying
// the Impact tracking link in their HTML. Rule: nobody is ever stopped from reaching
// Ticketmaster. A request that looks like a person in a browser is sent through our
// Impact tracking link; a crawler, scraper, link checker, prefetch or anything we are
// unsure about is sent to the plain Ticketmaster page, which cannot register an Impact
// click. robots.txt also disallows /out/, so well-behaved crawlers do not even ask.
export const dynamic = 'force-dynamic'

const HEADERS = { 'Cache-Control': 'private, no-store, max-age=0', 'X-Robots-Tag': 'noindex, nofollow, noarchive' }

function handle(request: Request) {
  const url = new URL(request.url)
  const tag = url.searchParams.get('s') ?? undefined
  const human = url.searchParams.get('h') === '1'
  const decision = decideOutbound(request, url.searchParams.get('u'), tag, human)

  // One structured line per request in the Vercel runtime logs, so any future
  // question about this traffic can be answered from real data.
  console.log(JSON.stringify({
    evt: 'out_tm',
    outcome: decision.kind === 'invalid' ? 'invalid' : decision.tracked ? 'tracked' : 'plain',
    reason: decision.kind === 'redirect' ? decision.reason : 'bad-destination',
    method: request.method,
    ua: (request.headers.get('user-agent') ?? '').slice(0, 160),
    ref: (request.headers.get('referer') ?? '').slice(0, 120),
    country: request.headers.get('x-vercel-ip-country') ?? undefined,
    human,
    tag,
  }))

  if (decision.kind === 'invalid') return new Response(null, { status: 400, headers: HEADERS })
  return new Response(null, { status: 302, headers: { ...HEADERS, Location: decision.location } })
}

export const GET = handle
export const HEAD = handle
