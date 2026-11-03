import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { withJobRun } from '@/lib/jobRuns'

export const dynamic = 'force-dynamic'

// After the evening's shows finish (vercel.json, 22:45 UTC): rebuild the city and list pages so tonight's finished
// shows stop being linked until the next morning (pages otherwise keep their list for up to 3 hours). About 125
// pages, nothing else: event, artist and venue pages are handled by refresh-listings (src/lib/changedPages.ts).
async function handleGet(request: Request) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  revalidatePath('/cities/[city]', 'page')
  revalidatePath('/cities/[city]/this-week', 'page')
  revalidatePath('/cities/[city]/this-weekend', 'page')
  revalidatePath('/')
  revalidatePath('/this-week')
  revalidatePath('/events')
  return NextResponse.json({ success: true })
}

export const GET = withJobRun('refresh-city-pages', handleGet)
