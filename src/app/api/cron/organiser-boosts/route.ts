import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { withJobRun } from '@/lib/jobRuns'

export const maxDuration = 60
export const dynamic = 'force-dynamic'

// Daily: an organiser listing stops being featured once its paid boost has run out (the event date),
// unless the organiser is on an active Promoter plan.
async function handleGet(request: Request) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const db = createAdminClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const loose = db as any
  const { data: promoters } = await loose.from('organisers').select('id').eq('plan', 'promoter').eq('plan_status', 'active')
  const keep = new Set(((promoters ?? []) as { id: string }[]).map(p => p.id))
  const { data: expired, error } = await loose.from('events').select('id, organiser_id')
    .eq('is_featured', true).not('organiser_id', 'is', null).lt('boost_until', new Date().toISOString()).limit(1000)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const off = ((expired ?? []) as { id: string; organiser_id: string }[]).filter(e => !keep.has(e.organiser_id)).map(e => e.id)
  if (off.length) await loose.from('events').update({ is_featured: false }).in('id', off)
  return NextResponse.json({ unfeatured: off.length })
}

export const GET = withJobRun('organiser-boosts', handleGet)
