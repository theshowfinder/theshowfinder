import { NextResponse } from 'next/server'
import { createPublicClient } from '@/lib/supabase/public'
import { ticketsLeft } from '@/lib/tickets'

export const dynamic = 'force-dynamic'

// How many tickets are left, live (the event page itself is cached).
export async function GET(request: Request) {
  const ids = (new URL(request.url).searchParams.get('types') ?? '').split(',').filter(id => /^[0-9a-f-]{36}$/i.test(id)).slice(0, 10)
  if (!ids.length) return NextResponse.json({ left: {} })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (createPublicClient() as any).from('ticket_types').select('id, capacity, sold').in('id', ids) as { data: { id: string; capacity: number; sold: number }[] | null }
  const left = Object.fromEntries((data ?? []).map(t => [t.id, ticketsLeft(t)]))
  return NextResponse.json({ left }, { headers: { 'Cache-Control': 'no-store' } })
}
