// "Before the show": featured local businesses on every show page in their city, right under the ticket buttons
// (paid placement, src/lib/localPlacements.ts). Each card can carry the advertiser's offer, claimed as a QR voucher
// (/offer/<id> -> /voucher/<code>), plus how far it is from the venue and tracked Book / Website links
// (/out/biz/<id>, counted for the advertiser's monthly report). Clearly labelled as local partners.
import Image from 'next/image'
import Link from 'next/link'
import { categoryLabel, safeWebsite, type Placement } from '@/lib/localPlacements'
import { venuesToName, type MainVenue } from '@/lib/mainVenues'
import { distanceLabel, metresBetween } from '@/lib/businessOffers'

interface VenuePoint { name: string; lat: number | null; lng: number | null }

export default function BeforeTheShow({ businesses, city, eventId, venue, otherVenues = [], wide = false }: { businesses: Placement[]; city: string; eventId: string; venue: VenuePoint; otherVenues?: MainVenue[]; wide?: boolean }) {
  if (!businesses.length) return null
  return (
    <section aria-labelledby="before-the-show-heading" className="overflow-hidden rounded-2xl border-2 border-rose-500 bg-gradient-to-br from-slate-950 via-slate-900 to-rose-950 p-5 shadow-lg ring-4 ring-rose-100 sm:p-6">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-[11px] font-extrabold uppercase tracking-widest text-rose-300">Before the show</p>
          <h2 id="before-the-show-heading" className="text-xl font-extrabold text-white sm:text-2xl">Make a night of it near {venue.name}</h2>
        </div>
        <span className="rounded-full bg-white/10 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-white/80">Local partners</span>
      </div>
      <div className={wide && businesses.length > 1 ? 'grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3' : 'space-y-4'}>
        {businesses.map(b => {
          const website = safeWebsite(b.website_url)
          const booking = safeWebsite(b.booking_url)
          const metres = b.lat != null && b.lng != null && venue.lat != null && venue.lng != null ? metresBetween({ lat: b.lat, lng: b.lng }, { lat: venue.lat, lng: venue.lng }) : null
          const distance = distanceLabel(metres)
          // Also near: the other main venues within walking reach (this show's venue is named first, above).
          const alsoNear = venuesToName(b, otherVenues, businesses.length > 1 ? 1 : 2, venue.name, city)
            .map(v => { const d = distanceLabel(v.metres); return d ? `${d} to ${v.name}` : null })
            .filter((x): x is string => Boolean(x))
          return (
            <div key={b.id} className="overflow-hidden rounded-xl bg-white shadow-md">
              {/* The business's own photo as the banner; our dark brand gradient when they have none. */}
              <Link href={`/partners/${b.id}`} aria-label={`More about ${b.name}`} className="relative block h-28 bg-gradient-to-br from-slate-800 via-slate-900 to-rose-950 sm:h-32">
                {b.photo_urls?.[0] && (
                  <Image src={b.photo_urls[0]} alt={`${b.name}`} fill unoptimized sizes="(max-width: 768px) 100vw, 640px" className="object-cover" />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />
                <span className="absolute right-3 top-3 rounded-full bg-white px-3 py-1 text-[10px] font-extrabold uppercase tracking-wider text-rose-600 shadow">Featured partner</span>
              </Link>
              <div className="relative px-4 pb-4">
                <div className="-mt-10 flex items-end gap-3">
                  {b.logo_url ? (
                    <Image src={b.logo_url} alt={`${b.name} logo`} width={128} height={128} unoptimized className="h-20 w-20 shrink-0 rounded-2xl border-4 border-white bg-white object-contain p-1 shadow-lg" />
                  ) : (
                    <span className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl border-4 border-white bg-slate-900 text-3xl font-extrabold text-white shadow-lg">{b.name.slice(0, 1).toUpperCase()}</span>
                  )}
                  <div className="min-w-0 pb-1">
                    <Link href={`/partners/${b.id}`} className="block text-lg font-extrabold leading-tight text-slate-900 hover:text-rose-600">{b.name}</Link>
                    <p className="mt-0.5 text-sm font-semibold text-slate-500">{categoryLabel(b.category)}</p>
                  </div>
                </div>
                {(distance || alsoNear.length > 0) && (
                  <ul className="mt-2 flex flex-wrap gap-1">
                    {distance && <li className="rounded-full bg-rose-600 px-2.5 py-0.5 text-xs font-bold text-white">📍 {distance} to {venue.name}</li>}
                    {alsoNear.map(n => <li key={n} className="rounded-full bg-rose-50 px-2.5 py-0.5 text-xs font-bold text-rose-700">📍 {n}</li>)}
                  </ul>
                )}
              {b.offer_text && (
                <div className="mt-3 rounded-xl border-2 border-dashed border-amber-400 bg-amber-50 px-3 py-2">
                  <p className="text-[10px] font-extrabold uppercase tracking-widest text-amber-700">🎟️ Show-goer offer</p>
                  <p className="text-sm font-extrabold leading-snug text-amber-950">{b.offer_text}</p>
                </div>
              )}
              {/* Three lines here; the photo, name and "More about" open the partner page with the full text and gallery. */}
              {b.description && <p className="mt-2 line-clamp-3 text-sm leading-snug text-slate-600">{b.description}</p>}
              <div className="mt-3 flex flex-wrap items-center gap-2 text-sm font-bold">
                {b.offer_text && (
                  <form method="post" action={eventId ? `/offer/${b.id}?e=${eventId}` : `/offer/${b.id}`}>
                    <button className="rounded-xl px-4 py-2.5 text-white shadow-sm hover:opacity-90" style={{ backgroundColor: '#E8003D' }}>Get your voucher</button>
                  </form>
                )}
                {booking && <a href={`/out/biz/${b.id}?k=booking${eventId ? `&e=${eventId}` : ''}`} target="_blank" rel="sponsored noopener" className="rounded-xl border-2 border-slate-900 px-3 py-2 text-slate-900 hover:bg-slate-900 hover:text-white">Book a table</a>}
                {website && <a href={`/out/biz/${b.id}?k=website${eventId ? `&e=${eventId}` : ''}`} target="_blank" rel="sponsored noopener" className="px-2 py-2.5 text-rose-600 hover:underline">Visit website →</a>}
                <Link href={`/partners/${b.id}`} className="px-2 py-2.5 text-slate-700 hover:underline">More about {b.name} →</Link>
              </div>
              </div>
            </div>
          )
        })}
      </div>
      <p className="mt-4 text-xs text-white/60">Local businesses in {city}. <a href={`/advertise?city=${encodeURIComponent(city)}`} className="underline hover:text-white">Feature your business here</a></p>
    </section>
  )
}
