import { NextResponse } from 'next/server'
import { syncStubHubCatalogue } from '@/lib/stubhubCatalogue'
import { withJobRun } from '@/lib/jobRuns'

export const maxDuration = 300
export const dynamic = 'force-dynamic'

async function handleGet(request: Request) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const result = await syncStubHubCatalogue({ deadlineMs: Date.now() + 240_000 })
    return NextResponse.json({ success: true, finished: new Date().toISOString(), ...result })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[sync] StubHub catalogue failed:', message)
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}

export const GET = withJobRun('sync-stubhub', handleGet)
