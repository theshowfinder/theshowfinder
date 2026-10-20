import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { importFeedEvents } from '@/lib/feedEventImport'
import { requireAdmin } from '@/lib/admin-auth'
import { withJobRun } from '@/lib/jobRuns'

export const maxDuration = 300
export const dynamic = 'force-dynamic'

async function runOnce() {
  try {
    const result = await importFeedEvents({ deadlineMs: Date.now() + 240_000 })
    if (result.mode === 'live' && (result.gigsberg.imported > 0 || result.see_tickets.imported > 0)) {
      revalidatePath('/events', 'layout')
      revalidatePath('/cities', 'layout')
    }
    return NextResponse.json({ success: result.gigsberg.errors + result.see_tickets.errors === 0 || result.gigsberg.imported + result.see_tickets.imported > 0 || result.mode !== 'live', ...result })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[feed-import] failed:', message)
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}

async function handleGet(request: Request) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return runOnce()
}

export async function POST() {
  try { await requireAdmin() } catch { return NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  return runOnce()
}

export const GET = withJobRun('import-feed-events', handleGet)
