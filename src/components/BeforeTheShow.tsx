// "Before the show": featured local businesses on every show page in their city, right under the ticket buttons
// (paid placement, src/lib/localPlacements.ts). Each card can carry the advertiser's offer, claimed as a QR voucher
// (/offer/<id> -> /voucher/<code>), plus how far it is from the venue and tracked Book / Website links
// (/out/biz/<id>, counted for the advertiser's monthly report). Clearly labelled as local partners.
import Image from 'next/image'
import { categoryLabel, safeWebsite, type Placement } from '@/lib/localPlacements'
import { distanceLabel, metresBetween } from '@/lib/businessOffers'

interface VenuePoint { name: string; lat: number | null; lng: number | null }

export default function BeforeTheShow({ businesses, city, eventId, venue, wide = false }: { businesses: Placement[]; city: string; eventId: string; venue: VenuePoint; wide?: boolean }) {
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
      <div className={wide && businesses.length > 1 ? 'grid grid-cols-1 gap-4 md:grid-cols-2' : 'space-y-4'}>
        {businesses.map(b => {
          const website = safeWebsite(b.website_url)
          const booking = safeWebsite(b.booking_url)
          const metres = b.lat != null && b.lng != null && venue.lat != null && venue.lng != null ? metresBetween({ lat: b.lat, lng: b.lng }, { lat: venue.lat, lng: venue.lng }) : null
          const distance = distanceLabel(metres)
          return (
            <div key={b.id} className="rounded-xl bg-white p-4 shadow-md sm:p-5">
              <div className="flex items-center gap-4">
                {b.logo_url ? (
                  <Image src={b.logo_url} alt={`${b.name} logo`} width={88} height={88} unoptimized className="h-20 w-20 shrink-0 rounded-xl border border-slate-200 bg-white object-contain p-1.5 sm:h-[88px] sm:w-[88px]" />
                ) : (
                  <span className="flex h-20 w-20 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-3xl font-extrabold text-white">{b.name.slice(0, 1).toUpperCase()}</span>
                )}
                <div className="min-w-0">
                  <p className="text-lg font-extrabold leading-tight text-slate-900 sm:text-xl">{b.name}</p>
                  <p className="mt-0.5 text-sm text-slate-500">{categoryLabel(b.category)}</p>
                  {distance && <p className="mt-1 inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-0.5 text-xs font-bold text-rose-700">📍 {distance} from {venue.name}</p>}
                </div>
              </div>
              {b.offer_text && (
                <div className="mt-4 rounded-xl border-2 border-dashed border-amber-400 bg-amber-50 px-4 py-3">
                  <p className="text-[10px] font-extrabold uppercase tracking-widest text-amber-700">🎟️ Show-goer offer</p>
                  <p className="mt-0.5 text-base font-extrabold leading-snug text-amber-950">{b.offer_text}</p>
                </div>
              )}
              {b.description && <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-slate-600">{b.description}</p>}
              <div className="mt-4 flex flex-wrap items-center gap-2 text-sm font-bold">
                {b.offer_text && (
                  <form method="post" action={eventId ? `/offer/${b.id}?e=${eventId}` : `/offer/${b.id}`}>
                    <button className="rounded-xl px-5 py-3 text-base text-white shadow-sm hover:opacity-90" style={{ backgroundColor: '#E8003D' }}>Get your voucher</button>
                  </form>
                )}
                {booking && <a href={`/out/biz/${b.id}?k=booking${eventId ? `&e=${eventId}` : ''}`} target="_blank" rel="sponsored noopener" className="rounded-xl border-2 border-slate-900 px-4 py-2.5 text-slate-900 hover:bg-slate-900 hover:text-white">Book a table</a>}
                {website && <a href={`/out/biz/${b.id}?k=website${eventId ? `&e=${eventId}` : ''}`} target="_blank" rel="sponsored noopener" className="px-2 py-2.5 text-rose-600 hover:underline">Visit website →</a>}
              </div>
            </div>
          )
        })}
      </div>
      <p className="mt-4 text-xs text-white/60">Local businesses in {city}. <a href={`/advertise?city=${encodeURIComponent(city)}`} className="underline hover:text-white">Feature your business here</a></p>
    </section>
  )
}
