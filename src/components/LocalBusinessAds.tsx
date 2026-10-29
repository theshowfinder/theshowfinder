import Link from 'next/link'
import type { LocalBusiness } from '@/lib/types/database'
import { selectLocalBusinessPlacements } from '@/lib/localBusinessPlacements'
import { safeWebsite } from '@/lib/localPlacements'

const CATEGORY_DETAILS: Record<LocalBusiness['category'], { icon: string; label: string }> = {
  restaurant: { icon: '🍽️', label: 'Restaurant' },
  bar: { icon: '🍸', label: 'Bar' },
  cafe: { icon: '☕', label: 'Café' },
  hotel: { icon: '🛏️', label: 'Hotel' },
  transport: { icon: '🚕', label: 'Transport' },
  parking: { icon: '🅿️', label: 'Parking' },
  beauty: { icon: '✨', label: 'Beauty & wellness' },
  shop: { icon: '🛍️', label: 'Shop' },
  attraction: { icon: '🎡', label: 'Attraction' },
  other: { icon: '📍', label: 'Local business' },
}

function BusinessCard({ business, featured }: { business: LocalBusiness; featured: boolean }) {
  const category = CATEGORY_DETAILS[business.category]
  const content = (
    <article className={`group h-full overflow-hidden rounded-2xl border-2 bg-white shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-lg ${featured ? 'border-rose-500 ring-2 ring-rose-100' : 'border-slate-200'}`}>
      <div className={`flex items-center justify-between p-5 ${featured ? 'min-h-36 bg-gradient-to-br from-slate-950 via-slate-900 to-rose-950' : 'min-h-28 bg-gradient-to-br from-slate-100 to-slate-200'}`}>
        <span className={featured ? 'text-5xl' : 'text-4xl'} aria-hidden="true">{category.icon}</span>
        <span className={`rounded-full px-3 py-1 text-[11px] font-extrabold uppercase tracking-wider ${featured ? 'bg-white text-rose-600' : 'bg-white/90 text-slate-600'}`}>
          {featured ? 'Featured partner' : 'Local listing'}
        </span>
      </div>
      <div className={featured ? 'p-6' : 'p-5'}>
        <p className="mb-2 text-xs font-bold uppercase tracking-widest text-slate-400">{category.label}</p>
        <h3 className="mb-1 text-lg font-extrabold leading-snug text-slate-900 group-hover:text-rose-600">{business.name}</h3>
        {business.description && <p className="line-clamp-3 text-sm leading-relaxed text-slate-500">{business.description}</p>}
        {business.offer_text && <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm font-bold text-amber-900">🎟️ {business.offer_text}</p>}
        <div className="mt-4 flex flex-wrap gap-2 text-sm font-bold">
          {business.offer_text && (
            <form method="post" action={`/offer/${business.id}`}>
              <button className="rounded-lg bg-rose-600 px-3 py-2 text-white hover:bg-rose-700">Get voucher</button>
            </form>
          )}
          {safeWebsite(business.booking_url) && <a href={`/out/biz/${business.id}?k=booking`} target="_blank" rel="sponsored noopener" className="rounded-lg border border-slate-300 px-3 py-2 text-slate-800 hover:border-slate-500">Book a table</a>}
          {safeWebsite(business.website_url) && <a href={`/out/biz/${business.id}?k=website`} target="_blank" rel="sponsored noopener" className="px-1 py-2 text-rose-600 hover:underline">Visit website <span aria-hidden="true">→</span></a>}
        </div>
      </div>
    </article>
  )
  // Links and the voucher button sit inside the card (tracked via /out/biz for the advertiser's report),
  // so the card itself is no longer one big link.
  return content
}

export default function LocalBusinessAds({ cityName, businesses }: { cityName: string; businesses: LocalBusiness[] }) {
  const { featured, standard } = selectLocalBusinessPlacements(businesses)
  if (featured.length === 0 && standard.length === 0) return null

  return (
    <section aria-labelledby="local-partners-heading">
      <div className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="mb-1 text-xs font-bold uppercase tracking-widest text-rose-600">Local partners</p>
          <h2 id="local-partners-heading" className="text-2xl font-extrabold text-slate-900 sm:text-3xl">Make more of your night in {cityName}</h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-500">Places to eat, drink, stay and get ready near the action.</p>
        </div>
        <Link href={`/advertise?city=${encodeURIComponent(cityName)}`} className="shrink-0 text-sm font-bold text-rose-600 hover:underline">
          Advertise your business <span aria-hidden="true">→</span>
        </Link>
      </div>

      {featured.length > 0 && (
        <div className="mb-5 grid grid-cols-1 gap-5 md:grid-cols-3">
          {featured.map(business => <BusinessCard key={business.id} business={business} featured />)}
        </div>
      )}
      {standard.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {standard.map(business => <BusinessCard key={business.id} business={business} featured={false} />)}
        </div>
      )}
      <p className="mt-4 text-xs text-slate-400">Featured partners appear first. Placements are limited to nine businesses per city.</p>
    </section>
  )
}
