import { NextResponse } from 'next/server'
import { runTicketmasterSweep, verifyStaleTicketmasterEvents } from '@/lib/ticketmasterSweep'
import { withJobRun } from '@/lib/jobRuns'

// One lap of the UK is a few hundred API calls, but it is spread over several runs a day so any
// single run stays well inside the function limit; each run resumes from the stored cursor.
export const maxDuration = 300
export const dynamic = 'force-dynamic'

async function handleGet(request: Request) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const started = Date.now()
  try {
    const sweep = await runTicketmasterSweep({ deadlineMs: started + 200_000 })
    const verify = await verifyStaleTicketmasterEvents({ deadlineMs: started + 275_000 })
    const hardFail = sweep.status === 'rate_limited' && sweep.stats.pages === 0
    return NextResponse.json({ success: !hardFail, started: new Date(started).toISOString(), sweep, verify })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[sweep] Fatal error:', message)
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}

export const GET = withJobRun('sync-ticketmaster-sweep', handleGet)
