import { createAdminClient } from '@/lib/supabase/admin'
import { attendeesCsv } from '@/lib/tickets'
import { loadDoorAccess } from '@/lib/ticketOrders'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const fmt = (iso: string | null) => (iso ? new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', dateStyle: 'short', timeStyle: 'short' }).format(new Date(iso)) : null)

// The organiser's attendee list as a spreadsheet (CSV), from their private listing link.
export async function GET(request: Request) {
  const u = new URL(request.url)
  const db = createAdminClient()
  const access = await loadDoorAccess(db, u.searchParams.get('s') ?? '', u.searchParams.get('t') ?? '')
  if (!access) return new Response('This link is not valid.', { status: 403 })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (db as any).from('tickets')
    .select('code, checked_in_at, ticket_types(name), ticket_orders!inner(buyer_name, buyer_email, status, created_at)')
    .eq('event_id', access.eventId).eq('ticket_orders.status', 'confirmed').limit(10000)
  type Row = { code: string; checked_in_at: string | null; ticket_types: { name: string } | null; ticket_orders: { buyer_name: string; buyer_email: string; created_at: string } }
  const rows = ((data ?? []) as Row[])
    .sort((a, b) => a.ticket_orders.buyer_name.localeCompare(b.ticket_orders.buyer_name))
    .map(r => ({ name: r.ticket_orders.buyer_name, email: r.ticket_orders.buyer_email, ticket: r.ticket_types?.name ?? 'Ticket', code: r.code, ordered: fmt(r.ticket_orders.created_at) ?? '', checkedIn: fmt(r.checked_in_at) }))
  const file = `${access.slug.slice(0, 60)}-attendees.csv`
  return new Response(attendeesCsv(rows), { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${file}"`, 'Cache-Control': 'no-store' } })
}
