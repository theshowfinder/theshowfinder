import { NextResponse } from 'next/server'
import { syncGigsbergCatalogue } from '@/lib/gigsbergCatalogue'

export const maxDuration = 300
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const started = new Date().toISOString()
  try {
    const result = await syncGigsbergCatalogue()
    return NextResponse.json({ success: true, started, finished: new Date().toISOString(), ...result })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[sync] Gigsberg catalogue failed:', message)
    return NextResponse.json({ success: false, error: message, started }, { status: 500 })
  }
}
