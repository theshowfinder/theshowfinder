import Link from 'next/link'
import type { EventWithVenue } from '@/lib/types/database'

const categoryConfig: Record<string, { label: string; colour: string }> = {
  concert:  { label: 'Concert',  colour: 'bg-red-100    text-red-700'    },
  theatre:  { label: 'Theatre',  colour: 'bg-rose-100   text-rose-700'   },
  comedy:   { label: 'Comedy',   colour: 'bg-amber-100  text-amber-700'  },
  sports:   { label: 'Sports',   colour: 'bg-green-100  text-green-700'  },
  family:   { label: 'Family',   colour: 'bg-sky-100    text-sky-700'    },
}

const statusConfig: Record<string, { label: string; colour: string }> = {
  on_sale:   { label: 'On Sale',     colour: 'bg-emerald-500 text-white' },
  upcoming:  { label: 'Coming Soon', colour: 'bg-slate-600   text-white' },
  sold_out:  { label: 'Sold Out',    colour: 'bg-red-600     text-white' },
  cancelled: { label: 'Cancelled',   colour: 'bg-red-600     text-white' },
  postponed: { label: 'Postponed',   colour: 'bg-orange-500  text-white' },
}

const categoryEmoji: Record<string, string> = {
  concert: '🎵', theatre: '🎭', comedy: '😂', sports: '⚽', family: '🎠',
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
  })
}

function formatPrice(from: number | null, to: number | null, currency: string) {
  if (!from) return null
  const sym = currency === 'GBP' ? '£' : currency
  if (to && to !== from) return `${sym}${from} – ${sym}${to}`
  return `From ${sym}${from}`
}

interface Props {
  event: EventWithVenue
}

export default function EventCard({ event }: Props) {
  const cat       = categoryConfig[event.category] ?? categoryConfig.concert
  const status    = statusConfig[event.status]     ?? statusConfig.upcoming
  const eventHref = `/events/${event.slug}`
  const isSoldOut = event.status === 'sold_out' || event.status === 'cancelled'

  return (
    <div className="group flex flex-col rounded-2xl overflow-hidden bg-white border border-slate-200 shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200">

      {/* Image — CSS background-image avoids React hydration / onError race conditions */}
      <Link href={`/events/${event.slug}`} className="relative h-48 bg-slate-100 block overflow-hidden">
        {event.image_url ? (
          <div
            className="absolute inset-0 bg-cover bg-center transition-transform duration-300 group-hover:scale-105"
            style={{ backgroundImage: `url("${event.image_url}")` }}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-5xl bg-slate-50">
            {categoryEmoji[event.category] ?? '🎟️'}
          </div>
        )}
        {status.label !== 'Coming Soon' && (
          <span className={`absolute top-3 right-3 text-xs font-bold px-2.5 py-1 rounded-full ${status.colour}`}>
            {status.label}
          </span>
        )}
      </Link>

      {/* Body */}
      <div className="flex flex-col flex-1 p-4 gap-2">
        <span className={`self-start text-xs font-bold px-2.5 py-0.5 rounded-full ${cat.colour}`}>
          {cat.label}
        </span>

        <Link href={`/events/${event.slug}`} className="block">
          <h3 className="font-bold text-slate-900 text-base leading-snug line-clamp-2 hover:opacity-80 transition-opacity">
            {event.title}
          </h3>
        </Link>

        <div className="flex flex-col gap-1 text-sm text-slate-500">
          <span>📅 {formatDate(event.start_date)}</span>
          <span className="truncate">📍 {event.venue_name}, {event.venue_city}</span>
        </div>

        {formatPrice(event.price_from, event.price_to, event.currency) && (
          <div className="flex items-center justify-between pt-2 border-t border-slate-100 mt-auto">
            <span className="text-sm font-bold text-slate-800">
              {formatPrice(event.price_from, event.price_to, event.currency)}
            </span>
          </div>
        )}

        {isSoldOut ? (
          <div className="w-full bg-slate-200 text-slate-500 font-bold py-3 rounded-xl text-center text-sm cursor-not-allowed">
            {event.status === 'cancelled' ? 'Cancelled' : 'Sold Out'}
          </div>
        ) : (
          <Link
            href={eventHref}
            className="w-full text-white font-bold py-3 rounded-xl text-center text-sm hover:opacity-90 active:scale-95 transition-all duration-150 min-h-[48px] flex items-center justify-center"
            style={{ backgroundColor: '#E8003D' }}
          >
            Get Tickets
          </Link>
        )}
      </div>
    </div>
  )
}
