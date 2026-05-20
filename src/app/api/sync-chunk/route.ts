import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'
import { syncCityBatch, SYNC_CITIES } from '@/lib/sync-cities'

export const maxDuration = 60
export const dynamic     = 'force-dynamic'

type SyncStateRow = {
  id:                  number
  current_city_index:  number
  status:              string
  last_started_at:     string | null
  last_completed_at:   string | null
  total_events_synced: number
}

async function isAuthorized(request: Request): Promise<boolean> {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) return true  // dev: allow all

  // Vercel Cron sends Authorization: Bearer <CRON_SECRET>
  const authHeader = request.headers.get('authorization')
  if (authHeader === `Bearer ${cronSecret}`) return true

  // Admin panel browser requests are authenticated via admin cookie
  const cookieStore = await cookies()
  const token = cookieStore.get('admin_token')?.value
  return !!(token && token === process.env.ADMIN_PASSWORD)
}

async function handler(request: Request) {
  if (!(await isAuthorized(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = createAdminClient()

  // Read current sync state
  const { data: stateData } = await db
    .from('sync_state')
    .select('*')
    .eq('id', 1)
    .maybeSingle() as unknown as { data: SyncStateRow | null }

  const currentIndex = stateData?.current_city_index ?? 0

  // Which 3 cities are next?
  const cities = SYNC_CITIES.slice(currentIndex, currentIndex + 3)

  // If we're already at the end, reset and report complete
  if (cities.length === 0) {
    await db
      .from('sync_state')
      .update({ current_city_index: 0, status: 'idle' })
      .eq('id', 1)
    return NextResponse.json({
      success: true,
      message: 'Cycle complete — reset to index 0',
      cities_synced: [],
      events_synced: 0,
      next_index: 0,
    })
  }

  // Advance index before processing (so a crash doesn't re-run same cities)
  const rawNext    = currentIndex + cities.length
  const isComplete = rawNext >= SYNC_CITIES.length
  const nextIndex  = isComplete ? 0 : rawNext

  await db
    .from('sync_state')
    .update({
      current_city_index: nextIndex,
      status:             isComplete ? 'complete' : 'running',
      last_started_at:    new Date().toISOString(),
    })
    .eq('id', 1)

  // Run the sync
  const batchResults = await syncCityBatch([...cities])

  const totalSynced = batchResults.reduce((s, r) => s + r.count, 0)
  const now         = new Date().toISOString()

  // Update cumulative counter + completion timestamp
  await db
    .from('sync_state')
    .update({
      last_completed_at:   now,
      total_events_synced: (stateData?.total_events_synced ?? 0) + totalSynced,
    })
    .eq('id', 1)

  // Write one log row per city
  const logRows = batchResults.map(r => ({
    city:          r.city,
    events_synced: r.count,
    status:        r.status,
    error:         r.error ?? null,
    completed_at:  now,
  }))
  if (logRows.length) await db.from('sync_log').insert(logRows)

  return NextResponse.json({
    success:      true,
    cities_synced: batchResults.map(r => r.city),
    events_synced: totalSynced,
    next_index:    nextIndex,
    total_cities:  SYNC_CITIES.length,
    detail:        batchResults,
  })
}

export const GET  = handler
export const POST = handler
