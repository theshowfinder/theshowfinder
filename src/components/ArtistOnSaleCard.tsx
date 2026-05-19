import Link from 'next/link'

interface Props {
  name: string
  slug: string
  image_url: string | null
  tour_name: string | null
  onsale_date: string | null
  dates_count: number
}

export default function ArtistOnSaleCard({ name, slug, image_url, tour_name, onsale_date, dates_count }: Props) {
  const onSaleLabel = onsale_date
    ? new Date(onsale_date).toLocaleDateString('en-GB', {
        weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
      }).replace(',', '') + ' GMT'
    : null

  return (
    <Link
      href={`/artists/${slug}`}
      className="group block rounded-2xl overflow-hidden bg-white border border-slate-200 shadow-sm hover:shadow-lg transition-all duration-200 hover:-translate-y-0.5"
    >
      {/* Image */}
      <div className="relative h-48 overflow-hidden bg-slate-900">
        {image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={image_url}
            alt={name}
            className="w-full h-full object-cover object-top group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #1A1A2E, #E8003D)' }}>
            <span className="text-5xl">🎤</span>
          </div>
        )}
        {/* On sale badge */}
        <div className="absolute top-3 left-3">
          <span className="text-xs font-bold uppercase tracking-wider text-white px-2.5 py-1 rounded-full" style={{ backgroundColor: '#026CDF' }}>
            On Sale This Week
          </span>
        </div>
      </div>

      {/* Content */}
      <div className="p-4">
        <p className="text-xs font-semibold text-slate-500 mb-1 uppercase tracking-wide">
          {tour_name ?? 'Live Tour'}
        </p>
        <h3 className="font-extrabold text-slate-900 text-lg leading-tight mb-2 group-hover:text-red-600 transition-colors">
          {name}
        </h3>
        {dates_count > 0 && (
          <p className="text-sm text-slate-500 mb-3">
            🗓 {dates_count} UK date{dates_count !== 1 ? 's' : ''}
          </p>
        )}
        {onSaleLabel && (
          <div className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg bg-slate-100 text-slate-700">
            🎟️ On sale {onSaleLabel}
          </div>
        )}
      </div>
    </Link>
  )
}
