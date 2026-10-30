import Link from 'next/link'
import { displayTitle, londonTimeSuffix, venueLabel } from '@/lib/displayTitle'
import type { EventWithVenue } from '@/lib/types/database'
import { ticketPurchaseDisabledStatus } from '@/lib/eventPools'
import { eventImageUrl } from '@/lib/eventImages'
import SaveButton from '@/components/SaveButton'

const categoryConfig: Record<string, { label: string; colour: string }> = {
  concert:  { label: 'Concert',  colour: 'bg-red-100    text-red-700'    },
  theatre:  { label: 'Theatre',  colour: 'bg-rose-100   text-rose-700'   },
  comedy:   { label: 'Comedy',   colour: 'bg-amber-100  text-amber-700'  },
  sports:   { label: 'Sports',   colour: 'bg-green-100  text-green-700'  },
  family:   { label: 'Family',   colour: 'bg-sky-100    text-sky-700'    },
  local:    { label: 'Local',    colour: 'bg-purple-100 text-purple-700' },
}

const statusConfig: Record<string, { label: string; colour: string }> = {
  on_sale:   { label: 'On Sale',     colour: 'bg-emerald-500 text-white' },
  upcoming:  { label: 'Coming Soon', colour: 'bg-slate-600   text-white' },
  sold_out:  { label: 'Sold Out',    colour: 'bg-red-600     text-white' },
  cancelled: { label: 'Cancelled',   colour: 'bg-red-600     text-white' },
  postponed: { label: 'Postponed',   colour: 'bg-orange-500  text-white' },
}

const categoryEmoji: Record<string, string> = {
  concert: '🎵', theatre: '🎭', comedy: '😂', sports: '⚽', family: '🎠', local: '📍',
}

function formatDate(iso: string) {
  // The time is shown so matinee and evening performances of one show on the same
  // day are not two identical-looking cards.
  return new Date(iso).toLocaleDateString('en-GB', { timeZone: 'Europe/London',
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
  }) + londonTimeSuffix(iso)
}

function formatPrice(from: number | null, to: number | null, currency: string) {
  if (!from) return null
  const sym = currency === 'GBP' ? '£' : currency
  if (to && to !== from) return `${sym}${from} – ${sym}${to}`
  return `From ${sym}${from}`
}

/** Set when a tile stands for a whole run or tour. */
export interface RunInfo {
  dateCount: number
  lastDate: string
  cityCount: number
  /** The visitor's city when this tile's date is theirs, else null. */
  homeCity: string | null
  homeDates: number
  /** Next few other cities (never the one shown), and how many more beyond those. */
  alsoIn: string[]
  alsoMore: number
}

interface Props {
  event: EventWithVenue
  run?: RunInfo
}

function shortDay(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { timeZone: 'Europe/London', day: 'numeric', month: 'short', year: 'numeric' })
}

export default function EventCard({ event, run }: Props) {
  const isRun = !!run && run.dateCount > 1
  const cat       = categoryConfig[event.category] ?? categoryConfig.concert
  const status    = statusConfig[event.status]     ?? statusConfig.upcoming
  const eventHref = `/events/${event.slug}`
  // Same shared predicate as the event detail page (eventPools.ts) —
  // a postponed event's card must not look identically buyable to an
  // on-sale one.
  const isSoldOut = ticketPurchaseDisabledStatus(event.status)
  const imageUrl   = eventImageUrl(event.image_url, event.category, event.title)

  return (
    <div className="group relative flex flex-col rounded-2xl overflow-hidden bg-white border border-slate-200 shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200">

      {/* Image — CSS background-image avoids React hydration / onError race conditions */}
      <Link href={`/events/${event.slug}`} className="relative h-48 bg-slate-100 block overflow-hidden">
        {imageUrl ? (
          <div
            className="absolute inset-0 bg-cover bg-center transition-transform duration-300 group-hover:scale-105"
            style={{ backgroundImage: `url("${imageUrl}")` }}
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

      {/* Save (heart) — sits over the artwork, top-left */}
      <div className="absolute top-3 left-3 z-10">
        <SaveButton slug={event.slug} title={event.title} variant="card" />
      </div>

      {/* Body */}
      <div className="flex flex-col flex-1 p-4 gap-2">
        <span className={`self-start text-xs font-bold px-2.5 py-0.5 rounded-full ${cat.colour}`}>
          {cat.label}
        </span>

        <Link href={`/events/${event.slug}`} className="block">
          <h3 className="font-bold text-slate-900 text-base leading-snug line-clamp-2 hover:opacity-80 transition-opacity">
            {displayTitle(event.title)}
          </h3>
        </Link>

        <div className="flex flex-col gap-1 text-sm text-slate-500">
          <span>📅 {isRun && !run!.homeCity ? 'Next: ' : ''}{formatDate(event.start_date)}</span>
          {event.venue_slug ? (
            <Link
              href={`/venues/${event.venue_slug}`}
              className="truncate hover:underline hover:text-slate-700 transition-colors"
            >
              📍 {venueLabel(event.venue_name, event.venue_city)}
            </Link>
          ) : (
            <span className="truncate">📍 {venueLabel(event.venue_name, event.venue_city)}</span>
          )}
          {isRun && run!.homeCity && run!.homeDates > 1 && (
            <span className="font-semibold text-slate-700">+ {run!.homeDates - 1} more date{run!.homeDates - 1 === 1 ? '' : 's'} in {run!.homeCity}</span>
          )}
          {isRun && (
            <span className="font-semibold text-slate-700">
              🎟️ {run!.dateCount} dates{run!.cityCount > 1 ? ` · ${run!.cityCount} cities` : ` · to ${shortDay(run!.lastDate)}`}
            </span>
          )}
          {isRun && run!.alsoIn.length > 0 && (
            <span className="truncate text-xs">Also: {run!.alsoIn.join(', ')}{run!.alsoMore > 0 ? ` +${run!.alsoMore}` : ''}</span>
          )}
        </div>

        {/* Gigsberg has tickets listed: say so on the card, so a sold-out or not-yet-on-sale show still has a way in. */}
        {event.gigsberg_inventory_status === 'available' && (
          <span className="self-start text-xs font-bold px-2.5 py-1 rounded-full text-white" style={{ backgroundColor: '#1a1f6e' }}>
            Resale{event.resale_from ? ` from £${Number(event.resale_from).toFixed(Number(event.resale_from) % 1 ? 2 : 0)}` : ' tickets listed'}
          </span>
        )}

        {formatPrice(event.price_from, event.price_to, event.currency) && (
          <div className="flex items-center justify-between pt-2 border-t border-slate-100 mt-auto">
            <span className="text-sm font-bold text-slate-800">
              {formatPrice(event.price_from, event.price_to, event.currency)}
            </span>
          </div>
        )}

        {isSoldOut && event.status !== 'sold_out' ? (
          <div className="w-full bg-slate-200 text-slate-500 font-bold py-3 rounded-xl text-center text-sm cursor-not-allowed">
            {event.status === 'cancelled' ? 'Cancelled' : 'Postponed'}
          </div>
        ) : (
          <Link
            href={eventHref}
            className="w-full text-white font-bold py-3 rounded-xl text-center text-sm hover:opacity-90 active:scale-95 transition-all duration-150 min-h-[48px] flex items-center justify-center"
            style={{ backgroundColor: event.status === 'sold_out' ? '#1a1f6e' : '#E8003D' }}
          >
            {event.status === 'sold_out' ? 'Sold out · see resale tickets' : isRun ? 'See dates & tickets' : 'Get Tickets'}
          </Link>
        )}
      </div>
    </div>
  )
}
