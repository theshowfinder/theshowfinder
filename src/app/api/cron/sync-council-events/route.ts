import { NextResponse } from 'next/server'
import { syncCouncilEvents } from '@/lib/councilEvents'
import { withJobRun } from '@/lib/jobRuns'

export const maxDuration = 300
export const dynamic     = 'force-dynamic'

async function handleGet(request: Request) {
  // Auth: Vercel Cron sends Authorization: Bearer <CRON_SECRET>
  // Fail closed if the secret is missing in any environment.
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const started = new Date().toISOString()
  console.log(`[sync] Starting council events sync at ${started}`)

  try {
    // 50 local sources and each run only gets through a few, so it runs every 2 hours with a 4.5-minute budget:
    // every source is refreshed about once a day.
    const result = await syncCouncilEvents({ budgetMs: 270_000 })
    return NextResponse.json({
      success: true,
      started,
      finished: new Date().toISOString(),
      ...result,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[sync] Fatal error:', message)
    return NextResponse.json(
      { success: false, error: message, started },
      { status: 500 }
    )
  }
}

export const GET = withJobRun('sync-council-events', handleGet)
