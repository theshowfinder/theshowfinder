export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { requireAdmin } from '@/lib/admin-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { deleteLocalBusinessAction, setLocalBusinessPackageAction, setLocalBusinessStatusAction, updateLocalBusinessOfferAction } from '../actions'
import type { LocalBusiness } from '@/lib/types/database'

export default async function LocalBusinessesAdminPage() {
  await requireAdmin()
  const db = createAdminClient()

  const { data: businesses } = await db
    .from('local_businesses')
    .select('*')
    .order('city', { ascending: true })
    .order('display_order', { ascending: true }) as unknown as { data: LocalBusiness[] | null }
  const { data: accounts } = await db.from('local_business_accounts').select('business_id, contact_name, contact_email, phone, billing, redeem_pin') as unknown as
    { data: Array<{ business_id: string; contact_name: string | null; contact_email: string; phone: string | null; billing: string | null; redeem_pin: string | null }> | null }
  // This month's vouchers per business (claimed / used), so the numbers are visible before the monthly report goes out.
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()
  const { data: vouchers } = await (db as unknown as { from: (t: string) => { select: (c: string) => { gte: (c: string, v: string) => Promise<{ data: { business_id: string; redeemed_at: string | null }[] | null }> } } })
    .from('business_vouchers').select('business_id, redeemed_at').gte('created_at', monthStart)
  const voucherCount = new Map<string, { claimed: number; used: number }>()
  for (const v of vouchers ?? []) {
    const c = voucherCount.get(v.business_id) ?? { claimed: 0, used: 0 }
    c.claimed++; if (v.redeemed_at) c.used++
    voucherCount.set(v.business_id, c)
  }
  const accountFor = new Map((accounts ?? []).map(a => [a.business_id, a]))
  const STATUS_STYLE: Record<string, string> = { pending: 'bg-amber-100 text-amber-800', active: 'bg-green-100 text-green-800', paused: 'bg-slate-100 text-slate-600', cancelled: 'bg-red-50 text-red-700' }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/admin" className="text-slate-400 hover:text-slate-600 text-sm">← Admin</Link>
          <h1 className="text-xl font-extrabold text-slate-900">Local Businesses</h1>
        </div>
        <Link
          href="/admin/local-businesses/new"
          className="inline-block font-bold text-white px-5 py-2.5 rounded-xl hover:opacity-90 transition-opacity text-sm"
          style={{ backgroundColor: '#E8003D' }}
        >
          + Add Business
        </Link>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-10">
        <p className="text-sm text-slate-500 mb-6">
          Only <b>Live</b> listings show on the site. Standard = the city page&apos;s local guide. Featured = top of the guide plus the &ldquo;Before the show&rdquo; box on every show page in that city. Paid sign-ups from /advertise arrive on <a href="/admin/advertiser-applications" className="text-rose-600 hover:underline">Advertiser applications</a>; approving one adds it here as Live.
        </p>

        {(!businesses || businesses.length === 0) ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
            <p className="text-slate-400 text-4xl mb-3">🏪</p>
            <p className="text-slate-500 mb-4">No local businesses yet.</p>
            <Link href="/admin/local-businesses/new" className="text-blue-600 font-semibold hover:underline">
              Add the first one →
            </Link>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50 text-left">
                  <th className="px-4 py-3 font-semibold text-slate-600">Business</th>
                  <th className="px-4 py-3 font-semibold text-slate-600">City</th>
                  <th className="px-4 py-3 font-semibold text-slate-600">Category</th>
                  <th className="px-4 py-3 font-semibold text-slate-600">Package / status</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {businesses.map(row => ({ ...row, status: row.status ?? 'active', package: row.package ?? (row.is_sponsored ? 'featured' : 'standard') })).map(biz => (
                  <tr key={biz.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <p className="font-bold text-slate-900">{biz.name}</p>
                      {biz.website_url && <p className="text-slate-400 text-xs truncate max-w-xs">{biz.website_url}</p>}
                      {biz.offer_text && <p className="text-amber-800 text-xs mt-1 font-semibold">🎟️ {biz.offer_text}{voucherCount.get(biz.id) ? ` · this month ${voucherCount.get(biz.id)!.claimed} claimed, ${voucherCount.get(biz.id)!.used} used` : ''}</p>}
                      <details className="mt-1 text-xs">
                        <summary className="cursor-pointer text-blue-700 font-semibold">Offer, booking link, postcode{accountFor.get(biz.id)?.redeem_pin ? ` · staff PIN ${accountFor.get(biz.id)?.redeem_pin}` : ''}</summary>
                        <form action={updateLocalBusinessOfferAction.bind(null, biz.id, biz.city)} className="mt-2 space-y-2 max-w-sm">
                          <input name="offer_text" defaultValue={biz.offer_text ?? ''} maxLength={90} placeholder="Offer, e.g. 10% off food with your show ticket" className="w-full rounded border border-slate-300 px-2 py-1.5" />
                          <input name="booking_url" defaultValue={biz.booking_url ?? ''} placeholder="Booking link (optional)" className="w-full rounded border border-slate-300 px-2 py-1.5" />
                          <input name="postcode" defaultValue={biz.postcode ?? ''} placeholder="Postcode (for walking distance)" className="w-full rounded border border-slate-300 px-2 py-1.5" />
                          <p className="text-slate-400">{biz.lat != null ? 'Location found from postcode.' : 'No location yet: add a postcode to show walking distance.'} A staff PIN is created automatically if there isn&apos;t one.</p>
                          <button className="rounded bg-slate-900 px-3 py-1.5 font-bold text-white">Save</button>
                        </form>
                      </details>
                      {accountFor.get(biz.id) && <p className="text-slate-500 text-xs mt-1">{accountFor.get(biz.id)?.contact_name} · {accountFor.get(biz.id)?.contact_email}{accountFor.get(biz.id)?.phone ? ` · ${accountFor.get(biz.id)?.phone}` : ''}{accountFor.get(biz.id)?.billing ? ` · pays ${accountFor.get(biz.id)?.billing}` : ''}</p>}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{biz.city}</td>
                    <td className="px-4 py-3 text-slate-600 capitalize">{biz.category}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1.5">
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${STATUS_STYLE[biz.status] ?? ''}`}>{biz.status === 'active' ? 'Live' : biz.status[0].toUpperCase() + biz.status.slice(1)}</span>
                        <span className="text-xs font-bold px-2 py-0.5 rounded-full text-white" style={{ backgroundColor: biz.package === 'featured' ? '#E8003D' : '#64748b' }}>{biz.package === 'featured' ? 'Featured' : 'Standard'}</span>
                        {biz.is_lusso_client && (
                          <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">Lusso</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right space-y-1 whitespace-nowrap">
                      {biz.status !== 'active' && <form action={setLocalBusinessStatusAction.bind(null, biz.id, biz.city, 'active')}><button className="text-green-700 font-bold hover:underline text-xs">Set live</button></form>}
                      {biz.status === 'active' && <form action={setLocalBusinessStatusAction.bind(null, biz.id, biz.city, 'paused')}><button className="text-slate-600 font-semibold hover:underline text-xs">Pause</button></form>}
                      {biz.status !== 'cancelled' && <form action={setLocalBusinessStatusAction.bind(null, biz.id, biz.city, 'cancelled')}><button className="text-slate-600 font-semibold hover:underline text-xs">Cancel</button></form>}
                      <form action={setLocalBusinessPackageAction.bind(null, biz.id, biz.city, biz.package === 'featured' ? 'standard' : 'featured')}><button className="text-blue-700 font-semibold hover:underline text-xs">{biz.package === 'featured' ? 'Make standard' : 'Make featured'}</button></form>
                      <form action={deleteLocalBusinessAction.bind(null, biz.id, biz.city)}>
                        <button type="submit" className="text-red-600 font-semibold hover:underline text-xs">
                          Delete
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  )
}
