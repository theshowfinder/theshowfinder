import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { MODE_TABLES } from '@/lib/importCheck'

export const dynamic = 'force-dynamic'

// Admin-only: switch one source's sweep between off / dry / live. Dry counts and reports; live saves
// (and, for the dead-event checks, removes only what the source confirms is gone, with the usual caps).
export async function POST(request: Request) {
  try { await requireAdmin() } catch { return NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const { source, mode } = await request.json().catch(() => ({})) as { source?: string; mode?: string }
  const table = source ? MODE_TABLES[source as keyof typeof MODE_TABLES] : undefined
  if (!table || !mode || !['off', 'dry', 'live'].includes(mode)) return NextResponse.json({ error: 'Unknown source or mode' }, { status: 400 })
  const { error } = await createAdminClient().from(table as never).update({ mode } as never).eq('id', 1)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  console.log(`[import-mode] ${source} set to ${mode}`)
  return NextResponse.json({ ok: true, source, mode })
}
