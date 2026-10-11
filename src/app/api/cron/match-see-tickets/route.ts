import { NextResponse } from 'next/server'
import { matchSeeTicketsCatalogue } from '@/lib/seeTicketsMatching'

export const maxDuration = 300
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const matching = await matchSeeTicketsCatalogue()
    return NextResponse.json({ success: true, finished: new Date().toISOString(), matching })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[sync] See Tickets matching failed:', message)
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
