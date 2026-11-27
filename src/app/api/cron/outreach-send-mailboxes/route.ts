import { NextResponse } from 'next/server'
import { withJobRun } from '@/lib/jobRuns'
import { runOutreachSend } from '@/lib/outreachRun'
import { outreachMailboxes } from '@/lib/outreachMailboxes'

export const maxDuration = 120
export const dynamic = 'force-dynamic'

// Advertiser outreach from the extra mailboxes on their own domains (26 Nov 2026; see outreachMailboxes.ts). vercel.json
// runs this every 15 minutes 07:00-17:45 UTC every day, weekends included (Chris, 27 Nov 2026); a run sends at most one email per mailbox, only 08:00-17:59
// UK time, so each mailbox's emails are spread through the working day like a person's. Each mailbox keeps to its
// warm-up limit for the day, and one the provider refuses is paused for the rest of the day (outreach_mailbox_pauses).
// Until OUTREACH_MAILBOXES is set in Vercel this does nothing. ?dry=1 lists only; ?anytime=1 ignores the hours.
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
  const mailboxes = outreachMailboxes()
  if (!mailboxes.length) return NextResponse.json({ success: true, dry, note: 'no outreach mailboxes set up yet (OUTREACH_MAILBOXES in Vercel)' })
  const h = ukHour()
  if (params.get('anytime') !== '1' && (h < 8 || h > 17)) {
    return NextResponse.json({ success: true, dry, note: `outside sending hours (UK ${h}:00; sends 08:00-17:59)` })
  }
  const runs = []
  for (const m of mailboxes) runs.push(await runOutreachSend(m, 1, { dry }))
  return NextResponse.json({ success: runs.every(r => r.success), dry, runs })
}

export const GET = withJobRun('outreach-send-mailboxes', handleGet)
