import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { ensureStripeAccount, onboardingLink, ticketsStripeReady } from '@/lib/ticketPayments'
import { SITE } from '@/lib/organiserPublish'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// "Set up payouts": the organiser's private listing link (s + t) opens Stripe's own sign-up pages for their account.
export async function GET(request: Request) {
  const u = new URL(request.url)
  const s = u.searchParams.get('s') ?? '', t = u.searchParams.get('t') ?? ''
  const done = `${SITE}/list-your-event/done?s=${encodeURIComponent(s)}&t=${encodeURIComponent(t)}`
  if (!/^[0-9a-f-]{36}$/i.test(s) || !/^[0-9a-f]{32}$/i.test(t)) return NextResponse.redirect(done, 303)
  if (!ticketsStripeReady()) return NextResponse.redirect(`${done}&stripe=unavailable`, 303)
  const db = createAdminClient() as any // eslint-disable-line @typescript-eslint/no-explicit-any
  const { data: sub } = await db.from('event_submissions').select('id, organisers(id, email, name, website, stripe_account_id)').eq('id', s).eq('manage_token', t).maybeSingle()
  if (!sub?.organisers) return NextResponse.redirect(done, 303)
  try {
    const account = await ensureStripeAccount(db, sub.organisers)
    const url = await onboardingLink(account, `${done}&stripe=back`, `${SITE}/api/organisers/stripe-connect?s=${s}&t=${t}`)
    return NextResponse.redirect(url, 303)
  } catch (err) {
    console.error('[stripe-connect] failed', err)
    return NextResponse.redirect(`${done}&stripe=error`, 303)
  }
}
