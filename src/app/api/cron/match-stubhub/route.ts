import { NextResponse } from 'next/server'
import { matchStubHubCatalogue } from '@/lib/stubhubCatalogue'
import { withJobRun } from '@/lib/jobRuns'

export const maxDuration = 300
export const dynamic = 'force-dynamic'

async function handleGet(request: Request) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    // ?full=1 re-scores every automatic link; ?dry=1 reports without writing anything.
    const params = new URL(request.url).searchParams
    const matching = await matchStubHubCatalogue({ full: params.get('full') === '1', dryRun: params.get('dry') === '1', deadlineMs: Date.now() + 200_000 })
    return NextResponse.json({ success: true, finished: new Date().toISOString(), matching })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[sync] StubHub matching failed:', message)
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}

export const GET = withJobRun('match-stubhub', handleGet)
