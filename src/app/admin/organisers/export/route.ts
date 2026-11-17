import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

const cell = (v: unknown) => {
  const s = v == null ? '' : Array.isArray(v) ? v.join(', ') : String(v)
  return `"${(/^[=+\-@]/.test(s) ? `'${s}` : s).replace(/"/g, '""')}"`
}

// Organisers to contact, as a spreadsheet (admin only).
export async function GET(request: Request) {
  const store = await cookies()
  if (store.get('admin_token')?.value !== process.env.ADMIN_PASSWORD) return new Response('Not allowed', { status: 403 })
  const u = new URL(request.url)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q = (createAdminClient() as any).from('organiser_prospects')
    .select('name, city, towns, events_seen, total_events, attendees_hosted, sample_event, sample_venue, next_event_date, email, phone, website, instagram, facebook, company_type, company_name, company_number, contact_route, status, profile_url')
    .order('events_seen', { ascending: false }).limit(10000)
  const route = u.searchParams.get('route')
  const city = u.searchParams.get('city')
  if (route) q = q.eq('contact_route', route)
  if (city) q = q.eq('city', city)
  const { data } = await q
  const cols = ['name', 'city', 'towns', 'events_seen', 'total_events', 'attendees_hosted', 'sample_event', 'sample_venue', 'next_event_date', 'email', 'phone', 'website', 'instagram', 'facebook', 'company_type', 'company_name', 'company_number', 'contact_route', 'status', 'profile_url']
  const csv = [cols.map(cell).join(','), ...((data ?? []) as Record<string, unknown>[]).map(r => cols.map(c => cell(r[c])).join(','))].join('\r\n') + '\r\n'
  return new Response(csv, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="organisers-${route ?? 'all'}.csv"`, 'Cache-Control': 'no-store' } })
}
