import { createAdminClient } from '@/lib/supabase/admin'
import { safeWebsite } from '@/lib/localPlacements'

// Advertiser ad links: /out/biz/<business id>?k=website|booking&e=<event id>. Counts the click for the advertiser's
// monthly report, then sends the visitor on. h=1 is added by OutboundLinkMarker when a person really clicks, so
// crawlers following the link are counted separately (human=false) and never inflate the report.
export const dynamic = 'force-dynamic'
const HEADERS = { 'Cache-Control': 'private, no-store, max-age=0', 'X-Robots-Tag': 'noindex, nofollow' }
const UUID = /^[0-9a-f-]{36}$/i

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const url = new URL(request.url)
  const kind = url.searchParams.get('k') === 'booking' ? 'booking' : 'website'
  const e = url.searchParams.get('e')
  if (!UUID.test(id)) return new Response(null, { status: 404, headers: HEADERS })
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  const db = createAdminClient() as any
  const { data: biz } = await db.from('local_businesses').select('website_url, booking_url, status').eq('id', id).maybeSingle()
  const target = safeWebsite(kind === 'booking' ? (biz?.booking_url ?? biz?.website_url) : biz?.website_url)
  if (!biz || !target) return Response.redirect(new URL('/', url.origin), 302)
  try {
    await Promise.race([
      db.from('business_clicks').insert({ business_id: id, kind, event_id: e && UUID.test(e) ? e : null, human: url.searchParams.get('h') === '1' }),
      new Promise(resolve => setTimeout(resolve, 400)),
    ])
  } catch { /* counting is best-effort */ }
  return new Response(null, { status: 302, headers: { ...HEADERS, Location: target } })
}
