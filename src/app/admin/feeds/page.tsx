export const dynamic = 'force-dynamic'
export const maxDuration = 60

import Link from 'next/link'
import { requireAdmin } from '@/lib/admin-auth'
import { loadImportCards } from '@/lib/importCheck'
import { loadPlatformTiles } from '@/lib/platformStats'
import { COMBOS, loadAffiliateAudit, loadFeedProgress, loadLinkSamples, loadOverlap, providerStatuses } from '@/lib/feedsOverview'
import ImportCheck from '../health/ImportCheck'
import PlatformTiles from '../health/PlatformTiles'
import MorningCleanup from '../health/MorningCleanup'

const fmt = (n: number | null | undefined) => (n === null || n === undefined ? '?' : n.toLocaleString('en-GB'))
const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 1000) / 10}%` : '0%')

function Chip({ on, label }: { on: boolean; label: string }) {
  return <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded ${on ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-400'}`}>{label}</span>
}

export default async function FeedsPage() {
  await requireAdmin()
  const [importCards, tiles, overlap, progress, audit, samples] = await Promise.all([
    loadImportCards(), loadPlatformTiles(), loadOverlap(), loadFeedProgress(), loadAffiliateAudit(), loadLinkSamples(),
  ])
  const providers = providerStatuses()
  const total = overlap?.total ?? 0
  const matchedAll = overlap ? overlap.all3 : 0
  const matchedTwo = overlap ? overlap.tm_gb + overlap.tm_st + overlap.gb_st : 0
  const matchedOne = overlap ? overlap.tm_only + overlap.gb_only + overlap.st_only : 0
  const none = overlap?.none ?? 0
  const section = 'text-lg font-extrabold text-slate-900 mb-1'
  const sub = 'text-sm text-slate-500 mb-3'

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
        <h1 className="text-xl font-extrabold text-slate-900">Feeds &amp; matching</h1>
        <div className="flex gap-4 text-sm">
          <Link href="/admin/health" className="text-slate-500 hover:text-slate-700">Site health</Link>
          <Link href="/admin" className="text-slate-500 hover:text-slate-700">← Admin</Link>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8 space-y-10">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-700">
          <p className="font-extrabold text-slate-900 mb-1">How this works, top to bottom</p>
          <ol className="list-decimal pl-5 space-y-0.5">
            <li><b>Run the feeds</b> (or let them run overnight) and check each one worked.</li>
            <li><b>See how many shows each feed holds</b> and how far matching has got.</li>
            <li><b>See how well our events are matched</b>: on all 3 feeds, on 2, on 1.</li>
            <li><b>Work through the ones that did not match</b>: link each to an event we already have, or create its page.</li>
            <li><b>Check every button carries our affiliate tracking.</b></li>
          </ol>
        </section>

        <section>
          <h2 className={section}>1. Run the feeds</h2>
          <p className={sub}>Each card runs that feed now and shows what the run did. They also run by themselves every day; this proves they did.</p>
          <ImportCheck cards={importCards} />
          <div className="mt-4"><MorningCleanup /></div>
        </section>

        <section>
          <h2 className={section}>2. How many shows each feed holds, and how far matching has got</h2>
          <p className={sub}>“Waiting” means the matcher has not looked at it yet. “Checked: no match” means it looked and nothing on the site resembles it. Click a number to open exactly those shows.</p>
          <div className="bg-white border border-slate-200 rounded-2xl overflow-x-auto mb-4">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wider text-slate-500 border-b border-slate-100">
                <tr><th className="p-3">Feed</th><th className="p-3 text-right">Shows in feed</th><th className="p-3 text-right">Linked to a site event</th><th className="p-3 text-right">Waiting to be checked</th><th className="p-3 text-right">Checked: no match</th><th className="p-3 text-right">Need a human look</th><th className="p-3 text-right">Hidden by you</th></tr>
              </thead>
              <tbody>
                {progress.map(p => {
                  const l = (status: string, v: number | null) => <Link href={`/admin/unmatched?platform=${p.platform}&status=${status}`} className="font-extrabold tabular-nums underline decoration-dotted">{fmt(v)}</Link>
                  return (
                    <tr key={p.platform} className="border-b border-slate-50">
                      <td className="p-3 font-bold text-slate-900">{p.label}</td>
                      <td className="p-3 text-right tabular-nums font-extrabold"><Link href={`/admin/platforms/${p.platform}`} className="underline decoration-dotted">{fmt(p.total)}</Link></td>
                      <td className="p-3 text-right tabular-nums"><Link href={`/admin/platforms/${p.platform}?view=linked`} className="font-extrabold text-emerald-700 underline decoration-dotted">{fmt(p.linked)}</Link>{p.total ? <span className="text-xs text-slate-400"> {pct(p.linked ?? 0, p.total)}</span> : null}</td>
                      <td className="p-3 text-right">{l('waiting', p.waiting)}</td>
                      <td className="p-3 text-right text-amber-700">{l('no_match', p.noMatch)}</td>
                      <td className="p-3 text-right text-amber-700">{l('review', p.review)}</td>
                      <td className="p-3 text-right text-slate-500">{l('hidden', p.hidden)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <PlatformTiles tiles={tiles} />
        </section>

        <section>
          <h2 className={section}>3. How well our events are matched</h2>
          <p className={sub}>Every live, upcoming event on the site, grouped by which feeds have a buy button on it. Click a number to see those events.</p>
          {overlap ? (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                {[
                  { label: 'On all 3 feeds', v: matchedAll, tone: 'text-emerald-700' },
                  { label: 'On 2 feeds', v: matchedTwo, tone: 'text-blue-700' },
                  { label: 'On 1 feed only', v: matchedOne, tone: 'text-amber-700' },
                  { label: 'On no feed', v: none, tone: 'text-slate-600' },
                ].map(t => (
                  <div key={t.label} className="bg-white border border-slate-200 rounded-2xl p-4">
                    <p className={`text-3xl font-extrabold tabular-nums ${t.tone}`}>{fmt(t.v)}</p>
                    <p className="text-sm text-slate-600">{t.label}</p>
                    <p className="text-xs text-slate-400">{pct(t.v, total)} of {fmt(total)} events</p>
                  </div>
                ))}
              </div>
              <div className="bg-white border border-slate-200 rounded-2xl overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs uppercase tracking-wider text-slate-500 border-b border-slate-100"><tr><th className="p-3">Combination</th><th className="p-3">Buttons</th><th className="p-3">Share</th><th className="p-3 text-right">Events</th></tr></thead>
                  <tbody>
                    {COMBOS.map(c => {
                      const v = overlap[c.key] ?? 0
                      return (
                        <tr key={c.key} className="border-b border-slate-50 align-middle">
                          <td className="p-3"><p className="font-semibold text-slate-900">{c.label}</p><p className="text-xs text-slate-400">{c.hint}</p></td>
                          <td className="p-3 whitespace-nowrap space-x-1"><Chip on={c.tm} label="TM" /><Chip on={c.gb} label="Gigsberg" /><Chip on={c.st} label="See Tickets" /></td>
                          <td className="p-3 w-48"><div className="h-2 rounded bg-slate-100"><div className="h-2 rounded bg-blue-600" style={{ width: `${total ? Math.max(v ? 1 : 0, (v / total) * 100) : 0}%` }} /></div><span className="text-xs text-slate-400">{pct(v, total)}</span></td>
                          <td className="p-3 text-right"><Link href={`/admin/feeds/events?combo=${c.key}`} className="font-extrabold tabular-nums underline decoration-dotted">{fmt(v)}</Link></td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </>
          ) : <p className="text-sm text-red-700">Could not load the overlap numbers.</p>}
        </section>

        <section>
          <h2 className={section}>4. Work through the ones that did not match</h2>
          <p className={sub}>Order of work: <b>need a human look</b> first (the matcher was unsure), then <b>checked: no match</b>. On each row, press <b>Link</b> if it is an event we already have, or <b>Create event page</b> if it is not on the site. The nightly feed import also creates pages for the “checked: no match” ones when it is switched to live.</p>
          <div className="grid md:grid-cols-2 gap-4">
            {progress.map(p => (
              <div key={p.platform} className="bg-white border border-slate-200 rounded-2xl p-4">
                <h3 className="font-extrabold text-slate-900 mb-2">{p.label}</h3>
                <ul className="text-sm divide-y divide-slate-100">
                  <li className="flex justify-between py-1.5"><span>Need a human look</span><Link href={`/admin/unmatched?platform=${p.platform}&status=review`} className="font-extrabold underline text-amber-700">{fmt(p.review)} →</Link></li>
                  <li className="flex justify-between py-1.5"><span>Checked: no match</span><Link href={`/admin/unmatched?platform=${p.platform}&status=no_match`} className="font-extrabold underline text-amber-700">{fmt(p.noMatch)} →</Link></li>
                  <li className="flex justify-between py-1.5"><span>Waiting for the matcher</span><Link href={`/admin/unmatched?platform=${p.platform}&status=waiting`} className="font-extrabold underline">{fmt(p.waiting)} →</Link></li>
                </ul>
              </div>
            ))}
          </div>
          <p className="text-sm mt-3"><Link href="/admin/unmatched?platform=gigsberg&view=soldout" className="font-bold text-amber-800 underline">Sold-out shows that still need a Gigsberg button →</Link></p>
        </section>

        <section>
          <h2 className={section}>5. Are our affiliate links on every button?</h2>
          <p className={sub}>The links below are built by the same code the event pages use, from real events, so what you see is what a visitor gets.</p>
          {samples.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-2xl p-4 mb-4 space-y-3">
              {samples.map(s => (
                <div key={s.provider} className="text-sm">
                  <p className="font-bold text-slate-900">{s.provider} <span className={`ml-2 text-xs font-bold px-1.5 py-0.5 rounded ${s.tracked ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-700'}`}>{s.tracked ? 'TRACKED' : 'NOT TRACKED'}</span> <span className="text-xs font-normal text-slate-400">{s.how}</span></p>
                  <p className="text-xs text-slate-500 break-all">Button goes to: {s.final}</p>
                  <Link href={`/events/${s.slug}`} target="_blank" className="text-xs text-blue-700 underline">Example event →</Link>
                </div>
              ))}
            </div>
          )}
          {audit && (
            <div className="bg-white border border-slate-200 rounded-2xl overflow-x-auto mb-4">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase tracking-wider text-slate-500 border-b border-slate-100"><tr><th className="p-3">Check across every live event</th><th className="p-3 text-right">Count</th></tr></thead>
                <tbody>
                  <tr className="border-b border-slate-50"><td className="p-3">Gigsberg buttons</td><td className="p-3 text-right tabular-nums">{fmt(audit.gb_links)}</td></tr>
                  <tr className="border-b border-slate-50"><td className="p-3">…not on a Gigsberg address, or carrying someone else’s code</td><td className={`p-3 text-right tabular-nums font-bold ${audit.gb_wrong_host + audit.gb_other_aff ? 'text-red-700' : 'text-emerald-700'}`}>{fmt(audit.gb_wrong_host + audit.gb_other_aff)}</td></tr>
                  <tr className="border-b border-slate-50"><td className="p-3">See Tickets buttons</td><td className="p-3 text-right tabular-nums">{fmt(audit.st_links)}</td></tr>
                  <tr className="border-b border-slate-50"><td className="p-3">…not on a See Tickets / Awin address</td><td className={`p-3 text-right tabular-nums font-bold ${audit.st_wrong_host ? 'text-red-700' : 'text-emerald-700'}`}>{fmt(audit.st_wrong_host)}</td></tr>
                  <tr className="border-b border-slate-50"><td className="p-3">Ticketmaster-feed buttons (Impact tracking)</td><td className="p-3 text-right tabular-nums">{fmt(audit.tm_links)}</td></tr>
                  <tr className="border-b border-slate-50"><td className="p-3">…pointing at a different seller than Ticketmaster</td><td className={`p-3 text-right tabular-nums font-bold ${audit.tm_wrong_host ? 'text-amber-700' : 'text-emerald-700'}`}>{fmt(audit.tm_wrong_host)}</td></tr>
                  <tr><td className="p-3">Events with no buy button at all</td><td className={`p-3 text-right tabular-nums font-bold ${audit.no_button_at_all ? 'text-red-700' : 'text-emerald-700'}`}>{fmt(audit.no_button_at_all)}</td></tr>
                </tbody>
              </table>
              {audit.tm_wrong_host > 0 && (
                <div className="border-t border-slate-100 p-3 text-xs text-amber-800 bg-amber-50">
                  <p className="font-bold mb-1">One thing to confirm in Impact</p>
                  <p>Some Ticketmaster-feed events sell through partner sites ({audit.tm_other_hosts.slice(0, 5).map(h => `${h.host} ${h.n.toLocaleString('en-GB')}`).join(', ')}). Those buttons are wrapped in our Impact link, but only Impact can say whether those sellers credit it. Check Impact’s actions report for Universe / TicketWeb clicks.</p>
                </div>
              )}
            </div>
          )}
          <div className="bg-white border border-slate-200 rounded-2xl overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wider text-slate-500 border-b border-slate-100"><tr><th className="p-3">Seller</th><th className="p-3">Affiliate tracking</th><th className="p-3">Notes</th></tr></thead>
              <tbody>
                {providers.map(p => (
                  <tr key={p.provider} className="border-b border-slate-50">
                    <td className="p-3 font-semibold text-slate-900">{p.provider}</td>
                    <td className="p-3"><span className={`text-xs font-bold px-1.5 py-0.5 rounded ${p.tracked ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500'}`}>{p.tracked ? 'on' : 'not set up'}</span></td>
                    <td className="p-3 text-slate-500">{p.note}{p.envVar && !p.tracked ? ` (Vercel setting ${p.envVar})` : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  )
}
