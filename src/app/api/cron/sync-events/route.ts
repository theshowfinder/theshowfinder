import { NextResponse } from 'next/server'
import { syncTicketmasterEvents } from '@/lib/ticketmaster'

// Allow up to 5 minutes for a full sync (Vercel Pro/Enterprise only; Hobby = 10s)
export const maxDuration = 300
export const dynamic     = 'force-dynamic'

export async function GET(request: Request) {
  // Auth: Vercel Cron sends Authorization: Bearer <CRON_SECRET>
  // Fail closed if the secret is missing in any environment.
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const started = new Date().toISOString()
  console.log(`[sync] Starting Ticketmaster event sync (main pass) at ${started}`)

  try {
    const result = await syncTicketmasterEvents({ pass: 'main' })
    return NextResponse.json({
      success: true,
      started,
      finished: new Date().toISOString(),
      ...result,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[sync] Fatal error:', message)
    return NextResponse.json(
      { success: false, error: message, started },
      { status: 500 }
    )
  }
}
