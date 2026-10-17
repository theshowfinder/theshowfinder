import Link from 'next/link'
import { shortLondonDate, venueMixLabel, type RankedVenue } from '@/lib/venueDiscovery'

// One venue on a city page: what it mostly hosts, how many shows are coming up,
// and its next show. The whole card links to the venue's own page.
export default function VenueCard({ venue, town }: { venue: RankedVenue; town?: string | null }) {
  const mix = venueMixLabel(venue.mix)
  return (
    <Link
      href={`/venues/${venue.slug}`}
      className="block h-full bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 p-5"
    >
      {town && (
        <p className="text-xs font-bold uppercase tracking-wider mb-1.5" style={{ color: '#026CDF' }}>{town}</p>
      )}
      <h3 className="font-bold text-slate-900 text-base leading-snug mb-1">{venue.name}</h3>
      {venue.address && <p className="text-sm text-slate-500 mb-2 truncate">{venue.address}</p>}
      {mix && <p className="text-sm text-slate-600 mb-1">{mix}</p>}
      {venue.nextShow && (
        <p className="text-xs text-slate-500 mb-3 line-clamp-2">
          <span className="font-semibold text-slate-700">Next: {shortLondonDate(venue.nextShow.start_date)}</span> · {venue.nextShow.title}
        </p>
      )}
      <div className="flex items-center justify-between text-xs text-slate-400 mt-auto">
        {venue.capacity ? <span>🎪 {venue.capacity.toLocaleString('en-GB')} capacity</span> : <span />}
        <span className="font-semibold text-slate-600">
          {venue.count} show{venue.count !== 1 ? 's' : ''}
        </span>
      </div>
    </Link>
  )
}
