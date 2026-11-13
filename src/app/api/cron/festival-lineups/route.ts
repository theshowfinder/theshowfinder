import { NextResponse } from 'next/server'
import { runFestivalLineups } from '@/lib/festivalLineupRun'
import { withJobRun } from '@/lib/jobRuns'

export const maxDuration = 60
export const dynamic = 'force-dynamic'

// Daily: refresh festival line-ups from the festivals' own pages and link new
// acts to the festival listings (the follow-alerts job then emails followers).
// ?force=1 re-reads pages even when unchanged; ?source=<id> runs one festival.
async function handleGet(request: Request) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const url = new URL(request.url)
  const results = await runFestivalLineups({
    force: url.searchParams.get('force') === '1',
    sourceId: url.searchParams.get('source') ?? undefined,
  })
  return NextResponse.json({ results })
}

export const GET = withJobRun('festival-lineups', handleGet)
