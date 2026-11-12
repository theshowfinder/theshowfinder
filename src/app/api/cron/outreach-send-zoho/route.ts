import { NextResponse } from 'next/server'
import { withJobRun } from '@/lib/jobRuns'
import { runOutreachSend } from '@/lib/outreachRun'

export const maxDuration = 60
export const dynamic = 'force-dynamic'

// Advertiser outreach from Chris's Zoho mailbox, on top of Resend (12 Nov 2026): plain personal emails, 2 every
// quarter hour from 07:00 to 10:45 UK time (vercel.json runs it every 15 minutes 06:00–10:45 UTC; outside UK hours a
// run does nothing), never more than ZOHO_DAILY_LIMIT (25) a day. Needs ZOHO_SMTP_USER and ZOHO_SMTP_PASS (a Zoho app
// password) in Vercel; until then it does nothing. ?dry=1 lists only; ?anytime=1 ignores the hours.
const PER_RUN = 2

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
  if (params.get('anytime') !== '1' && (h < 7 || h > 10)) {
    return NextResponse.json({ success: true, dry, sent: [], failed: [], note: `outside sending hours (UK ${h}:00; sends 07:00-10:59)` })
  }
  return NextResponse.json(await runOutreachSend('zoho', PER_RUN, { dry }))
}

export const GET = withJobRun('outreach-send-zoho', handleGet)
