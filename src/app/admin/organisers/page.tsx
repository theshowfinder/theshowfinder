export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { requireAdmin } from '@/lib/admin-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { CITIES } from '@/lib/cities'
import { setOrganiserStatusAction, approveOrganisersAction } from './actions'
import { buildTicketEmail, TICKET_OUTREACH_PER_DAY, TICKET_FOLLOW_UP_DAYS } from '@/lib/ticketOutreach'
import { ticketsStripeReady, ticketsTestMode } from '@/lib/ticketPayments'

// People who sell event tickets, found by cron organiser-find on public event listings, with the best way to
// reach each one: an email from their own website, or their Instagram / Facebook.
type Loose = any // eslint-disable-line @typescript-eslint/no-explicit-any
type Row = {
  id: string; name: string | null; city: string; towns: string[]; events_seen: number; total_events: number | null; attendees_hosted: string | null
  sample_event: string | null; sample_event_url: string | null; sample_venue: string | null; next_event_date: string | null
  website: string | null; facebook: string | null; instagram: string | null; email: string | null; phone: string | null
  company_name: string | null; company_number: string | null; company_type: string; contact_route: string; status: string; profile_url: string | null; notes: string | null
  unsubscribe_token: string; sent_at: string | null
}
const ROUTES: Array<[string, string]> = [['email', 'Email found'], ['social', 'Instagram / Facebook only'], ['none', 'No contact found'], ['pending', 'Still being checked']]
const STATUSES: Array<[string, string]> = [['new', 'New'], ['approved', 'Approved, waiting to send'], ['contacted', 'Emailed'], ['followed_up', 'Followed up'], ['replied', 'Replied'], ['listed', 'Listed with us'], ['not_interested', 'Not interested'], ['unsubscribed', 'Unsubscribed'], ['bounced', 'Bounced']]

export default async function OrganisersPage({ searchParams }: { searchParams: Promise<{ route?: string; city?: string; status?: string }> }) {
  await requireAdmin()
  const sp = await searchParams
  const route = ROUTES.some(([k]) => k === sp.route) ? sp.route! : 'email'
  const city = CITIES.find(c => c.name === sp.city)?.name ?? ''
  const status = STATUSES.some(([k]) => k === sp.status) ? sp.status! : 'new'
  const db = createAdminClient() as Loose
  let q = db.from('organiser_prospects').select('*').eq('contact_route', route).eq('status', status).order('events_seen', { ascending: false }).limit(300)
  if (city) q = q.eq('city', city)
  const [{ data: rows }, { data: all }, { data: log }] = await Promise.all([
    q,
    db.from('organiser_prospects').select('contact_route, company_type').limit(20000),
    db.from('organiser_search_log').select('city'),
  ])
  const counts = new Map<string, number>()
  let ltd = 0
  for (const r of (all ?? []) as Array<{ contact_route: string; company_type: string }>) {
    counts.set(r.contact_route, (counts.get(r.contact_route) ?? 0) + 1)
    if (r.contact_route === 'email' && r.company_type === 'ltd') ltd++
  }
  const list = (rows ?? []) as Row[]
  const paidLive = ticketsStripeReady() && !ticketsTestMode()
  const href = (o: Record<string, string>) => `/admin/organisers?${new URLSearchParams({ route, status, ...(city ? { city } : {}), ...o }).toString()}`
  const chip = (on: boolean) => `px-3 py-1.5 rounded-full text-sm font-semibold border ${on ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-700 border-slate-200'}`

  return (
    <div className="min-h-screen bg-slate-50">
      <main className="max-w-6xl mx-auto px-4 py-6 space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-black text-slate-900">Organisers to contact</h1>
            <p className="text-sm text-slate-600">People selling event tickets in our cities, found on public listings each weekday. {(log ?? []).length} of {CITIES.length} cities searched so far.</p>
          </div>
          <a href={`/admin/organisers/export?route=${route}${city ? `&city=${encodeURIComponent(city)}` : ''}`} className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white">Download spreadsheet</a>
        </div>

        <div className="flex flex-wrap gap-2">
          {ROUTES.map(([k, l]) => <Link key={k} href={href({ route: k })} className={chip(route === k)}>{l} ({counts.get(k) ?? 0})</Link>)}
        </div>
        <div className="flex flex-wrap gap-2">
          {STATUSES.map(([k, l]) => <Link key={k} href={href({ status: k })} className={chip(status === k)}>{l}</Link>)}
          <form className="ml-auto" action="/admin/organisers">
            <input type="hidden" name="route" value={route} /><input type="hidden" name="status" value={status} />
            <select name="city" defaultValue={city} className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm">
              <option value="">All cities</option>
              {CITIES.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
            </select>
            <button className="ml-2 text-sm font-semibold underline">Show</button>
          </form>
        </div>
        {route === 'email' && status === 'new' && list.length > 0 && (
          <form id="approve" action={approveOrganisersAction} className="rounded-2xl border-2 border-slate-900 bg-white p-4 space-y-2">
            <p className="font-extrabold text-slate-900">Ticket-selling outreach</p>
            <p className="text-sm text-slate-600">Tick the organisers to email, or approve everyone here with an email. They go out on weekdays 9am to 5pm, up to {TICKET_OUTREACH_PER_DAY} a day, with one follow-up after {TICKET_FOLLOW_UP_DAYS} days. {paidLive ? 'Paid tickets are live, so the email leads with selling tickets.' : 'Paid tickets are not live yet, so the email offers free listings and free tickets only; it switches to selling tickets automatically once Stripe is live.'} Open a draft below to read it.</p>
            <div className="flex flex-wrap gap-2">
              <button className="rounded-lg bg-[#E8003D] px-4 py-2 text-sm font-extrabold text-white">Approve ticked</button>
              <button name="all" value="1" className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-bold text-slate-900">Approve all with an email</button>
            </div>
          </form>
        )}
        {route === 'email' && <p className="text-xs text-slate-500">{ltd} of {counts.get('email') ?? 0} with an email are limited companies confirmed with Companies House.</p>}

        <div className="space-y-2">
          {list.length === 0 && <p className="text-slate-500 text-sm">Nothing here yet. The finder runs five times each weekday.</p>}
          {list.map(r => (
            <div key={r.id} className="bg-white border border-slate-200 rounded-2xl p-4 grid gap-2 md:grid-cols-[1.4fr_1.2fr_auto]">
              <div>
                {r.email && r.status === 'new' && <label className="mr-2 inline-flex"><input type="checkbox" name="id" value={r.id} form="approve" className="h-4 w-4" /></label>}
                <p className="font-extrabold text-slate-900">{r.profile_url ? <a href={r.profile_url} target="_blank" rel="noopener noreferrer" className="hover:underline">{r.name ?? 'Unnamed organiser'}</a> : r.name ?? 'Unnamed organiser'}</p>
                <p className="text-xs text-slate-500">{r.city}{r.towns?.length ? ` · ${r.towns.slice(0, 4).join(', ')}` : ''} · {r.events_seen} upcoming seen{r.total_events ? ` · ${r.total_events} run in total` : ''}{r.attendees_hosted ? ` · ${r.attendees_hosted} attendees` : ''}</p>
                {r.email && (r.status === 'new' || r.status === 'approved') && (() => { const d = buildTicketEmail({ ...r, unsubscribe_token: r.unsubscribe_token }, 'first', paidLive); return (
                  <details className="mt-2"><summary className="text-xs font-semibold underline cursor-pointer">Read the email</summary><p className="mt-2 text-xs font-bold">{d.subject}</p><pre className="mt-1 whitespace-pre-wrap font-sans text-xs text-slate-700 bg-slate-50 rounded-lg p-2">{d.text}</pre></details>
                ) })()}
                {r.sample_event && <p className="text-xs text-slate-600 mt-1">e.g. {r.sample_event_url ? <a href={r.sample_event_url} target="_blank" rel="noopener noreferrer" className="underline">{r.sample_event}</a> : r.sample_event}{r.sample_venue ? ` at ${r.sample_venue}` : ''}{r.next_event_date ? ` (${r.next_event_date})` : ''}</p>}
              </div>
              <div className="text-sm space-y-0.5 break-all">
                {r.email && <p><a href={`mailto:${r.email}`} className="font-semibold underline">{r.email}</a></p>}
                {r.phone && <p>{r.phone}</p>}
                <p className="flex flex-wrap gap-x-3">
                  {r.website && <a href={r.website} target="_blank" rel="noopener noreferrer" className="underline">Website</a>}
                  {r.instagram && <a href={r.instagram} target="_blank" rel="noopener noreferrer" className="underline">Instagram</a>}
                  {r.facebook && <a href={r.facebook} target="_blank" rel="noopener noreferrer" className="underline">Facebook</a>}
                </p>
                <p className="text-xs text-slate-500">{r.company_type === 'ltd' ? `Ltd company: ${r.company_name} (${r.company_number})` : r.company_name ? `Website names ${r.company_name} (not confirmed)` : 'Company not confirmed'}{r.notes ? ` · ${r.notes}` : ''}</p>
              </div>
              <form action={setOrganiserStatusAction} className="flex items-start gap-2">
                <input type="hidden" name="id" value={r.id} />
                <select name="status" defaultValue={r.status} className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm">
                  {STATUSES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select>
                <button className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold">Save</button>
              </form>
            </div>
          ))}
        </div>
      </main>
    </div>
  )
}
