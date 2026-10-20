import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'
import { loadHealthSnapshot } from '@/lib/healthSnapshot'
import { loadImportCards } from '@/lib/importCheck'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Used by the Morning clean-up: the health check's issues plus whether every import is confirmed,
// so one button gives one verdict.
export async function GET() {
  try { await requireAdmin() } catch { return NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  try {
    const [snap, imports] = await Promise.all([loadHealthSnapshot(), loadImportCards()])
    return NextResponse.json({
      issues: snap.issues.map(i => ({ key: i.key, severity: i.severity, message: i.message })),
      imports: imports.map(c => ({ key: c.key, label: c.label, state: c.state, headline: c.headline })),
    })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
