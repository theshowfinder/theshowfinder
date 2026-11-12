export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { requireAdmin } from '@/lib/admin-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { buildOutreachEmail, SENDABLE_COMPANY_TYPES, DAILY_LIMIT, ZOHO_DAILY_LIMIT, FOLLOW_UP_AFTER_DAYS, NO_RESPONSE_AFTER_DAYS, type Prospect } from '@/lib/outreach'
import PendingButton from '@/components/admin/PendingButton'
import { addProspectAction, approveSelectedAction, setStatusAction, setCompanyTypeAction, deleteProspectAction, resumeOutreachAction } from './actions'

// Outreach: businesses near busy venues, each emailed only after Chris ticks it. The sender (cron outreach-send)
// sends up to DAILY_LIMIT a weekday, spread through the day, then one follow-up after FOLLOW_UP_AFTER_DAYS days.
type Loose = any // eslint-disable-line @typescript-eslint/no-explicit-any
type Row = Prospect & { website: string | null; address: string | null; company_number: string | null; notes: string | null; sent_at: string | null; followed_up_at: string | null; clicked_at: string | null; last_error: string | null; created_at: string; sent_via?: string | null }

const STATUSES: Array<[string, string]> = [
  ['to_check', 'Ready to check'], ['approved', 'Approved, waiting to send'], ['sent', 'Sent'], ['followed_up', 'Followed up'],
  ['replied', 'Replied'], ['interested', 'Interested'], ['onboarding', 'Onboarding'], ['won', 'Won (paid)'],
  ['no_response', 'No response'], ['not_interested', 'Not a fit'], ['unsubscribed', 'Unsubscribed'], ['bounced', 'Bounced'],
]
/** Channels the automatic brake has paused right now. */
function pausedChannels(b: { resend_paused_until?: string | null; zoho_paused_until?: string | null } | null): string[] {
  const now = Date.now()
  const on = (t: string | null | undefined) => Boolean(t && Date.parse(t) > now)
  return [on(b?.resend_paused_until) ? 'Resend' : null, on(b?.zoho_paused_until) ? 'Zoho' : null].filter((x): x is string => Boolean(x))
}
const label = (s: string) => STATUSES.find(([k]) => k === s)?.[1] ?? s
const day = (iso: string | null) => iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Europe/London' }) : null
const input = 'w-full border border-slate-200 rounded-lg px-3 py-2 text-sm'

export default async function OutreachPage({ searchParams }: { searchParams: Promise<{ status?: string; msg?: string; ok?: string }> }) {
  await requireAdmin()
  const sp = await searchParams
  const status = STATUSES.some(([k]) => k === sp.status) ? sp.status! : 'to_check'
  const db = createAdminClient() as Loose
  const [{ data: rows }, { data: all }, { data: brake }] = await Promise.all([
    db.from('outreach_prospects').select('*').eq('status', status).order('created_at', { ascending: false }).limit(200),
    db.from('outreach_prospects').select('status, clicked_at'),
    db.from('outreach_settings').select('resend_paused_until, zoho_paused_until, pause_reason').eq('id', 1).maybeSingle(),
  ])
  const paused = pausedChannels(brake)
  const counts = new Map<string, number>()
  for (const r of (all ?? []) as Array<{ status: string }>) counts.set(r.status, (counts.get(r.status) ?? 0) + 1)
  const clicks = ((all ?? []) as Array<{ clicked_at: string | null }>).filter(r => r.clicked_at).length
  const list = (rows ?? []) as Row[]
  const card = 'bg-white border border-slate-200 rounded-2xl p-4'

  return (
    <div className="min-h-screen bg-slate-50">
      <main className="max-w-5xl mx-auto px-4 py-6 space-y-5">
        <div>
          <h1 className="text-xl font-extrabold text-slate-900">Outreach</h1>
          <p className="text-sm text-slate-600">Nothing is emailed until you tick it. Up to {DAILY_LIMIT} visual emails a weekday from partners@ (Resend) and {ZOHO_DAILY_LIMIT} plain ones from your Zoho mailbox, 07:00–11:00 UK, busiest venues first; one follow-up after {FOLLOW_UP_AFTER_DAYS} days, then &ldquo;No response&rdquo; after {NO_RESPONSE_AFTER_DAYS}; replies go to hello@. The link opens the city mock-up with their name in it and a pre-filled sign-up. Only limited companies can be ticked (UK rules: sole traders and partnerships need consent first). {clicks} business{clicks === 1 ? '' : 'es'} clicked through so far.</p>
        </div>
        {paused.length > 0 && (
          <form action={resumeOutreachAction} className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 flex flex-wrap items-center justify-between gap-3">
            <span><b>{paused.join(' and ')} outreach paused</b> by the automatic brake: {brake?.pause_reason ?? 'no reason recorded'}</span>
            <PendingButton pendingLabel="Resuming…" className="rounded-lg bg-amber-600 text-white font-bold text-xs px-3 py-1.5">Resume sending</PendingButton>
          </form>
        )}
        {sp.msg && <div className={`rounded-xl border px-4 py-3 text-sm font-semibold ${sp.ok === '1' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-800'}`}>{sp.msg}</div>}

        <nav className="flex gap-2 overflow-x-auto pb-1">
          {STATUSES.map(([k, l]) => (
            <Link key={k} href={`/admin/outreach?status=${k}`} className={`shrink-0 text-xs font-semibold px-3 py-1.5 rounded-full border ${k === status ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200'}`}>{l} · {counts.get(k) ?? 0}</Link>
          ))}
        </nav>

        {list.length === 0 ? <div className={`${card} text-sm text-slate-500 text-center`}>Nothing here.</div> : (
          <form action={approveSelectedAction} className="space-y-3">
            {status === 'to_check' && <PendingButton pendingLabel="Approving…" className="rounded-lg bg-green-700 text-white font-bold text-sm px-4 py-2">Approve ticked for sending</PendingButton>}
            {list.map(r => {
              const email = buildOutreachEmail(r, r.status === 'sent' ? 'follow_up' : 'first')
              // Tickable when the business may be emailed at all (limited company, or said yes); the status is checked by the sender.
              const ok = (SENDABLE_COMPANY_TYPES as readonly string[]).includes(r.company_type)
              return (
                <div key={r.id} className={card}>
                  <div className="flex items-start gap-3">
                    {status === 'to_check' && <input type="checkbox" name="id" value={r.id} disabled={!ok} className="mt-1.5 h-5 w-5 shrink-0" aria-label={`Approve ${r.business_name}`} />}
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-slate-900">{r.business_name} <span className="text-xs font-semibold text-slate-500">· {r.category} · {r.city}</span></p>
                      <p className="text-sm text-slate-600 break-all">{r.email}{r.website ? <> · <a href={r.website} target="_blank" rel="noreferrer" className="text-blue-600">website</a></> : null}</p>
                      <p className="text-xs text-slate-500">{[r.distance_label ?? (r.near_venue ? `near ${r.near_venue}` : null), r.address].filter(Boolean).join(' · ')}</p>
                      <p className={`text-xs font-semibold mt-1 ${ok ? 'text-emerald-700' : 'text-amber-700'}`}>
                        {r.company_type === 'ltd' ? `Limited company${r.company_number ? ` (${r.company_number})` : ''}` : r.company_type === 'consented' ? 'Said yes to hearing from us' : `Company type: ${r.company_type.replace('_', ' ')} (not confirmed)`}
                        {' · '}{label(r.status)}{r.sent_at ? ` · sent ${day(r.sent_at)}${r.sent_via === 'zoho' ? ' (Zoho)' : ''}` : ''}{r.followed_up_at ? ` · followed up ${day(r.followed_up_at)}` : ''}{r.clicked_at ? ' · clicked' : ''}
                      </p>
                      {r.last_error && <p className="text-xs text-red-700 mt-1">Last send failed: {r.last_error}</p>}
                      {r.notes && <p className="text-xs text-slate-500 mt-1">{r.notes}</p>}
                      <details className="mt-2">
                        <summary className="text-xs font-semibold text-blue-600 cursor-pointer">Preview the {r.status === 'sent' ? 'follow-up' : 'email'}</summary>
                        <div className="mt-2 rounded-xl border border-slate-200 p-3 text-sm">
                          <p className="font-bold mb-2">{email.subject}</p>
                          <iframe title={`Email to ${r.business_name}`} srcDoc={email.html} className="w-full h-[640px] rounded-lg border border-slate-200 bg-white" />
                          <a href={`/admin/outreach/preview/${r.id}`} target="_blank" rel="noreferrer" className="inline-block mt-2 text-xs font-semibold text-blue-600">Open full preview with the real show →</a>
                        </div>
                      </details>
                    </div>
                  </div>
                </div>
              )
            })}
          </form>
        )}

        {list.length > 0 && (
          <section className={card}>
            <h2 className="font-extrabold text-slate-900 mb-2">Update one business</h2>
            <div className="space-y-2">
              {list.map(r => (
                <div key={r.id} className="flex flex-wrap items-center gap-2 text-sm border-t border-slate-100 pt-2">
                  <span className="font-semibold min-w-[10rem]">{r.business_name}</span>
                  {['replied', 'interested', 'won', 'not_interested'].map(s => (
                    <form key={s} action={setStatusAction.bind(null, r.id, s)}><PendingButton pendingLabel="…" className="text-xs font-semibold rounded-full border border-slate-300 px-3 py-1">{label(s)}</PendingButton></form>
                  ))}
                  <form action={setCompanyTypeAction.bind(null, r.id)} className="flex items-center gap-1">
                    <select name="company_type" defaultValue={r.company_type} className="text-xs border border-slate-200 rounded px-1 py-1">
                      {['ltd', 'unconfirmed', 'sole_trader', 'partnership', 'unknown', 'consented'].map(t => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
                    </select>
                    <input name="company_number" defaultValue={r.company_number ?? ''} placeholder="Company no." className="text-xs border border-slate-200 rounded px-2 py-1 w-28" />
                    <PendingButton pendingLabel="…" className="text-xs font-semibold rounded-full border border-slate-300 px-3 py-1">Save</PendingButton>
                  </form>
                  {['to_check', 'approved'].includes(r.status) && <form action={deleteProspectAction.bind(null, r.id)}><PendingButton pendingLabel="…" className="text-xs font-semibold text-red-600 px-2 py-1">Remove</PendingButton></form>}
                </div>
              ))}
            </div>
          </section>
        )}

        <section className={card}>
          <h2 className="font-extrabold text-slate-900 mb-3">Add a business</h2>
          <form action={addProspectAction} className="grid sm:grid-cols-2 gap-2">
            <input name="business_name" placeholder="Business name" required className={input} />
            <input name="contact_name" placeholder="Contact name (optional)" className={input} />
            <input name="email" type="email" placeholder="Email (from their website)" required className={input} />
            <input name="city" placeholder="City (e.g. Manchester)" required className={input} />
            <select name="category" className={input} defaultValue="Restaurant">{['Restaurant', 'Bar', 'Pub', 'Cafe', 'Hotel', 'Other'].map(c => <option key={c}>{c}</option>)}</select>
            <input name="near_venue" placeholder="Nearest venue (e.g. Co-op Live)" className={input} />
            <input name="distance_label" placeholder="e.g. a 5-minute walk from Co-op Live" className={input} />
            <input name="website" placeholder="Website" className={input} />
            <input name="address" placeholder="Address" className={input} />
            <select name="company_type" className={input} defaultValue="unknown">{['ltd', 'unconfirmed', 'sole_trader', 'partnership', 'unknown', 'consented'].map(t => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}</select>
            <input name="company_number" placeholder="Companies House number" className={input} />
            <input name="notes" placeholder="Notes" className={`${input} sm:col-span-2`} />
            <div className="sm:col-span-2"><PendingButton pendingLabel="Adding…" className="rounded-lg bg-slate-900 text-white font-bold text-sm px-4 py-2">Add</PendingButton></div>
          </form>
        </section>
      </main>
    </div>
  )
}
