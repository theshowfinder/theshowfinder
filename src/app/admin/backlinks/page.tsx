export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { requireAdmin } from '@/lib/admin-auth'
import { LINK_DAILY_LIMIT, LINK_FOLLOW_UP_DAYS } from '@/lib/linkOutreach'
import { LINK_SELECT, draftFor, linkDb } from '@/lib/linkOutreachSend'
import PendingButton from '@/components/admin/PendingButton'
import { approveAction, setLinkStatusAction, addLinkContactAction } from './actions'

// Backlink outreach: venues, organisers and press, each emailed only after Chris approves the draft. The finder
// (cron link-find) drafts; the sender (cron link-send) sends approved ones on weekdays, then one follow-up; the
// checker (cron link-check) marks sites that start linking to us.
type Loose = any // eslint-disable-line @typescript-eslint/no-explicit-any
const STATUSES: Array<[string, string]> = [
  ['ready', 'Ready to approve'], ['approved', 'Approved, waiting to send'], ['sent', 'Sent'], ['followed_up', 'Followed up'],
  ['replied', 'Replied'], ['linked', 'Linking to us'], ['no_email', 'No email found'], ['no_site', 'No website found'],
  ['skipped', 'Skipped'], ['declined', 'Not interested'], ['unsubscribed', 'Unsubscribed'], ['failed', 'Failed'],
]
const day = (iso: string | null) => iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Europe/London' }) : ''
const input = 'w-full border border-slate-200 rounded-lg px-3 py-2 text-sm'

export default async function BacklinksPage({ searchParams }: { searchParams: Promise<{ status?: string; msg?: string }> }) {
  await requireAdmin()
  const sp = await searchParams
  const status = STATUSES.some(([k]) => k === sp.status) ? sp.status! : 'ready'
  const db = linkDb()
  const [{ data: rows }, { data: all }] = await Promise.all([
    db.from('link_prospects').select(`${LINK_SELECT}, domain, approved_at, followed_up_at, replied_at, linked_at, link_url, last_error, created_at`).eq('status', status).order('shows', { ascending: false, nullsFirst: false }).order('created_at', { ascending: false }).limit(150),
    db.from('link_prospects').select('status'),
  ])
  const counts = new Map<string, number>()
  for (const r of (all ?? []) as Loose[]) counts.set(r.status, (counts.get(r.status) ?? 0) + 1)
  const list = (rows ?? []) as Loose[]
  const emailed = ['sent', 'followed_up', 'replied', 'linked', 'declined'].reduce((n, s) => n + (counts.get(s) ?? 0), 0)

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold text-slate-900">Backlinks outreach</h1>
        <p className="text-sm text-slate-600">Venues we list, organisers and press, offered something useful that comes with a link back to us. Nothing is sent until you approve it. Sends weekdays 9am to 5pm, up to {LINK_DAILY_LIMIT} a day, with one follow-up after {LINK_FOLLOW_UP_DAYS} days. Sites that start linking to us are found automatically.</p>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[['Emailed', emailed], ['Replied', counts.get('replied') ?? 0], ['Linking to us', counts.get('linked') ?? 0], ['Ready to approve', counts.get('ready') ?? 0]].map(([l, n]) => (
          <div key={l as string} className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-xs font-bold uppercase text-slate-400">{l}</p><p className="text-2xl font-extrabold text-slate-900">{n}</p></div>
        ))}
      </div>
      {sp.msg && <p className="rounded-xl bg-green-50 border border-green-200 px-4 py-3 text-sm font-semibold text-green-800">{sp.msg}</p>}
      <nav className="flex flex-wrap gap-2">
        {STATUSES.map(([k, l]) => (
          <Link key={k} href={`/admin/backlinks?status=${k}`} className={`px-3 py-1.5 rounded-full text-sm font-semibold border ${k === status ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-700 border-slate-200'}`}>{l} ({counts.get(k) ?? 0})</Link>
        ))}
      </nav>

      {status === 'ready' && list.length > 0 && (
        <form action={approveAction} className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <PendingButton className="rounded-lg bg-[#E8003D] px-4 py-2 text-sm font-extrabold text-white">Approve ticked</PendingButton>
            <button name="all" value="1" className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-900">Approve all {counts.get('ready')}</button>
          </div>
          {list.map(r => {
            const d = draftFor(r)
            return (
              <details key={r.id} className="rounded-xl border border-slate-200 bg-white p-4">
                <summary className="flex flex-wrap items-center gap-3 cursor-pointer">
                  <input type="checkbox" name="id" value={r.id} className="h-4 w-4" />
                  <span className="text-xs font-bold uppercase text-slate-400">{r.kind}</span>
                  <span className="font-bold text-slate-900">{r.name}</span>
                  <span className="text-sm text-slate-500">{r.city ?? ''}{r.shows ? ` · ${r.shows} shows` : ''} · {r.email}</span>
                  {r.website && <a href={r.website} target="_blank" rel="noopener" className="text-sm underline text-slate-500">{r.domain ?? 'site'}</a>}
                </summary>
                <p className="mt-3 text-sm font-bold text-slate-900">Subject: {d.subject}</p>
                <pre className="mt-2 whitespace-pre-wrap text-sm text-slate-700 font-sans bg-slate-50 rounded-lg p-3">{d.text}</pre>
              </details>
            )
          })}
        </form>
      )}

      {status !== 'ready' && (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-500"><tr><th className="p-3">Who</th><th className="p-3">Contact</th><th className="p-3">Dates</th><th className="p-3">Mark as</th></tr></thead>
            <tbody>
              {list.map(r => (
                <tr key={r.id} className="border-t border-slate-100 align-top">
                  <td className="p-3"><p className="font-bold text-slate-900">{r.name}</p><p className="text-xs text-slate-500">{r.kind}{r.city ? ` · ${r.city}` : ''}{r.shows ? ` · ${r.shows} shows` : ''}</p>{r.notes && <p className="text-xs text-slate-400">{r.notes}</p>}{r.last_error && <p className="text-xs text-red-600">{r.last_error}</p>}</td>
                  <td className="p-3">{r.email ?? <span className="text-slate-400">no email</span>}<br />{r.website && <a href={r.website} target="_blank" rel="noopener" className="text-xs underline text-slate-500">{r.domain}</a>}{r.link_url && <><br /><a href={r.link_url} target="_blank" rel="noopener" className="text-xs underline text-green-700">their link</a></>}</td>
                  <td className="p-3 text-xs text-slate-500">{r.sent_at ? `Sent ${day(r.sent_at)}` : r.approved_at ? `Approved ${day(r.approved_at)}` : `Found ${day(r.created_at)}`}{r.followed_up_at ? `, followed up ${day(r.followed_up_at)}` : ''}{r.linked_at ? `, linked ${day(r.linked_at)}` : ''}</td>
                  <td className="p-3">
                    {status === 'no_email' ? (
                      <form action={addLinkContactAction} className="flex gap-2"><input type="hidden" name="id" value={r.id} /><input name="email" placeholder="email you found" className={input} /><PendingButton className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-bold text-white">Add</PendingButton></form>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {(['replied', 'linked', 'declined', 'skipped'] as const).filter(s => s !== status).map(s => (
                          <form key={s} action={setLinkStatusAction}><input type="hidden" name="id" value={r.id} /><input type="hidden" name="status" value={s} /><input type="hidden" name="from" value={status} /><button className="rounded-md border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-700">{s === 'linked' ? 'Linking' : s === 'declined' ? 'Not interested' : s[0].toUpperCase() + s.slice(1)}</button></form>
                        ))}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {!list.length && <tr><td colSpan={4} className="p-6 text-center text-slate-500">Nothing here.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      <details className="rounded-xl border border-slate-200 bg-white p-4">
        <summary className="cursor-pointer font-bold text-slate-900">Add a contact by hand (press, or a venue we missed)</summary>
        <form action={addLinkContactAction} className="mt-3 grid sm:grid-cols-2 gap-2">
          <select name="kind" className={input}><option value="press">Press / blog</option><option value="venue">Venue</option><option value="organiser">Organiser</option></select>
          <input name="name" required placeholder="Name (e.g. Leeds Live)" className={input} />
          <input name="email" required placeholder="Email" className={input} />
          <input name="contact_name" placeholder="Contact name (optional)" className={input} />
          <input name="city" placeholder="City" className={input} />
          <input name="website" placeholder="Website" className={input} />
          <input name="subject" placeholder="Subject (press only)" className={`${input} sm:col-span-2`} />
          <textarea name="body" rows={6} placeholder="Email text (press only; starts with Hi …, sign-off and unsubscribe are added)" className={`${input} sm:col-span-2`} />
          <PendingButton className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-bold text-white sm:col-span-2">Add as ready to approve</PendingButton>
        </form>
      </details>
    </div>
  )
}
