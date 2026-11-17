import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createOrganiserCheckout } from '@/lib/organiserPublish'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Boost (or upgrade to the Promoter plan) later, from the link in the organiser's email. The private
// manage token in that link is the only thing that proves it is them.
export async function POST(request: Request) {
  try {
    const { s, t, kind } = await request.json() as { s?: string; t?: string; kind?: string }
    if (!s || !t || (kind !== 'boost' && kind !== 'promoter')) return NextResponse.json({ error: 'That link is not valid.' }, { status: 400 })
    const db = createAdminClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: sub } = await (db as any).from('event_submissions')
      .select('id, title, organiser_id, manage_token, start_date, status, boost_paid_at, organisers(email)')
      .eq('id', s).eq('manage_token', t).maybeSingle()
    if (!sub) return NextResponse.json({ error: 'That link is not valid.' }, { status: 404 })
    if (sub.status === 'rejected') return NextResponse.json({ error: 'This listing was not approved, so it cannot be boosted.' }, { status: 400 })
    if (new Date(sub.start_date).getTime() < Date.now()) return NextResponse.json({ error: 'This event has already happened.' }, { status: 400 })
    if (kind === 'boost' && sub.boost_paid_at) return NextResponse.json({ error: 'This event is already boosted.' }, { status: 400 })
    const url = await createOrganiserCheckout({ kind, submissionId: sub.id, organiserId: sub.organiser_id, email: sub.organisers?.email ?? '', title: sub.title, manageToken: sub.manage_token })
    return NextResponse.json({ checkoutUrl: url })
  } catch (err) {
    console.error('[list-your-event/boost] failed', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Something went wrong.' }, { status: 500 })
  }
}
