import { requireAdmin } from '@/lib/admin-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { blockAction, unblockAction } from './actions'

export const dynamic = 'force-dynamic'
type Loose = any // eslint-disable-line @typescript-eslint/no-explicit-any

export default async function UnsubscribesPage({ searchParams }: { searchParams: Promise<{ msg?: string }> }) {
  await requireAdmin()
  const { msg } = await searchParams
  const { data } = await (createAdminClient() as Loose).from('email_blocklist').select('email, reason, created_at').order('created_at', { ascending: false }).limit(200)
  const rows = (data ?? []) as { email: string; reason: string | null; created_at: string }[]
  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold text-slate-900">Unsubscribes</h1>
        <p className="text-sm text-slate-600">Someone emails to say &quot;unsubscribe&quot; or &quot;stop emailing me&quot;? Paste their address here. It comes off every list straight away (newsletter, advertiser, backlink and organiser outreach) and the finders can never add it again.</p>
      </div>
      {msg && <p className="rounded-xl bg-green-50 border border-green-200 px-4 py-3 text-sm font-semibold text-green-800">{msg}</p>}
      <form action={blockAction} className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
        <textarea name="emails" required rows={3} placeholder="Paste one or more email addresses (or the whole email, we'll pick the addresses out)" className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" />
        <div className="flex flex-wrap gap-2">
          <input name="reason" placeholder="Note (optional), e.g. replied unsubscribe" className="flex-1 min-w-[200px] min-h-[40px] px-3 rounded-xl border border-slate-300 text-sm" />
          <button className="min-h-[40px] px-5 rounded-xl text-sm font-bold text-white" style={{ backgroundColor: '#E8003D' }}>Unsubscribe from everything</button>
        </div>
      </form>
      <section className="space-y-2">
        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500">Blocked ({rows.length})</h2>
        <ul className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
          {rows.map(r => (
            <li key={r.email} className="flex items-center gap-3 px-4 py-2.5 text-sm">
              <span className="font-semibold text-slate-900 flex-1 break-all">{r.email}</span>
              <span className="text-xs text-slate-500">{r.reason ?? ''} {new Date(r.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>
              <form action={unblockAction}><input type="hidden" name="email" value={r.email} /><button className="text-xs font-semibold text-slate-500 underline">Undo</button></form>
            </li>
          ))}
          {rows.length === 0 && <li className="px-4 py-3 text-sm text-slate-500">Nobody blocked yet.</li>}
        </ul>
      </section>
    </div>
  )
}
