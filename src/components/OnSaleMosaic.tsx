import Link from 'next/link'

export interface OnSaleMosaicTile {
  href: string
  title: string
  imageUrl: string
  /** "On sale Fri 23 Oct, 10:00" / "On sale now" / "Presale opens ..." */
  chip: string
  presale: boolean
  /** "Vaillant Live, Derby · Fri 29 Oct" or "6 UK dates" */
  meta: string
}

// The image-led "On sale this week" block at the top of the homepage: one large tile and smaller ones, the same
// look as a city page's headline block. Server-rendered with no client JS so it paints instantly on a phone
// (visitors arriving from a social post land here). Every tile is a real On Sale card that opens its own page.
export default function OnSaleMosaic({ tiles, total }: { tiles: OnSaleMosaicTile[]; total: number }) {
  if (tiles.length === 0) return null
  return (
    <section aria-labelledby="on-sale-this-week-heading" className="bg-white py-8 sm:py-12 border-b border-slate-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-end justify-between gap-4 mb-5 sm:mb-6">
          <div>
            <p className="font-bold text-xs uppercase tracking-widest mb-1" style={{ color: '#026CDF' }}>Tickets just released</p>
            <h2 id="on-sale-this-week-heading" className="text-2xl sm:text-3xl font-extrabold text-slate-900">On sale this week</h2>
          </div>
          <Link href="/on-sale-this-week" className="shrink-0 text-sm font-semibold hover:underline" style={{ color: '#026CDF' }}>
            {total > tiles.length ? `View all ${total} →` : 'View all →'}
          </Link>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 auto-rows-[11rem] md:auto-rows-[13rem]">
          {tiles.map((t, i) => {
            const big = i === 0 && tiles.length > 1
            return (
              <Link
                key={t.href}
                href={t.href}
                className={`group relative overflow-hidden rounded-2xl bg-slate-800 ${big ? 'col-span-2 row-span-2' : ''}`}
              >
                <div
                  className="absolute inset-0 bg-cover bg-center transition-transform duration-500 group-hover:scale-105"
                  style={{ backgroundImage: `url("${t.imageUrl}")` }}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent" />
                <span
                  className="absolute top-3 left-3 max-w-[calc(100%-1.5rem)] truncate text-[11px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-full text-white"
                  style={{ backgroundColor: t.presale ? '#E8003D' : '#026CDF' }}
                >
                  {t.chip}
                </span>
                <div className="absolute inset-x-0 bottom-0 p-3.5 sm:p-4">
                  <h3 className={`font-extrabold text-white leading-snug line-clamp-2 ${big ? 'text-xl sm:text-3xl' : 'text-sm sm:text-base'}`}>{t.title}</h3>
                  <p className={`text-white/75 truncate mt-0.5 ${big ? 'text-sm' : 'text-xs'}`}>{t.meta}</p>
                </div>
              </Link>
            )
          })}
        </div>
      </div>
    </section>
  )
}
