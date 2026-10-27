import Link from 'next/link'
import type { LocalBusiness } from '@/lib/types/database'
import { selectLocalBusinessPlacements } from '@/lib/localBusinessPlacements'

const CATEGORY_DETAILS: Record<LocalBusiness['category'], { icon: string; label: string }> = {
  restaurant: { icon: '🍽️', label: 'Restaurant' },
  bar: { icon: '🍸', label: 'Bar' },
  hotel: { icon: '🛏️', label: 'Hotel' },
  transport: { icon: '🚕', label: 'Transport' },
  beauty: { icon: '✨', label: 'Beauty & wellness' },
  other: { icon: '📍', label: 'Local business' },
}

function BusinessCard({ business, featured }: { business: LocalBusiness; featured: boolean }) {
  const category = CATEGORY_DETAILS[business.category]
  const content = (
    <article className={`group relative h-full overflow-hidden rounded-2xl border-2 bg-white shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-lg ${featured ? 'border-slate-300 shadow-xl' : 'border-slate-200'}`}>
      <div className={`flex items-center justify-between p-5 ${featured ? 'min-h-36 bg-gradient-to-br from-slate-950 via-slate-900 to-rose-950' : 'min-h-28 bg-gradient-to-br from-slate-100 to-slate-200'}`}>
        <span className={featured ? 'text-5xl' : 'text-4xl'} aria-hidden="true">{category.icon}</span>
        <span className={`rounded-full px-3 py-1 text-[11px] font-extrabold uppercase tracking-wider ${featured ? 'bg-amber-300 text-slate-950' : 'bg-white/90 text-slate-600'}`}>
          {featured ? 'Featured partner' : 'Local listing'}
        </span>
      </div>
      <div className={featured ? 'min-h-[250px] p-6' : 'min-h-[205px] p-5'}>
        <p className="mb-2 text-xs font-bold uppercase tracking-widest text-slate-400">{category.label}</p>
        <h3 className="mb-1 text-lg font-extrabold leading-snug text-slate-900 group-hover:text-rose-600">{business.name}</h3>
        {business.description && <p className="line-clamp-3 text-sm leading-relaxed text-slate-500">{business.description}</p>}
        {business.website_url && <p className="mt-4 text-sm font-bold text-rose-600">Visit website <span aria-hidden="true">→</span></p>}
      </div>
    </article>
  )

  if (!business.website_url) return content
  return <a href={business.website_url} target="_blank" rel="sponsored noopener noreferrer" className="block h-full">{content}</a>
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
