import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

// The buyer left Stripe's payment page: give the held tickets back and return them to the event.
export async function GET(request: Request) {
  const u = new URL(request.url)
  const o = u.searchParams.get('o') ?? '', t = u.searchParams.get('t') ?? '', e = u.searchParams.get('e') ?? ''
  if (/^[0-9a-f-]{36}$/i.test(o) && /^[0-9a-f]{32}$/i.test(t)) {
    const db = createAdminClient() as any // eslint-disable-line @typescript-eslint/no-explicit-any
    const { data } = await db.from('ticket_orders').select('id').eq('id', o).eq('access_token', t).eq('status', 'pending').maybeSingle()
    if (data) await db.rpc('release_ticket_order', { p_order: o })
  }
  const slug = /^[a-z0-9-]{1,200}$/.test(e) ? e : ''
  return NextResponse.redirect(new URL(slug ? `/events/${slug}#tickets` : '/', u.origin), 303)
}
