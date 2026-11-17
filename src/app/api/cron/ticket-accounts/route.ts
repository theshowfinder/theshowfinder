import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { withJobRun } from '@/lib/jobRuns'
import { refreshStripeAccount, ticketsStripeReady } from '@/lib/ticketPayments'

export const maxDuration = 120
export const dynamic = 'force-dynamic'

type Loose = any // eslint-disable-line @typescript-eslint/no-explicit-any

// Every few hours: organisers who started setting up payouts but whose Stripe account can't take payments yet are
// checked again, so their paid tickets go on sale as soon as Stripe approves them (a backstop for the return page
// and the account.updated webhook). Stripe pays organisers itself; we never hold or pay out their money.
async function handleGet(request: Request) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || request.headers.get('authorization') !== `Bearer ${cronSecret}`) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!ticketsStripeReady()) return NextResponse.json({ success: true, note: 'ticket payments not set up' })
  const db = createAdminClient() as Loose
  const { data: orgs } = await db.from('organisers').select('stripe_account_id').not('stripe_account_id', 'is', null).eq('stripe_charges_enabled', false).limit(200)
  let enabled = 0, failed = 0
  for (const o of (orgs ?? []) as Array<{ stripe_account_id: string }>) {
    try { if ((await refreshStripeAccount(db, o.stripe_account_id)).chargesEnabled) enabled++ } catch { failed++ }
  }
  return NextResponse.json({ success: failed === 0, checked: (orgs ?? []).length, enabled, failed }, { status: failed ? 500 : 200 })
}

export const GET = withJobRun('ticket-accounts', handleGet)
