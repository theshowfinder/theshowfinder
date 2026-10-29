export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { requireAdmin } from '@/lib/admin-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { approveApplicationAction, rejectApplicationAction } from './actions'

type Application = {
  id: string
  city: string
  package: 'featured' | 'standard'
  business_name: string
  category: string
  contact_name: string
  email: string
  phone: string | null
  website_url: string | null
  status: string
  payment_status: string
  billing: 'monthly' | 'yearly' | null
  logo_path: string | null
  asset_paths: string[]
  created_at: string
  business_id: string | null
}

export default async function AdvertiserApplicationsPage() {
  await requireAdmin()
  const db = createAdminClient()
  const { data } = await db.from('advertiser_applications').select('id,city,package,business_name,category,contact_name,email,phone,website_url,status,payment_status,billing,logo_path,asset_paths,created_at,business_id').order('created_at', { ascending: false }) as unknown as { data: Application[] | null }
  const applications = data ?? []

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4">
        <div className="flex items-center gap-4"><Link href="/admin" className="text-sm text-slate-400 hover:text-slate-600">← Admin</Link><h1 className="text-xl font-extrabold text-slate-900">Advertiser applications</h1></div>
        <Link href="/advertise" className="text-sm font-bold text-rose-600 hover:underline">View sales page →</Link>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <p className="mb-6 text-sm text-slate-500">Check each paid application, then press <b>Approve &amp; publish</b>: the business goes live on its city page straight away (Featured also appears in the &ldquo;Before the show&rdquo; box on show pages in that city within a few hours). Pause, cancel or change package afterwards on <a href="/admin/local-businesses" className="text-rose-600 hover:underline">Local businesses</a>. A cancelled Stripe subscription takes the listing down automatically.</p>
        {applications.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center text-slate-500">No applications yet.</div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-100 bg-slate-50 text-slate-600"><tr><th className="px-4 py-3">Business</th><th className="px-4 py-3">City</th><th className="px-4 py-3">Package</th><th className="px-4 py-3">Contact</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Assets</th><th className="px-4 py-3">Action</th></tr></thead>
              <tbody>{applications.map(application => (
                <tr key={application.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-4"><p className="font-bold text-slate-900">{application.business_name}</p><p className="text-xs text-slate-500">{application.category}</p>{application.website_url && <a href={application.website_url} className="text-xs text-rose-600 hover:underline">{application.website_url}</a>}</td>
                  <td className="px-4 py-4 text-slate-700">{application.city}</td>
                  <td className="px-4 py-4"><span className={`rounded-full px-2 py-1 text-xs font-bold ${application.package === 'featured' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-700'}`}>{application.package}</span><p className="mt-1 text-xs text-slate-500">{application.billing ?? '—'} · Payment: {application.payment_status}</p></td>
                  <td className="px-4 py-4"><p className="font-semibold text-slate-800">{application.contact_name}</p><a href={`mailto:${application.email}`} className="text-xs text-rose-600 hover:underline">{application.email}</a>{application.phone && <p className="text-xs text-slate-500">{application.phone}</p>}</td>
                  <td className="px-4 py-4"><span className="rounded-full bg-blue-100 px-2 py-1 text-xs font-bold text-blue-700">{application.status}</span><p className="mt-1 text-xs text-slate-400">{new Date(application.created_at).toLocaleDateString('en-GB')}</p></td>
                  <td className="px-4 py-4 text-xs text-slate-600">{application.logo_path ? 'Logo' : 'No logo'}{application.asset_paths?.length ? ` + ${application.asset_paths.length} files` : ''}</td>
                  <td className="px-4 py-4 text-xs">
                    {application.business_id ? (
                      <Link href="/admin/local-businesses" className="font-bold text-green-700 hover:underline">Published · manage →</Link>
                    ) : application.status === 'rejected' ? (
                      <span className="text-slate-400">Rejected</span>
                    ) : (
                      <div className="flex flex-col gap-2">
                        <form action={approveApplicationAction.bind(null, application.id)}>
                          <button className={`rounded-lg px-3 py-2 font-bold text-white ${application.payment_status === 'paid' ? 'bg-green-600 hover:bg-green-700' : 'bg-slate-400 hover:bg-slate-500'}`}>
                            {application.payment_status === 'paid' ? 'Approve & publish' : 'Publish (not paid)'}
                          </button>
                        </form>
                        <form action={rejectApplicationAction.bind(null, application.id)}>
                          <button className="text-slate-500 hover:text-red-600 hover:underline">Reject{application.payment_status === 'paid' ? ' (refund in Stripe)' : ''}</button>
                        </form>
                      </div>
                    )}
                  </td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  )
}
