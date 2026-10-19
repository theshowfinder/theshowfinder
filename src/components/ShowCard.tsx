import Link from 'next/link'
import type { Show } from '@/lib/shows'
import { eventImageUrl } from '@/lib/eventImages'
import type { EventCategory } from '@/lib/types/database'
import { TrackedTicketLink } from '@/components/TrackedTicketLink'
import { getSeeTicketsAffiliateLink } from '@/lib/affiliate'
import { seeTicketsUrlForShow } from '@/lib/seeTicketsWestEnd'

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Europe/London',
  })
}

interface Props {
  show: Show
  /** West End cards open the show page; attraction cards go straight to tickets. */
  kind: 'west-end' | 'attraction'
}

export default function ShowCard({ show, kind }: Props) {
  const isWestEnd = kind === 'west-end'
  const showHref  = isWestEnd ? `/west-end/${show.slug}` : `/events/${show.nextEventSlug}`
  const ticketsHref = `/events/${show.nextEventSlug}`
  const category = (show.category ?? (isWestEnd ? 'theatre' : 'family')) as EventCategory
  const imageUrl = eventImageUrl(show.imageUrl, category, show.title)
  const soldOut  = show.status === 'sold_out'
  const sym = show.currency === 'GBP' ? '£' : show.currency
  const seeTicketsUrl = isWestEnd ? seeTicketsUrlForShow(show.title, show.venueName) : null

  return (
    <div className="group flex flex-col rounded-2xl overflow-hidden bg-white border border-slate-200 shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200">
      <Link href={showHref} className="relative h-48 bg-slate-100 block overflow-hidden">
        {imageUrl ? (
          <div
            className="absolute inset-0 bg-cover bg-center transition-transform duration-300 group-hover:scale-105"
            style={{ backgroundImage: `url("${imageUrl}")` }}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-5xl bg-slate-50">
            {isWestEnd ? '🎭' : '🎡'}
          </div>
        )}
        {soldOut && (
          <span className="absolute top-3 right-3 text-xs font-bold px-2.5 py-1 rounded-full bg-red-600 text-white">
            Sold Out
          </span>
        )}
      </Link>

      <div className="flex flex-col flex-1 p-4 gap-2">
        <span
          className="self-start text-xs font-bold px-2.5 py-0.5 rounded-full"
          style={isWestEnd ? { backgroundColor: '#FDE7EE', color: '#B0002C' } : { backgroundColor: '#E0F2FE', color: '#0369A1' }}
        >
          {isWestEnd ? 'West End' : 'Attraction'}
        </span>

        <Link href={showHref} className="block">
          <h3 className="font-bold text-slate-900 text-base leading-snug line-clamp-2 hover:opacity-80 transition-opacity">
            {show.title}
          </h3>
        </Link>

        <div className="flex flex-col gap-1 text-sm text-slate-500">
          <span className="truncate">📍 {show.venueName}{show.venueCity ? `, ${show.venueCity}` : ''}</span>
          <span>📅 Next: {formatDate(show.nextDate)}</span>
          <span>🎟️ {show.dateCount} {show.dateCount === 1 ? 'date' : isWestEnd ? 'performances' : 'dates'} available</span>
        </div>

        {show.priceFrom ? (
          <div className="pt-2 border-t border-slate-100 mt-auto">
            <span className="text-sm font-bold text-slate-800">From {sym}{show.priceFrom}</span>
          </div>
        ) : null}

        {soldOut ? (
          <div className="w-full bg-slate-200 text-slate-500 font-bold py-3 rounded-xl text-center text-sm cursor-not-allowed">
            Sold Out
          </div>
        ) : (
          <Link
            href={ticketsHref}
            className="w-full text-white font-bold py-3 rounded-xl text-center text-sm hover:opacity-90 active:scale-95 transition-all duration-150 min-h-[48px] flex items-center justify-center"
            style={{ backgroundColor: '#E8003D' }}
          >
            Get Tickets
          </Link>
        )}

        {seeTicketsUrl && !soldOut && (
          <TrackedTicketLink
            href={getSeeTicketsAffiliateLink(seeTicketsUrl)}
            provider="See Tickets"
            section="primary"
            context={`west-end-card:${show.slug}`}
            rel="sponsored noopener noreferrer"
            className="w-full font-bold py-2.5 rounded-xl text-center text-sm border-2 hover:bg-red-50 transition-colors min-h-[44px] flex items-center justify-center"
            style={{ borderColor: '#E4022D', color: '#E4022D' }}
          >
            Book with See Tickets ↗
          </TrackedTicketLink>
        )}
      </div>
    </div>
  )
}
