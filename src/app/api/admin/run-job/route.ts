import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'

export const maxDuration = 300
export const dynamic = 'force-dynamic'

// Jobs the admin may trigger from /admin/health. Each is called through its real cron endpoint
// (so it is recorded in job_runs exactly like a scheduled run) with the server-side CRON_SECRET.
const RUNNABLE = new Set([
  'refresh-listings',
  'match-see-tickets',
  'sync-gigsberg-catalogue',
  'sync-see-tickets',
  'match-gigsberg',
  'sync-onsale',
  'sync-council-events',
  'check-gigsberg-inventory',
])

export async function POST(request: Request) {
  try {
    await requireAdmin()
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const secret = process.env.CRON_SECRET
  if (!secret) return NextResponse.json({ error: 'CRON_SECRET is not set' }, { status: 500 })

  const { job } = await request.json().catch(() => ({})) as { job?: string }
  if (!job || !RUNNABLE.has(job)) return NextResponse.json({ error: 'Unknown job' }, { status: 400 })

  const started = Date.now()
  const res = await fetch(new URL(`/api/cron/${job}`, request.url), {
    headers: { authorization: `Bearer ${secret}` },
    cache: 'no-store',
  })
  const text = await res.text()
  let body: unknown = text.slice(0, 2000)
  try { body = JSON.parse(text) } catch { /* not JSON */ }
  return NextResponse.json({ job, httpStatus: res.status, ms: Date.now() - started, body }, { status: 200 })
}
