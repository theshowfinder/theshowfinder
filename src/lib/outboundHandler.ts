import { createAdminClient } from '@/lib/supabase/admin'
import { decideProviderOutbound, isAllowedDestination, SEE_TICKETS_HOME, type OutProvider } from '@/lib/outboundGuard'

// Shared handler for /out/<provider> (see outboundGuard.ts for the rules).
// Nobody is ever refused except for a link that is not this provider's own site.

const HEADERS = { 'Cache-Control': 'private, no-store, max-age=0', 'X-Robots-Tag': 'noindex, nofollow, noarchive' }

// See Tickets feed links (awin1.com/pclick.php) have no plain See Tickets address in
// them; the catalogue row with that link holds it (raw.merchant_deep_link).
async function seeTicketsPlainPage(feedLink: string): Promise<string> {
  try {
    const { data } = await createAdminClient()
      .from('see_tickets_catalogue_events')
      .select('merchant_deep_link:raw->>merchant_deep_link')
      .eq('url', feedLink)
      .limit(1)
      .maybeSingle() as unknown as { data: { merchant_deep_link: string | null } | null }
    const plain = data?.merchant_deep_link ?? null
    if (plain && isAllowedDestination('st', plain) && /(^|\.)seetickets\.com$/i.test(new URL(plain).hostname)) {
      const url = new URL(plain)
      url.searchParams.delete('aff')
      return url.toString()
    }
  } catch {
    // fall through to the See Tickets home page
  }
  return SEE_TICKETS_HOME
}

export async function handleOutbound(request: Request, provider: OutProvider): Promise<Response> {
  const url = new URL(request.url)
  const tag = url.searchParams.get('s') ?? undefined
  const human = url.searchParams.get('h') === '1'
  const shared = url.searchParams.get('v') === 's'
  const decision = decideProviderOutbound(provider, request, url.searchParams.get('u'), tag, human, shared)

  let location: string | null = null
  let outcome: 'invalid' | 'tracked' | 'plain' = 'invalid'
  let reason: string | null = 'bad-destination'
  if (decision.kind === 'redirect') {
    location = decision.location
    outcome = decision.tracked ? 'tracked' : 'plain'
    reason = decision.reason
  } else if (decision.kind === 'lookup-plain') {
    location = await seeTicketsPlainPage(decision.destination)
    outcome = 'plain'
    reason = decision.reason
  }

  // One structured line per request in the Vercel runtime logs (evt out_tm, out_st,
  // out_gb ...), so any question about this traffic can be answered from real data.
  console.log(JSON.stringify({
    evt: `out_${provider}`,
    outcome,
    reason,
    method: request.method,
    ua: (request.headers.get('user-agent') ?? '').slice(0, 160),
    ref: (request.headers.get('referer') ?? '').slice(0, 120),
    country: request.headers.get('x-vercel-ip-country') ?? undefined,
    human,
    shared,
    tag,
    ...(outcome === 'invalid' ? { dest: (url.searchParams.get('u') ?? '').slice(0, 200) } : {}),
  }))

  if (!location) return new Response(null, { status: 400, headers: HEADERS })
  return new Response(null, { status: 302, headers: { ...HEADERS, Location: location } })
}
