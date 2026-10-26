// "Before the show": featured local businesses on every show page in their city
// (paid placement, src/lib/localPlacements.ts). Clearly labelled as a partner listing.
import Image from 'next/image'
import { categoryLabel, safeWebsite, type Placement } from '@/lib/localPlacements'

export default function BeforeTheShow({ businesses, city }: { businesses: Placement[]; city: string }) {
  if (!businesses.length) return null
  return (
    <div>
      <div className="flex items-end justify-between mb-4 gap-4">
        <h2 className="text-xl font-extrabold text-slate-900">Before the show in {city}</h2>
        <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Local partners</span>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {businesses.map(b => {
          const href = safeWebsite(b.website_url)
          const body = (
            <>
              <div className="flex items-center gap-3 mb-2">
                {b.logo_url ? (
                  <Image src={b.logo_url} alt="" width={40} height={40} unoptimized className="w-10 h-10 rounded-lg object-cover bg-slate-100" />
                ) : (
                  <span className="w-10 h-10 rounded-lg bg-slate-900 text-white font-extrabold flex items-center justify-center">{b.name.slice(0, 1).toUpperCase()}</span>
                )}
                <div className="min-w-0">
                  <p className="font-extrabold text-slate-900 leading-tight truncate">{b.name}</p>
                  <p className="text-xs text-slate-500">{categoryLabel(b.category)}</p>
                </div>
              </div>
              {b.description && <p className="text-sm text-slate-600 leading-snug line-clamp-3">{b.description}</p>}
              {href && <p className="mt-3 text-sm font-bold" style={{ color: '#E8003D' }}>Visit website →</p>}
            </>
          )
          return href ? (
            <a key={b.id} href={href} target="_blank" rel="sponsored noopener" className="block bg-white border border-slate-200 rounded-xl p-4 hover:border-slate-400 transition-colors">{body}</a>
          ) : (
            <div key={b.id} className="bg-white border border-slate-200 rounded-xl p-4">{body}</div>
          )
        })}
      </div>
      <p className="mt-2 text-xs text-slate-400">Local businesses in {city}. <a href={`/advertise?city=${encodeURIComponent(city)}`} className="underline">Feature your business here</a></p>
    </div>
  )
}
