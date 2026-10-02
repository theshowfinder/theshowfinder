import Link from 'next/link'
import type { Artist } from '@/lib/types/database'
import type { TonightEvent } from '@/lib/eventPools.ts'
import { buildTonightTicketOffers } from '@/lib/ticketLinkPolicy'

const statusConfig: Record<string, { label: string; classes: string }> = {
  sold_out: { label: 'Sold Out', classes: 'bg-red-600 text-white' },
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit' })
}

// Tonight's own card — deliberately separate from the general EventCard,
// which always shows a single internal "Get Tickets" button regardless of
// what links actually exist. Tonight follows a stricter, explicit policy
// (ticketLinkPolicy.ts): only real, event- or artist-specific links are
// ever shown, neutrally worded, and never claiming availability the data
// doesn't confirm — a status badge only appears when event.status itself
// says so (e.g. "Sold Out"), never invented copy.
export default function TonightEventCard({ event, artists }: { event: TonightEvent; artists: Artist[] }) {
  const offers = buildTonightTicketOffers(event, artists)
  const status = statusConfig[event.status] ?? null

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <Link href={`/events/${event.slug}`} className="block min-w-0">
          <h3 className="font-extrabold text-slate-900 text-base leading-snug hover:text-red-600 transition-colors">
            {event.title}
          </h3>
        </Link>
        {status && (
          <span className={`shrink-0 text-xs font-bold px-2.5 py-1 rounded-full ${status.classes}`}>{status.label}</span>
        )}
      </div>

      <p className="text-sm text-slate-500">
        🕗 {fmtTime(event.start_date)} ·{' '}
        {event.venue_slug ? (
          <Link href={`/venues/${event.venue_slug}`} className="hover:underline hover:text-slate-700 transition-colors">
            {event.venue_name}
          </Link>
        ) : (
          event.venue_name
        )}
      </p>

      {offers.length > 0 ? (
        <div className="flex flex-wrap gap-2 mt-1">
          {offers.map(offer => (
            <a
              key={offer.kind}
              href={offer.href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-bold px-3 py-1.5 rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors"
            >
              {offer.label}
            </a>
          ))}
        </div>
      ) : (
        <Link
          href={`/events/${event.slug}`}
          className="text-xs font-bold px-3 py-1.5 rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors self-start"
        >
          View event
        </Link>
      )}
    </div>
  )
}
