import { NextResponse } from 'next/server'
import { detectNewShows } from '@/lib/newShowsDetector'

export const maxDuration = 120
export const dynamic     = 'force-dynamic'

// Turns shows added to the database in the last 7 days into pending drafts in
// the News Inbox (/admin/news): per-city "New shows added" roundups and
// per-artist "adds dates" items. Nothing is published automatically.
export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret) {
    const auth = request.headers.get('authorization')
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const started = new Date().toISOString()
  try {
    const result = await detectNewShows()
    return NextResponse.json({ success: true, started, finished: new Date().toISOString(), ...result })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[detect-new-shows] Fatal error:', message)
    return NextResponse.json({ success: false, error: message, started }, { status: 500 })
  }
}
