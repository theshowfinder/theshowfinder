export const dynamic = 'force-dynamic'

// One advertiser application in full: everything the business sent, its logo and photos at full size (signed links
// to the private advertiser-assets bucket), payment state, and the same Approve / Reject / Delete actions as the list.
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireAdmin } from '@/lib/admin-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { FOUNDING_OFFER_KEY } from '@/lib/advertisingPackages'
import { approveApplicationAction, deleteRejectedApplicationAction, rejectApplicationAction } from '../actions'

const when = (iso: string | null | undefined) => iso ? new Date(iso).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/London' }) : '—'

export default async function AdvertiserApplicationPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin()
  const { id } = await params
  const db = createAdminClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (db as any).from('advertiser_applications').select('*').eq('id', id).maybeSingle()
  if (!data) notFound()
  const a = data as Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

  const paths: string[] = [a.logo_path, ...(Array.isArray(a.asset_paths) ? a.asset_paths : [])].filter(Boolean)
  const signed = new Map<string, string>()
  if (paths.length) {
    const { data: urls } = await db.storage.from('advertiser-assets').createSignedUrls(paths, 3600)
    for (const u of urls ?? []) if (u.path && u.signedUrl) signed.set(u.path, u.signedUrl)
  }
  const payment = a.payment_status === 'trial' ? 'Free month running (card saved)' : a.payment_status === 'paid' ? 'Paid' : 'Free month (no card needed); pays only if they choose to stay on'

  const rows: [string, React.ReactNode][] = [
    ['Business', a.business_name],
    ['Category', a.category],
    ['City', a.city],
    ['Postcode', a.postcode || '—'],
    ['Website', a.website_url ? <a href={a.website_url} target="_blank" rel="noopener noreferrer" className="text-rose-600 hover:underline">{a.website_url}</a> : '—'],
    ['Booking link', a.booking_url ? <a href={a.booking_url} target="_blank" rel="noopener noreferrer" className="text-rose-600 hover:underline">{a.booking_url}</a> : '—'],
    ['Contact', a.contact_name],
    ['Email', <a key="e" href={`mailto:${a.email}`} className="text-rose-600 hover:underline">{a.email}</a>],
    ['Phone', a.phone ? <a href={`tel:${a.phone}`} className="text-rose-600 hover:underline">{a.phone}</a> : '—'],
    ['Package', `${a.package === 'featured' ? 'Featured' : 'Standard'} · ${a.billing ?? 'monthly'}${a.offer === FOUNDING_OFFER_KEY ? ' · founding offer (first month free)' : ''}`],
    ['Payment', payment],
    ['Free month ends', when(a.trial_ends_at)],
    ['Applied', when(a.created_at)],
    ['Approved', when(a.approved_at)],
    ['Status', a.status],
    ['Admin notes', a.admin_notes || '—'],
  ]

  return (
    <div className="min-h-screen bg-slate-50">
      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        <Link href="/admin/advertiser-applications" className="text-sm font-bold text-rose-600 hover:underline">← All applications</Link>
        <h1 className="mt-3 text-3xl font-extrabold text-slate-900">{a.business_name}</h1>
        <p className="text-slate-500">{a.city} · applied {when(a.created_at)}</p>

        {a.offer_text && (
          <div className="mt-5 rounded-2xl border-2 border-dashed border-amber-400 bg-amber-50 p-5">
            <p className="text-xs font-extrabold uppercase tracking-widest text-amber-700">🎟️ Customer offer they want to give</p>
            <p className="mt-1 text-xl font-extrabold text-amber-950">{a.offer_text}</p>
          </div>
        )}

        <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-2 text-lg font-extrabold text-slate-900">Description</h2>
          <p className="whitespace-pre-line leading-relaxed text-slate-700">{a.description || 'No description given.'}</p>
        </section>

        <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-3 text-lg font-extrabold text-slate-900">Details</h2>
          <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-[160px_1fr]">
            {rows.map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="font-semibold text-slate-500">{k}</dt>
                <dd className="break-words text-slate-900">{v}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-3 text-lg font-extrabold text-slate-900">Logo and photos ({paths.length})</h2>
          {paths.length === 0 ? <p className="text-sm text-slate-500">Nothing uploaded.</p> : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              {paths.map(path => {
                const url = signed.get(path)
                const label = path === a.logo_path ? 'Logo' : 'Photo'
                const isPdf = /\.pdf$/i.test(path)
                return (
                  <a key={path} href={url} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                    {url && !isPdf ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={url} alt={label} className={`w-full ${label === 'Logo' ? 'aspect-square object-contain bg-white p-3' : 'aspect-[4/5] object-cover'}`} />
                    ) : <span className="flex aspect-square items-center justify-center text-sm font-bold text-slate-500">{isPdf ? 'PDF' : 'File'}</span>}
                    <span className="block px-3 py-2 text-xs font-bold text-slate-600">{label} · open full size</span>
                  </a>
                )
              })}
            </div>
          )}
        </section>

        <section className="mt-5 flex flex-wrap items-center gap-3 text-sm">
          {a.business_id ? (
            <>
              <Link href="/admin/local-businesses" className="rounded-lg bg-green-600 px-4 py-2 font-bold text-white hover:bg-green-700">Published · manage listing</Link>
              <Link href={`/partners/${a.business_id}`} className="font-bold text-rose-600 hover:underline">View their page on the site →</Link>
            </>
          ) : a.status === 'rejected' ? (
            <details>
              <summary className="cursor-pointer font-bold text-red-600 hover:underline">Delete this rejected application</summary>
              <form action={deleteRejectedApplicationAction.bind(null, a.id)} className="mt-2">
                <button className="rounded-lg bg-red-600 px-4 py-2 font-bold text-white hover:bg-red-700">Delete permanently</button>
              </form>
            </details>
          ) : (
            <>
              <form action={approveApplicationAction.bind(null, a.id)}>
                <button className={`rounded-lg px-4 py-2 font-bold text-white bg-green-600 hover:bg-green-700`}>{a.payment_status === 'paid' ? 'Approve & publish' : 'Approve & publish (starts free month)'}</button>
              </form>
              <form action={rejectApplicationAction.bind(null, a.id)}>
                <button className="font-bold text-slate-500 hover:text-red-600 hover:underline">Reject</button>
              </form>
            </>
          )}
        </section>
      </main>
    </div>
  )
}
