// Organiser dashboard data: their events with sales, and one event's ticket types, discount codes and messages.
// Access is checked by the caller (verifyOrganiserLink); every query here is also scoped to the organiser's id.
import { createAdminClient } from '@/lib/supabase/admin'
import { organiserLinkParams, organiserQuery, verifyOrganiserLink } from '@/lib/organiserAccess'

type Loose = any // eslint-disable-line @typescript-eslint/no-explicit-any
const SITE = 'https://www.theshowfinder.com'

export function organiserSecret(): string {
  return process.env.ORGANISER_LINK_SECRET || process.env.CRON_SECRET || ''
}

export function dashboardUrl(organiserId: string, path = '/organiser'): string {
  return `${SITE}${path}?${organiserQuery(organiserLinkParams(organiserId, organiserSecret()))}`
}

export type Access = { o: string; e: string; k: string }

/** The organiser id for a signed link, or null. */
export function organiserFrom(p: Partial<Access> | URLSearchParams | FormData): string | null {
  const get = (k: string) => (p instanceof URLSearchParams || p instanceof FormData ? String(p.get(k) ?? '') : String((p as Record<string, string | undefined>)[k] ?? ''))
  return verifyOrganiserLink({ o: get('o'), e: get('e'), k: get('k') }, organiserSecret())
}

export interface EventSummary {
  submissionId: string; manageToken: string; title: string; startDate: string; status: string; slug: string | null; eventId: string | null
  ticketing: 'free' | 'paid' | 'link'; sold: number; capacity: number; checkedIn: number; takingsPence: number
}

export async function loadOrganiser(organiserId: string): Promise<Loose | null> {
  const { data } = await (createAdminClient() as Loose).from('organisers').select('*').eq('id', organiserId).maybeSingle()
  return data ?? null
}

export async function loadEvents(organiserId: string): Promise<EventSummary[]> {
  const db = createAdminClient() as Loose
  const { data: subs } = await db.from('event_submissions')
    .select('id, manage_token, title, start_date, status, event_id, free_capacity, paid_price_pence, events(slug)')
    .eq('organiser_id', organiserId).order('start_date', { ascending: false }).limit(200)
  const rows = (subs ?? []) as Loose[]
  const eventIds = rows.map(r => r.event_id).filter(Boolean)
  const types = new Map<string, { sold: number; capacity: number }>()
  const takings = new Map<string, number>()
  const checked = new Map<string, number>()
  if (eventIds.length) {
    const { data: tt } = await db.from('ticket_types').select('event_id, sold, capacity').in('event_id', eventIds)
    for (const t of (tt ?? []) as Loose[]) { const x = types.get(t.event_id) ?? { sold: 0, capacity: 0 }; x.sold += t.sold; x.capacity += t.capacity; types.set(t.event_id, x) }
    const { data: orders } = await db.from('ticket_orders').select('event_id, quantity, ticket_price_pence').in('event_id', eventIds).eq('status', 'confirmed').limit(20000)
    for (const o of (orders ?? []) as Loose[]) takings.set(o.event_id, (takings.get(o.event_id) ?? 0) + o.quantity * o.ticket_price_pence)
    const { data: ins } = await db.from('tickets').select('event_id').in('event_id', eventIds).not('checked_in_at', 'is', null).limit(20000)
    for (const t of (ins ?? []) as Loose[]) checked.set(t.event_id, (checked.get(t.event_id) ?? 0) + 1)
  }
  return rows.map(r => {
    const t = r.event_id ? types.get(r.event_id) : undefined
    return {
      submissionId: r.id, manageToken: r.manage_token, title: r.title, startDate: r.start_date, status: r.status, slug: r.events?.slug ?? null, eventId: r.event_id,
      ticketing: r.paid_price_pence ? 'paid' : r.free_capacity ? 'free' : 'link',
      sold: t?.sold ?? 0, capacity: t?.capacity ?? 0, checkedIn: r.event_id ? checked.get(r.event_id) ?? 0 : 0, takingsPence: r.event_id ? takings.get(r.event_id) ?? 0 : 0,
    }
  })
}

export interface ManageData {
  sub: Loose
  types: Array<{ id: string; name: string; price_pence: number; capacity: number; sold: number; active: boolean; sales_end: string | null; sort: number }>
  codes: Array<{ id: string; code: string; percent_off: number | null; amount_off_pence: number | null; max_uses: number | null; expires_at: string | null; active: boolean; used: number }>
  messages: Array<{ subject: string; recipients: number; created_at: string }>
  holders: number
}

/** One of the organiser's events, or null if it isn't theirs. */
export async function loadManage(organiserId: string, submissionId: string): Promise<ManageData | null> {
  if (!/^[0-9a-f-]{36}$/i.test(submissionId)) return null
  const db = createAdminClient() as Loose
  const { data: sub } = await db.from('event_submissions').select('id, manage_token, title, start_date, status, event_id, free_capacity, paid_price_pence, organiser_id, events(slug, start_date)')
    .eq('id', submissionId).eq('organiser_id', organiserId).maybeSingle()
  if (!sub) return null
  if (!sub.event_id) return { sub, types: [], codes: [], messages: [], holders: 0 }
  const [{ data: types }, { data: codes }, { data: messages }, { data: orders }] = await Promise.all([
    db.from('ticket_types').select('id, name, price_pence, capacity, sold, active, sales_end, sort').eq('event_id', sub.event_id).order('sort'),
    db.from('discount_codes').select('id, code, percent_off, amount_off_pence, max_uses, expires_at, active').eq('event_id', sub.event_id).order('created_at'),
    db.from('organiser_messages').select('subject, recipients, created_at').eq('event_id', sub.event_id).order('created_at', { ascending: false }).limit(20),
    db.from('ticket_orders').select('buyer_email, discount_code_id, quantity, status').eq('event_id', sub.event_id).eq('status', 'confirmed').limit(20000),
  ])
  const used = new Map<string, number>()
  for (const o of (orders ?? []) as Loose[]) if (o.discount_code_id) used.set(o.discount_code_id, (used.get(o.discount_code_id) ?? 0) + o.quantity)
  return {
    sub,
    types: types ?? [],
    codes: ((codes ?? []) as Loose[]).map(c => ({ ...c, used: used.get(c.id) ?? 0 })),
    messages: messages ?? [],
    holders: new Set(((orders ?? []) as Loose[]).map(o => o.buyer_email)).size,
  }
}

/** The "Buy tickets" button organisers paste on their own website (links to the event's ticket box). */
export function ticketButtonHtml(slug: string, title: string): string {
  const url = `${SITE}/events/${slug}?utm_source=organiser&utm_medium=button#tickets`
  const label = `Tickets for ${title}`.replace(/[<>"&]/g, '')
  return `<a href="${url}" target="_blank" rel="noopener" title="${label}" style="display:inline-block;background:#E8003D;color:#ffffff;font:700 16px/1 Arial,sans-serif;padding:14px 24px;border-radius:999px;text-decoration:none">Buy tickets</a>`
}
