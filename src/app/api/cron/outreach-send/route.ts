import { NextResponse } from 'next/server'
import { withJobRun } from '@/lib/jobRuns'
import { runOutreachSend } from '@/lib/outreachRun'

export const maxDuration = 60
export const dynamic = 'force-dynamic'

// Advertiser outreach by Resend (the visual email): weekday mornings at 07:10, 08:10, 09:10 and 10:10 UK time, 15 a
// run, never more than DAILY_LIMIT (60) a day (Chris, 12 Nov 2026). vercel.json runs it 06:10–10:10 UTC and a run
// outside 07:00–10:59 UK time does nothing, so it keeps to UK hours through the clock changes. Order, follow-ups,
// claiming and the brake: src/lib/outreachRun.ts. ?dry=1 lists only; ?anytime=1 ignores the hours.
const PER_RUN = 15
const UK_HOURS = { from: 7, to: 10 }

function ukHour(now = new Date()): number {
  return Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', hourCycle: 'h23' }).format(now))
}

async function handleGet(request: Request) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const params = new URL(request.url).searchParams
  const dry = params.get('dry') === '1'
  const h = ukHour()
  if (params.get('anytime') !== '1' && (h < UK_HOURS.from || h > UK_HOURS.to)) {
    return NextResponse.json({ success: true, dry, sent: [], failed: [], note: `outside sending hours (UK ${h}:00; sends 07:00-10:59)` })
  }
  return NextResponse.json(await runOutreachSend('resend', PER_RUN, { dry }))
}

export const GET = withJobRun('outreach-send', handleGet)
