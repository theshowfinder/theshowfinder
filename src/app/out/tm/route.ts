import { handleOutbound } from '@/lib/outboundHandler'

// Ticketmaster (Impact) hop. Same rules as every /out/<provider> route: see
// src/lib/outboundGuard.ts. Kept as its own file so existing /out/tm links and the
// out_tm log name stay exactly as they are.
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  return handleOutbound(request, 'tm')
}
export const HEAD = GET
