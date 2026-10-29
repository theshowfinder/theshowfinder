// "Before the show": featured local businesses on every show page in their city, right under the ticket buttons
// (paid placement, src/lib/localPlacements.ts). Each card can carry the advertiser's offer, claimed as a QR voucher
// (/offer/<id> -> /voucher/<code>), plus how far it is from the venue and tracked Book / Website links
// (/out/biz/<id>, counted for the advertiser's monthly report). Clearly labelled as local partners.
import Image from 'next/image'
import { categoryLabel, safeWebsite, type Placement } from '@/lib/localPlacements'
import { distanceLabel, metresBetween } from '@/lib/businessOffers'

interface VenuePoint { name: string; lat: number | null; lng: number | null }

export default function BeforeTheShow({ businesses, city, eventId, venue }: { businesses: Placement[]; city: string; eventId: string; venue: VenuePoint }) {
  if (!businesses.length) return null
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-lg font-extrabold text-slate-900">Make a night of it</h2>
        <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Local partners</span>
      </div>
      <div className="space-y-3">
        {businesses.map(b => {
          const website = safeWebsite(b.website_url)
          const booking = safeWebsite(b.booking_url)
          const metres = b.lat != null && b.lng != null && venue.lat != null && venue.lng != null ? metresBetween({ lat: b.lat, lng: b.lng }, { lat: venue.lat, lng: venue.lng }) : null
          const distance = distanceLabel(metres)
          return (
            <div key={b.id} className="rounded-xl border border-slate-200 p-4">
              <div className="flex items-center gap-3">
                {b.logo_url ? (
                  <Image src={b.logo_url} alt="" width={40} height={40} unoptimized className="h-10 w-10 rounded-lg bg-slate-100 object-cover" />
                ) : (
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-900 font-extrabold text-white">{b.name.slice(0, 1).toUpperCase()}</span>
                )}
                <div className="min-w-0">
                  <p className="truncate font-extrabold leading-tight text-slate-900">{b.name}</p>
                  <p className="text-xs text-slate-500">{categoryLabel(b.category)}{distance ? ` · ${distance} from ${venue.name}` : ''}</p>
                </div>
              </div>
              {b.offer_text && <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm font-bold text-amber-900">🎟️ {b.offer_text}</p>}
              {!b.offer_text && b.description && <p className="mt-2 line-clamp-2 text-sm leading-snug text-slate-600">{b.description}</p>}
              <div className="mt-3 flex flex-wrap gap-2 text-sm font-bold">
                {b.offer_text && (
                  <form method="post" action={`/offer/${b.id}?e=${eventId}`}>
                    <button className="rounded-lg px-3 py-2 text-white" style={{ backgroundColor: '#E8003D' }}>Get voucher</button>
                  </form>
                )}
                {booking && <a href={`/out/biz/${b.id}?k=booking&e=${eventId}`} target="_blank" rel="sponsored noopener" className="rounded-lg border border-slate-300 px-3 py-2 text-slate-800 hover:border-slate-500">Book a table</a>}
                {website && !booking && <a href={`/out/biz/${b.id}?k=website&e=${eventId}`} target="_blank" rel="sponsored noopener" className="rounded-lg border border-slate-300 px-3 py-2 text-slate-800 hover:border-slate-500">Website</a>}
              </div>
            </div>
          )
        })}
      </div>
      <p className="mt-3 text-xs text-slate-400">Local businesses in {city}. <a href={`/advertise?city=${encodeURIComponent(city)}`} className="underline">Feature your business here</a></p>
    </div>
  )
}
