import { NextResponse } from 'next/server'
import { syncSeeTicketsCatalogue } from '@/lib/seeTicketsCatalogue'

export const maxDuration = 300
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const result = await syncSeeTicketsCatalogue()
    return NextResponse.json({ success: true, finished: new Date().toISOString(), ...result })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[sync] See Tickets catalogue failed:', message)
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
