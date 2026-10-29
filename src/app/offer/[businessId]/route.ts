import { NextResponse } from 'next/server'
import { claimVoucher, clientKey } from '@/lib/businessVouchers'

// "Get my voucher" on an ad posts here (a form, so link prefetchers and crawlers never create vouchers).
// ?e=<event id> when it came from a show page: the voucher is then for that show's day.
export const dynamic = 'force-dynamic'
const UUID = /^[0-9a-f-]{36}$/i

export async function POST(request: Request, { params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params
  const url = new URL(request.url)
  const e = url.searchParams.get('e')
  if (!UUID.test(businessId)) return new Response(null, { status: 404 })
  const result = await claimVoucher(businessId, e && UUID.test(e) ? e : null, clientKey(request.headers, businessId))
  if ('error' in result) return NextResponse.redirect(new URL(`/voucher/unavailable`, url.origin), 303)
  return NextResponse.redirect(new URL(`/voucher/${result.code}`, url.origin), 303)
}
