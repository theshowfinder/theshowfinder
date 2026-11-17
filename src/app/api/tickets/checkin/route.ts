import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { parseTicketCode } from '@/lib/tickets'
import { loadDoorAccess, checkIn, doorCounts } from '@/lib/ticketOrders'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Door scanner: { s, t } is the organiser's private listing link, code is the scanned or typed ticket.
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as { s?: string; t?: string; code?: string }
  const db = createAdminClient()
  const access = await loadDoorAccess(db, String(body.s ?? ''), String(body.t ?? ''))
  if (!access) return NextResponse.json({ error: 'This door link is not valid.' }, { status: 403 })
  const code = parseTicketCode(String(body.code ?? ''))
  const result = code ? await checkIn(db, access.eventId, code) : { result: 'not_found' as const }
  const counts = await doorCounts(db, access.eventId)
  return NextResponse.json({ ...result, code, counts }, { headers: { 'Cache-Control': 'no-store' } })
}
