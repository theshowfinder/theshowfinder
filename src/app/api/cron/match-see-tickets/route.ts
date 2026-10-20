import { NextResponse } from 'next/server'
import { matchSeeTicketsCatalogue } from '@/lib/seeTicketsMatching'
import { requireAdmin } from '@/lib/admin-auth'
import { withJobRun } from '@/lib/jobRuns'

export const maxDuration = 300
export const dynamic = 'force-dynamic'

async function handleGet(request: Request) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const matching = await matchSeeTicketsCatalogue(false, { skipUnchanged: true, deadlineMs: Date.now() + 230_000 })
    return NextResponse.json({ success: true, finished: new Date().toISOString(), matching })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[sync] See Tickets matching failed:', message)
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}

// The admin dashboard uses short authenticated batches so a long catalogue
// match never has to stay inside a single browser/server-action request.
export async function POST(request: Request) {
  try {
    await requireAdmin()
    const body = await request.json().catch(() => ({})) as { cursor?: string; limit?: number }
    const matching = await matchSeeTicketsCatalogue(false, {
      afterId: body.cursor || undefined,
      limit: body.limit || 250,
    })
    return NextResponse.json({ success: true, matching })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[admin] See Tickets matching failed:', message)
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}

export const GET = withJobRun('match-see-tickets', handleGet)
