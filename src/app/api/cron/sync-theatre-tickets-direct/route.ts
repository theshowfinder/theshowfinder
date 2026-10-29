import { NextResponse } from 'next/server'
import { syncTheatreTicketsDirect } from '@/lib/theatreTicketsDirect'
import { withJobRun } from '@/lib/jobRuns'

export const maxDuration = 120
export const dynamic = 'force-dynamic'

// Daily (vercel.json): Theatre Tickets Direct product feed into ttd_catalogue.
async function handleGet(request: Request) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const result = await syncTheatreTicketsDirect()
  return NextResponse.json({ success: true, ...result })
}

export const GET = withJobRun('sync-theatre-tickets-direct', handleGet)
