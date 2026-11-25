import Link from 'next/link'
import type { LocalBusiness } from '@/lib/types/database'
import { selectLocalBusinessPlacements } from '@/lib/localBusinessPlacements'
import { dayKey, pickForPage, safeWebsite, type AreaVenue } from '@/lib/localPlacements'
import { distanceLabel } from '@/lib/businessOffers'
import { venuesToName, type MainVenue } from '@/lib/mainVenues'

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

function BusinessCard({ business, featured, where }: { business: LocalBusiness; featured: boolean; where?: string[] }) {
  const category = CATEGORY_DETAILS[business.category]
  const content = (
    <article className={`group h-full overflow-hidden rounded-2xl border-2 bg-white shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-lg ${featured ? 'border-rose-500 ring-2 ring-rose-100' : 'border-slate-200'}`}>
      {/* Banner: the business's own photo (migration 139), else our brand gradient (Featured) or grey (Standard). */}
      <Link href={`/partners/${business.id}`} aria-label={`More about ${business.name}`} className={`relative block ${featured ? 'h-32 bg-gradient-to-br from-slate-950 via-slate-900 to-rose-950' : 'h-24 bg-gradient-to-br from-slate-100 to-slate-200'}`}>
        {business.photo_urls?.[0] && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={business.photo_urls[0]} alt={business.name} loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
        )}
        {business.photo_urls?.[0] && <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />}
        {!business.logo_url && !business.photo_urls?.[0] && <span className={`absolute left-5 top-5 ${featured ? 'text-5xl' : 'text-4xl'}`} aria-hidden="true">{category.icon}</span>}
        <span className={`absolute right-3 top-3 rounded-full px-3 py-1 text-[11px] font-extrabold uppercase tracking-wider shadow ${featured ? 'bg-white text-rose-600' : 'bg-white/90 text-slate-600'}`}>
          {featured ? 'Featured partner' : 'Local listing'}
        </span>
      </Link>
      <div className={featured ? 'px-5 pb-5' : 'px-4 pb-4'}>
        <div className={`flex items-start gap-3 ${business.logo_url ? '' : 'pt-4'}`}>
          {business.logo_url && (
            // The advertiser's own logo on a white tile, overlapping the banner like a profile picture.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={business.logo_url} alt={`${business.name} logo`} loading="lazy" className={`${featured ? '-mt-10 h-20 w-20' : '-mt-8 h-16 w-16'} relative shrink-0 rounded-2xl border-4 border-white bg-white object-contain p-1 shadow-lg`} />
          )}
          <div className={`min-w-0 ${business.logo_url ? 'pt-2' : ''}`}>
            <h3 className="text-lg font-extrabold leading-snug text-slate-900"><Link href={`/partners/${business.id}`} className="hover:text-rose-600">{business.name}</Link></h3>
            <p className="text-xs font-bold uppercase tracking-widest text-slate-400">{category.label}</p>
          </div>
        </div>
        {where && where.length > 0 && (
          <ul className="mt-2 flex flex-wrap gap-1">
            {where.map(w => <li key={w} className="rounded-full bg-rose-50 px-2.5 py-0.5 text-xs font-bold text-rose-700">📍 {w}</li>)}
          </ul>
        )}
        {/* Three lines on the card; the photo, name and "More about" open the partner page with the full text. */}
        {business.description && <p className="mt-2 line-clamp-3 text-sm leading-snug text-slate-500">{business.description}</p>}
        {business.offer_text && (
          <div className="mt-3 rounded-xl border-2 border-dashed border-amber-400 bg-amber-50 px-3 py-2">
            <p className="text-[10px] font-extrabold uppercase tracking-widest text-amber-700">🎟️ Show-goer offer</p>
            <p className="text-sm font-extrabold leading-snug text-amber-950">{business.offer_text}</p>
          </div>
        )}
        <div className="mt-4 flex flex-wrap gap-2 text-sm font-bold">
          {business.offer_text && (
            <form method="post" action={`/offer/${business.id}`}>
              <button className="rounded-xl bg-rose-600 px-4 py-2.5 text-white shadow-sm hover:bg-rose-700">Get your voucher</button>
            </form>
          )}
          {safeWebsite(business.booking_url) && <a href={`/out/biz/${business.id}?k=booking`} target="_blank" rel="sponsored noopener" className="rounded-lg border border-slate-300 px-3 py-2 text-slate-800 hover:border-slate-500">Book a table</a>}
          {safeWebsite(business.website_url) && <a href={`/out/biz/${business.id}?k=website`} target="_blank" rel="sponsored noopener" className="px-1 py-2 text-rose-600 hover:underline">Visit website <span aria-hidden="true">→</span></a>}
          <Link href={`/partners/${business.id}`} className="px-1 py-2 text-slate-700 hover:underline">More about {business.name} <span aria-hidden="true">→</span></Link>
        </div>
      </div>
    </article>
  )
  // Links and the voucher button sit inside the card (tracked via /out/biz for the advertiser's report),
  // so the card itself is no longer one big link.
  return content
}

/** "3 min walk to Royal Concert Hall", one per main venue within walking reach, nearest first (up to three). */
function whereLabels(business: LocalBusiness, venues: readonly MainVenue[], city: string): string[] {
  return venuesToName(business, venues, 3, null, city)
    .map(v => { const d = distanceLabel(v.metres); return d ? `${d} to ${v.name}` : null })
    .filter((x): x is string => Boolean(x))
}

export default function LocalBusinessAds({ cityName, businesses, venues = [], mainVenues = [] }: { cityName: string; businesses: LocalBusiness[]; venues?: AreaVenue[]; mainVenues?: MainVenue[] }) {
  const { groups } = selectLocalBusinessPlacements(businesses, venues, cityName)
  if (groups.length === 0) return null
  // Big cities have several areas: a daily-rotating strip of three Featured partners (each says where it is), then
  // every area's partners under "Places near your venue". One area (most cities): the plain list.
  const areas = groups.length > 1
  const strip = areas ? pickForPage(groups.flatMap(g => g.featured), dayKey(), 3) : []

  const header = (
    <div className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="mb-1 text-xs font-bold uppercase tracking-widest text-rose-600">Local partners</p>
        <h2 id="local-partners-heading" className="text-2xl font-extrabold text-slate-900 sm:text-3xl">Make more of your night in {cityName}</h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-500">Places to eat, drink, stay and get ready near the action.</p>
      </div>
      <Link href={`/advertise/onboard?city=${encodeURIComponent(cityName)}`} className="shrink-0 rounded-xl bg-rose-600 px-4 py-2.5 text-center text-sm font-extrabold text-white shadow hover:bg-rose-700">
        📣 Advertise with us <span aria-hidden="true">→</span>
      </Link>
    </div>
  )

  // Under the partners: a clear invitation for the next business, straight to the sign-up (Chris, 25 Nov 2026).
  const cta = (
    <div className="mt-6 flex flex-col gap-4 rounded-2xl bg-gradient-to-br from-slate-950 via-slate-900 to-rose-950 p-5 text-white sm:flex-row sm:items-center sm:justify-between sm:p-6">
      <div>
        <p className="text-lg font-extrabold">Run a restaurant, bar, café or hotel in {cityName}?</p>
        <p className="mt-1 text-sm text-white/80">Get in front of people going to shows near you, with your photos, an offer they claim as a voucher, and a monthly report. First month free, cancel any time.</p>
      </div>
      <Link href={`/advertise/onboard?city=${encodeURIComponent(cityName)}`} className="shrink-0 rounded-xl bg-white px-5 py-3 text-center text-sm font-extrabold text-rose-600 shadow hover:bg-rose-50">Advertise with us <span aria-hidden="true">→</span></Link>
    </div>
  )

  if (!areas) {
    const [group] = groups
    return (
      <section aria-labelledby="local-partners-heading">
        {header}
        {group.featured.length > 0 && (
          <div className="mb-5 grid grid-cols-1 gap-5 md:grid-cols-3">
            {group.featured.map(business => <BusinessCard key={business.id} business={business} featured where={whereLabels(business, mainVenues, cityName)} />)}
          </div>
        )}
        {group.standard.length > 0 && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {group.standard.map(business => <BusinessCard key={business.id} business={business} featured={false} where={whereLabels(business, mainVenues, cityName)} />)}
          </div>
        )}
        <p className="mt-4 text-xs text-slate-400">Featured partners appear first. Each area has at most three Featured and six Standard partners.</p>
        {cta}
      </section>
    )
  }

  return (
    <section aria-labelledby="local-partners-heading">
      {header}
      {strip.length > 0 && (
        <div className="mb-8 grid grid-cols-1 gap-5 md:grid-cols-3">
          {strip.map(business => <BusinessCard key={business.id} business={business} featured where={whereLabels(business, mainVenues, cityName)} />)}
        </div>
      )}
      <h3 className="mb-3 text-lg font-extrabold text-slate-900">Places near your venue</h3>
      <div className="space-y-3">
        {groups.map(group => (
          <details key={group.label} className="group rounded-2xl border border-slate-200 bg-white">
            <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-4 font-extrabold text-slate-900">
              <span>{group.label}</span>
              <span className="text-sm font-semibold text-slate-500">{group.featured.length + group.standard.length} place{group.featured.length + group.standard.length === 1 ? '' : 's'} <span aria-hidden="true" className="inline-block transition-transform group-open:rotate-90">›</span></span>
            </summary>
            <div className="px-5 pb-5">
              {group.featured.length > 0 && (
                <div className="mb-4 grid grid-cols-1 gap-5 md:grid-cols-3">
                  {group.featured.map(business => <BusinessCard key={business.id} business={business} featured where={whereLabels(business, mainVenues, cityName)} />)}
                </div>
              )}
              {group.standard.length > 0 && (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {group.standard.map(business => <BusinessCard key={business.id} business={business} featured={false} where={whereLabels(business, mainVenues, cityName)} />)}
                </div>
              )}
            </div>
          </details>
        ))}
      </div>
      <p className="mt-4 text-xs text-slate-400">Featured partners rotate daily at the top. Each area has at most three Featured and six Standard partners.</p>
      {cta}
    </section>
  )
}
