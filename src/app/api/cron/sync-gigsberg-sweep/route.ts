import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { runGigsbergSweep, verifyStaleGigsbergEvents } from '@/lib/gigsbergSweep'
import { withJobRun } from '@/lib/jobRuns'

// A lap of the 40 UK cities is roughly a hundred API calls, so it normally finishes in one run;
// if the time budget runs out the cursor resumes on the next run. Modes (off | dry | live) live in
// gigsberg_sweep_state.mode and start in 'dry'.
export const maxDuration = 300
export const dynamic = 'force-dynamic'

async function handleGet(request: Request) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return runSweepOnce(false)
}

async function runSweepOnce(force: boolean) {
  const started = Date.now()
  try {
    const sweep = await runGigsbergSweep({ deadlineMs: started + 200_000, force })
    const verify = await verifyStaleGigsbergEvents({ deadlineMs: started + 275_000 })
    if (sweep.mode === 'live' && (sweep.stats.inserted > 0 || verify.removed > 0)) revalidatePath('/gigsberg')
    return NextResponse.json({ success: sweep.stats.failedCities < 40, started: new Date(started).toISOString(), sweep, verify })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[gigsberg-sweep] Fatal error:', message)
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}

// Admin "Run Gigsberg sweep now" button: same code and the same stored mode as the scheduled run.
// `force` starts a fresh lap even if the last one finished a moment ago.
export async function POST(request: Request) {
  const store = await cookies()
  const token = store.get('admin_token')?.value
  if (!process.env.ADMIN_PASSWORD || token !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const body = await request.json().catch(() => ({})) as { force?: boolean }
  return runSweepOnce(Boolean(body.force))
}

export const GET = withJobRun('sync-gigsberg-sweep', handleGet)
