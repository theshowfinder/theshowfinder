// A local partner's own page (/partners/<id>): everything about the business in one place, reached by clicking its
// card in the city guide or the "Before the show" box. Photos, logo, the full description, the show-goer offer and
// voucher, walking times to the main venues, and tracked Book / Website links (/out/biz, counted for the
// advertiser's monthly report). Only live listings are readable (RLS), so a paused listing is a 404.
export const revalidate = 86400   // a day; approving or editing a listing rebuilds this one page straight away
export const maxDuration = 60
export async function generateStaticParams() {
  return []
}

import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createPublicClient } from '@/lib/supabase/public'
import { categoryLabel, safeWebsite } from '@/lib/localPlacements'
import { distanceLabel } from '@/lib/businessOffers'
import { fetchMainVenues } from '@/lib/mainVenuesQuery'
import { venuesToName } from '@/lib/mainVenues'

const COLUMNS = 'id, city, name, category, description, website_url, logo_url, photo_urls, address, postcode, package, offer_text, booking_url, lat, lng, status'

type Partner = {
  id: string; city: string; name: string; category: string; description: string | null; website_url: string | null
  logo_url: string | null; photo_urls: string[] | null; address: string | null; postcode: string | null; package: string
  offer_text: string | null; booking_url: string | null; lat: number | null; lng: number | null; status: string
}

async function getPartner(id: string): Promise<Partner | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null
  const { data } = await createPublicClient().from('local_businesses').select(COLUMNS).eq('id', id).eq('status', 'active').maybeSingle()
  return (data as Partner | null) ?? null
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  const p = await getPartner(id)
  if (!p) return { title: 'Local partner', robots: { index: false } }
  const title = `${p.name}, ${p.city} | Before the show`
  const description = (p.offer_text ? `${p.offer_text}. ` : '') + (p.description ?? `${categoryLabel(p.category)} in ${p.city}, near the city's main venues.`)
  return {
    title,
    description: description.slice(0, 158),
    alternates: { canonical: `/partners/${p.id}` },
    openGraph: { title, description: description.slice(0, 200), images: p.photo_urls?.[0] ? [p.photo_urls[0]] : p.logo_url ? [p.logo_url] : undefined },
  }
}

export default async function PartnerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const p = await getPartner(id)
  if (!p) notFound()

  const venues = p.lat != null && p.lng != null ? await fetchMainVenues(createPublicClient(), p.city) : []
  const near = venuesToName(p, venues, 5, null, p.city)
  const booking = safeWebsite(p.booking_url)
  const website = safeWebsite(p.website_url)
  const photos = (p.photo_urls ?? []).slice(0, 5)
  const mapQuery = encodeURIComponent([p.name, p.address, p.postcode].filter(Boolean).join(', '))

  return (
    <main className="min-h-screen bg-slate-50 pb-16">
      {/* Banner: their main photo, framed in our brand colours */}
      <div className="relative h-64 bg-gradient-to-br from-slate-950 via-slate-900 to-rose-950 sm:h-96">
        {photos[0] && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photos[0]} alt={p.name} className="absolute inset-0 h-full w-full object-cover" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-slate-950/20 to-transparent" />
        <div className="absolute inset-x-0 top-0 mx-auto flex max-w-4xl items-center justify-between px-4 pt-4 sm:px-6">
          <Link href={`/cities/${encodeURIComponent(p.city)}#local-partners`} className="rounded-full bg-white/90 px-3 py-1.5 text-xs font-bold text-slate-800 hover:bg-white">← Before the show in {p.city}</Link>
          {p.package === 'featured' && <span className="rounded-full bg-white px-3 py-1 text-[11px] font-extrabold uppercase tracking-wider text-rose-600 shadow">Featured partner</span>}
        </div>
      </div>

      <div className="mx-auto max-w-4xl px-4 sm:px-6">
        <div className="relative -mt-16 flex items-end gap-5 sm:-mt-20">
          {p.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={p.logo_url} alt={`${p.name} logo`} className="h-32 w-32 shrink-0 rounded-3xl border-4 border-white bg-white object-contain p-2 shadow-xl sm:h-40 sm:w-40" />
          ) : (
            <span className="flex h-32 w-32 shrink-0 items-center justify-center rounded-3xl border-4 border-white bg-slate-900 text-5xl font-extrabold text-white shadow-xl sm:h-40 sm:w-40">{p.name.slice(0, 1).toUpperCase()}</span>
          )}
          <div className="min-w-0 pb-2">
            <p className="text-xs font-bold uppercase tracking-widest text-rose-600">{categoryLabel(p.category)} · {p.city}</p>
            <h1 className="text-3xl font-extrabold leading-tight text-slate-900 sm:text-4xl">{p.name}</h1>
          </div>
        </div>

        {near.length > 0 && (
          <ul className="mt-5 flex flex-wrap gap-2">
            {near.map(v => { const d = distanceLabel(v.metres); return d ? <li key={v.name} className="rounded-full bg-rose-50 px-3 py-1 text-sm font-bold text-rose-700">📍 {d} to {v.name}</li> : null })}
          </ul>
        )}

        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            {p.offer_text && (
              <div className="rounded-2xl border-2 border-dashed border-amber-400 bg-amber-50 p-5">
                <p className="text-xs font-extrabold uppercase tracking-widest text-amber-700">🎟️ Show-goer offer</p>
                <p className="mt-1 text-xl font-extrabold leading-snug text-amber-950">{p.offer_text}</p>
                <form method="post" action={`/offer/${p.id}`} className="mt-4">
                  <button className="rounded-xl bg-rose-600 px-6 py-3 text-base font-bold text-white shadow-sm hover:bg-rose-700">Get your voucher</button>
                </form>
                <p className="mt-2 text-xs text-amber-800">Claim it on your phone and show it when you visit.</p>
              </div>
            )}
            {p.description && (
              <section>
                <h2 className="mb-2 text-xl font-extrabold text-slate-900">About {p.name}</h2>
                <p className="whitespace-pre-line leading-relaxed text-slate-700">{p.description}</p>
              </section>
            )}
            {photos.length > 1 && (
              <section>
                <h2 className="mb-3 text-xl font-extrabold text-slate-900">Photos</h2>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {photos.map(url => (
                    <a key={url} href={url} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-xl bg-slate-100">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={url} alt={p.name} loading="lazy" className="aspect-[4/5] w-full object-cover transition-transform hover:scale-105" />
                    </a>
                  ))}
                </div>
              </section>
            )}
          </div>

          <aside className="space-y-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-2 text-sm font-bold">
                {booking && <a href={`/out/biz/${p.id}?k=booking`} target="_blank" rel="sponsored noopener" className="rounded-xl bg-slate-900 px-4 py-3 text-center text-white hover:bg-slate-700">Book a table</a>}
                {website && <a href={`/out/biz/${p.id}?k=website`} target="_blank" rel="sponsored noopener" className="rounded-xl border-2 border-slate-900 px-4 py-3 text-center text-slate-900 hover:bg-slate-900 hover:text-white">Visit website</a>}
              </div>
              {(p.address || p.postcode) && (
                <div className="mt-4 border-t border-slate-100 pt-4 text-sm text-slate-600">
                  <p className="font-bold text-slate-900">Find them</p>
                  <p>{[p.address, p.postcode].filter(Boolean).join(', ')}</p>
                  <a href={`https://www.google.com/maps/search/?api=1&query=${mapQuery}`} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block font-bold text-rose-600 hover:underline">Open in Maps →</a>
                </div>
              )}
            </div>
            <Link href={`/cities/${encodeURIComponent(p.city)}`} className="block rounded-2xl bg-gradient-to-br from-slate-950 via-slate-900 to-rose-950 p-5 text-white hover:opacity-95">
              <p className="text-xs font-bold uppercase tracking-widest text-rose-300">TheShowFinder</p>
              <p className="mt-1 text-lg font-extrabold">See what&apos;s on in {p.city} →</p>
            </Link>
            <div className="rounded-2xl border-2 border-rose-200 bg-white p-5">
              <p className="font-extrabold text-slate-900">Want your business here too?</p>
              <p className="mt-1 text-sm text-slate-600">{p.name} is a local partner of TheShowFinder. First month free, cancel any time.</p>
              <Link href={`/advertise/onboard?city=${encodeURIComponent(p.city)}`} className="mt-3 block rounded-xl bg-rose-600 px-4 py-2.5 text-center text-sm font-extrabold text-white hover:bg-rose-700">Advertise with us →</Link>
            </div>
          </aside>
        </div>
      </div>
    </main>
  )
}
