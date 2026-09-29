import Link from 'next/link'
import type { OnSaleGroup } from '@/lib/on-sale'
import { fmtOnSaleLabel } from '@/lib/on-sale'

// Shared "presale open now" card grid — used by both the national homepage
// section and each city page's Presales Open Now section, so the card design
// only lives in one place.
export default function PresaleGrid({ groups }: { groups: OnSaleGroup[] }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
      {groups.map(group => {
        const presaleClose = group.events
          .map(ev => ev.presale_end)
          .filter((d): d is string => !!d)
          .sort()[0] ?? null
        const presaleName = group.events.find(ev => ev.presale_name)?.presale_name ?? null
        return (
          <Link
            key={group.slug}
            href={`/on-sale-this-week/${group.slug}`}
            className="group block rounded-2xl overflow-hidden bg-white border border-slate-200 shadow-sm hover:shadow-lg transition-all duration-200 hover:-translate-y-0.5"
          >
            <div className="relative h-48 overflow-hidden bg-slate-900">
              {group.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={group.image_url} alt={group.artistName}
                  className="w-full h-full object-cover object-top group-hover:scale-105 transition-transform duration-300" />
              ) : (
                <div className="w-full h-full flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #1A1A2E, #FFB800)' }}>
                  <span className="text-5xl">🔥</span>
                </div>
              )}
              <div className="absolute top-3 left-3">
                <span className="text-xs font-bold uppercase tracking-wider px-2.5 py-1 rounded-full" style={{ backgroundColor: '#FFB800', color: '#1A1A2E' }}>
                  Presale Open
                </span>
              </div>
            </div>
            <div className="p-4">
              <p className="text-xs font-semibold text-slate-500 mb-1 uppercase tracking-wide">
                {presaleName ?? group.dbArtist?.tour_name ?? 'Presale'}
              </p>
              <h3 className="font-extrabold text-slate-900 text-lg leading-tight mb-2 group-hover:text-red-600 transition-colors">
                {group.artistName}
              </h3>
              <p className="text-sm text-slate-500 mb-3">
                🗓 {group.events.length} UK date{group.events.length !== 1 ? 's' : ''}
              </p>
              <div className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg bg-amber-50 text-amber-700">
                {presaleClose ? `⏳ Presale closes ${fmtOnSaleLabel(presaleClose)}` : '🎟️ Presale open now'}
              </div>
            </div>
          </Link>
        )
      })}
    </div>
  )
}
