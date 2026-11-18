import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { organiserFrom, loadManage, ticketButtonHtml } from '@/lib/organiserDashboard'
import { organiserQuery } from '@/lib/organiserAccess'
import { gbpFromPence, bookingFeePence } from '@/lib/tickets'
import { MAX_TICKET_TYPES } from '@/lib/ticketPlan'
import { updateTypeAction, addTypeAction, addCodeAction, toggleCodeAction, messageHoldersAction } from '../../actions'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Manage your event', robots: { index: false, follow: false }, referrer: 'no-referrer' }

const card = 'rounded-3xl border border-slate-200 bg-white p-5 sm:p-7 shadow-sm'
const input = 'w-full min-h-[44px] px-3 rounded-xl border border-slate-300 text-base bg-white'
const small = 'block text-xs font-bold text-slate-700 mb-1'
const btn = 'min-h-[44px] rounded-xl bg-slate-950 px-4 text-sm font-extrabold text-white'
const dateOnly = (iso: string | null) => iso ? new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date(iso)) : ''
const when = (iso: string) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(iso))

function Hidden({ a, sub }: { a: { o: string; e: string; k: string }; sub: string }) {
  return (<><input type="hidden" name="o" value={a.o} /><input type="hidden" name="e" value={a.e} /><input type="hidden" name="k" value={a.k} /><input type="hidden" name="sub" value={sub} /></>)
}

export default async function ManageEventPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ o?: string; e?: string; k?: string; msg?: string; err?: string }> }) {
  const { id } = await params
  const sp = await searchParams
  const organiserId = organiserFrom(sp)
  if (!organiserId) redirect('/organiser?expired=1')
  const access = { o: sp.o!, e: sp.e!, k: sp.k! }
  const q = organiserQuery(access)
  const m = await loadManage(organiserId, id)
  if (!m || !m.sub.event_id) redirect(`/organiser?${q}`)
  const { sub, types, codes, messages, holders } = m
  const paid = !!sub.paid_price_pence
  const slug: string | null = sub.events?.slug ?? null
  const sold = types.reduce((n, t) => n + t.sold, 0)
  const capacity = types.reduce((n, t) => n + t.capacity, 0)

  return (
    <main className="min-h-screen bg-[#F5F5F0] px-4 py-10">
      <div className="mx-auto max-w-3xl space-y-6">
        <Link href={`/organiser?${q}`} className="text-sm font-semibold underline text-slate-600">← All your events</Link>
        <div>
          <h1 className="text-3xl font-black text-slate-950">{sub.title}</h1>
          <p className="text-slate-600">{when(sub.events?.start_date ?? sub.start_date)}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {slug && <Link href={`/events/${slug}`} className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-900">View event page</Link>}
            {types.length > 0 && <Link href={`/tickets/door?s=${sub.id}&t=${sub.manage_token}`} className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-900">Door scanner</Link>}
            {types.length > 0 && <a href={`/api/tickets/attendees?s=${sub.id}&t=${sub.manage_token}`} className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-900">Download guest list</a>}
          </div>
        </div>
        {sp.msg && <p role="status" className="rounded-xl bg-green-50 border border-green-200 px-4 py-3 text-sm font-semibold text-green-800">{sp.msg}</p>}
        {sp.err && <p role="alert" className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm font-semibold text-red-700">{sp.err}</p>}

        {types.length > 0 && (
          <section className={card}>
            <h2 className="text-lg font-extrabold text-slate-900">Tickets</h2>
            <p className="text-sm text-slate-600">{sold} of {capacity} {paid ? 'sold' : 'taken'}. {paid ? 'You keep 100% of each ticket price; buyers pay the booking fee on top.' : ''}</p>
            <div className="mt-4 space-y-3">
              {types.map(t => (
                <form key={t.id} action={updateTypeAction} className="rounded-2xl border border-slate-200 bg-slate-50/60 p-3 space-y-2">
                  <Hidden a={access} sub={sub.id} /><input type="hidden" name="type" value={t.id} /><input type="hidden" name="pause_field" value="1" />
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-extrabold text-slate-900">{t.name} <span className="font-semibold text-slate-500">· {t.sold} of {t.capacity} {paid ? 'sold' : 'taken'}{!t.active ? ' · paused' : ''}</span></p>
                    {t.price_pence > 0 && <p className="text-xs text-slate-500">Buyer pays {gbpFromPence(t.price_pence + bookingFeePence(t.price_pence))}</p>}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                    <div className="sm:col-span-2"><label className={small}>Name</label><input name="name" defaultValue={t.name} required maxLength={60} className={input} /></div>
                    {t.price_pence > 0 && <div><label className={small}>Price (£){t.sold > 0 ? ' · fixed once sold' : ''}</label><input name="price" defaultValue={(t.price_pence / 100).toFixed(2)} readOnly={t.sold > 0} inputMode="decimal" className={`${input} ${t.sold > 0 ? 'bg-slate-100 text-slate-500' : ''}`} /></div>}
                    <div><label className={small}>How many</label><input name="capacity" type="number" min={Math.max(1, t.sold)} max={10000} defaultValue={t.capacity} required className={input} /></div>
                  </div>
                  <div className="flex flex-wrap items-end gap-3">
                    <div><label className={small}>On sale until (optional)</label><input name="sales_end" type="date" defaultValue={dateOnly(t.sales_end)} className={input} /></div>
                    <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 min-h-[44px]"><input type="checkbox" name="pause" value="yes" defaultChecked={!t.active} /> Pause sales</label>
                    <button className={btn}>Save</button>
                  </div>
                </form>
              ))}
            </div>
            {types.length < MAX_TICKET_TYPES && (
              <details className="mt-4">
                <summary className="cursor-pointer text-sm font-bold underline text-slate-800">+ Add a ticket type</summary>
                <form action={addTypeAction} className="mt-3 rounded-2xl border border-slate-200 p-3 space-y-2">
                  <Hidden a={access} sub={sub.id} />
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                    <div className="sm:col-span-2"><label className={small}>Name</label><input name="name" required maxLength={60} placeholder={paid ? 'e.g. VIP' : 'e.g. Child'} className={input} /></div>
                    {paid && <div><label className={small}>Price (£)</label><input name="price" required inputMode="decimal" placeholder="15.00" className={input} /></div>}
                    <div><label className={small}>How many</label><input name="capacity" type="number" min={1} max={10000} required placeholder="50" className={input} /></div>
                  </div>
                  <div className="flex flex-wrap items-end gap-3">
                    <div><label className={small}>On sale until (optional)</label><input name="sales_end" type="date" className={input} /></div>
                    <button className={btn}>Add ticket</button>
                  </div>
                </form>
              </details>
            )}
          </section>
        )}

        {paid && (
          <section className={card}>
            <h2 className="text-lg font-extrabold text-slate-900">Discount codes</h2>
            <p className="text-sm text-slate-600">Buyers type the code before they pay. A ticket never goes below £1.</p>
            {codes.length > 0 && (
              <ul className="mt-3 divide-y divide-slate-100">
                {codes.map(c => (
                  <li key={c.id} className="py-3 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-extrabold text-slate-900 tracking-wide">{c.code} <span className="font-semibold text-slate-500">· {c.percent_off ? `${c.percent_off}% off` : `${gbpFromPence(c.amount_off_pence ?? 0)} off`}</span></p>
                      <p className="text-xs text-slate-500">{c.used} used{c.max_uses ? ` of ${c.max_uses}` : ''}{c.expires_at ? ` · ends ${dateOnly(c.expires_at)}` : ''}{!c.active ? ' · switched off' : ''}</p>
                    </div>
                    <form action={toggleCodeAction}><Hidden a={access} sub={sub.id} /><input type="hidden" name="code_id" value={c.id} /><button className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-bold text-slate-900">{c.active ? 'Switch off' : 'Switch on'}</button></form>
                  </li>
                ))}
              </ul>
            )}
            <form action={addCodeAction} className="mt-4 rounded-2xl border border-slate-200 p-3 space-y-2">
              <Hidden a={access} sub={sub.id} />
              <p className="text-sm font-extrabold text-slate-900">New code</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div><label className={small}>Code</label><input name="code" required maxLength={20} placeholder="FRIENDS20" className={`${input} uppercase`} /></div>
                <div><label className={small}>Discount</label><select name="kind" className={input}><option value="percent">% off</option><option value="amount">£ off</option></select></div>
                <div><label className={small}>Amount</label><input name="amount" required inputMode="decimal" placeholder="20" className={input} /></div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 items-end">
                <div><label className={small}>How many tickets (optional)</label><input name="max_uses" type="number" min={1} max={10000} placeholder="No limit" className={input} /></div>
                <div><label className={small}>Ends (optional)</label><input name="expires" type="date" className={input} /></div>
                <button className={btn}>Add code</button>
              </div>
            </form>
          </section>
        )}

        {types.length > 0 && (
          <section className={card}>
            <h2 className="text-lg font-extrabold text-slate-900">Email your ticket holders</h2>
            <p className="text-sm text-slate-600">{holders ? `Goes to ${holders} ${holders === 1 ? 'person' : 'people'} with tickets, each with a link to their own tickets. Replies come to your email.` : 'Nobody has a ticket yet.'} Use it for changes to times, what to bring or reminders. Up to 3 a day.</p>
            {holders > 0 && (
              <form action={messageHoldersAction} className="mt-3 space-y-2">
                <Hidden a={access} sub={sub.id} />
                <div><label className={small}>Subject</label><input name="subject" required maxLength={120} placeholder="Doors now open at 7pm" className={input} /></div>
                <div><label className={small}>Message</label><textarea name="body" required maxLength={3000} rows={5} className={`${input} py-2`} placeholder="Hi everyone, a quick update about the night…" /></div>
                <button className={btn}>Send to {holders} {holders === 1 ? 'person' : 'people'}</button>
              </form>
            )}
            {messages.length > 0 && (
              <ul className="mt-4 text-sm text-slate-600 space-y-1">
                {messages.map(x => <li key={x.created_at}>{when(x.created_at)}: “{x.subject}” to {x.recipients}</li>)}
              </ul>
            )}
          </section>
        )}

        {slug && (
          <section className={card}>
            <h2 className="text-lg font-extrabold text-slate-900">Add a ticket button to your website</h2>
            <p className="text-sm text-slate-600">Paste this into your website, or use the link on social media. It goes straight to your tickets.</p>
            <div className="mt-3 flex flex-wrap items-center gap-4">
              <a href={`/events/${slug}#tickets`} style={{ display: 'inline-block', background: '#E8003D', color: '#fff', font: '700 16px/1 Arial,sans-serif', padding: '14px 24px', borderRadius: 999, textDecoration: 'none' }}>Buy tickets</a>
              <span className="text-xs text-slate-500">← how it looks</span>
            </div>
            <label className={`${small} mt-4`}>Button code (HTML)</label>
            <textarea readOnly rows={4} className={`${input} py-2 font-mono text-xs`} defaultValue={ticketButtonHtml(slug, sub.title)} />
            <label className={`${small} mt-3`}>Link</label>
            <input readOnly className={`${input} font-mono text-xs`} defaultValue={`https://www.theshowfinder.com/events/${slug}#tickets`} />
          </section>
        )}
      </div>
    </main>
  )
}
