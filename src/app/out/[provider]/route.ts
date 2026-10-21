import { handleOutbound } from '@/lib/outboundHandler'
import { isOutProvider } from '@/lib/outboundGuard'

// Affiliate hop for See Tickets (st), Gigsberg (gb), Viagogo (vg), StubHub (sh),
// Vivid Seats (vs) and Eventim (ev). Rules: src/lib/outboundGuard.ts.
export const dynamic = 'force-dynamic'

export async function GET(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params
  if (!isOutProvider(provider)) return new Response(null, { status: 404 })
  return handleOutbound(request, provider)
}
export const HEAD = GET
