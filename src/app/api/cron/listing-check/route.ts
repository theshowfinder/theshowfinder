import { NextResponse } from 'next/server'
import { runListingCheck } from '@/lib/listingCheckRun'
import { withJobRun } from '@/lib/jobRuns'

export const maxDuration = 60
export const dynamic = 'force-dynamic'

// Daily, after the imports: hide exact duplicate listings and flag anything that
// may not be a show for /admin/listing-check (see listingQuality.ts).
async function handleGet(request: Request) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return NextResponse.json(await runListingCheck())
}

export const GET = withJobRun('listing-check', handleGet)
