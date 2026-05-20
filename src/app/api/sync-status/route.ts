import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'
import { SYNC_CITIES } from '@/lib/sync-cities'

export const dynamic = 'force-dynamic'

type SyncStateRow = {
  current_city_index:  number
  status:              string
  last_started_at:     string | null
  last_completed_at:   string | null
  total_events_synced: number
}

export async function GET() {
  // Require admin cookie
  const adminPassword = process.env.ADMIN_PASSWORD
  if (adminPassword) {
    const cookieStore = await cookies()
    const token = cookieStore.get('admin_token')?.value
    if (token !== adminPassword) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const db = createAdminClient()
  let syncState: SyncStateRow | null = null

  try {
    const result = await db
      .from('sync_state')
      .select('*')
      .eq('id', 1)
      .maybeSingle() as unknown as { data: SyncStateRow | null }
    syncState = result.data
  } catch {
    // Table not yet created — migration_012_sync_state.sql not yet run
  }

  return NextResponse.json({ syncState, totalCities: SYNC_CITIES.length })
}
