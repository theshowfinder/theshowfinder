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

// Tonight's own row — deliberately a compact, text-focused list row
// rather than the big image-led cards the rest of the site uses
// (EventCard), so "Tonight" reads like a quick agenda someone can scan
// in a few seconds, not another grid of cards to browse. Follows a
// stricter, explicit ticket-link policy (ticketLinkPolicy.ts): only
// real, event- or artist-specific links are ever shown, neutrally
// worded, and never claiming availability the data doesn't confirm — a
// status badge only appears when event.status itself says so (e.g.
// "Sold Out"), never invented copy.
export default function TonightEventCard({ event, artists }: { event: TonightEvent; artists: Artist[] }) {
  const offers = buildTonightTicketOffers(event, artists)
  const status = statusConfig[event.status] ?? null

  return (
    <div className="flex flex-wrap items-center gap-3 px-5 py-3.5">
      <span className="text-sm font-bold text-slate-900 tabular-nums w-14 shrink-0">
        {fmtTime(event.start_date)}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <Link href={`/events/${event.slug}`} className="font-bold text-slate-900 text-sm leading-snug hover:text-red-600 transition-colors truncate">
            {event.title}
          </Link>
          {status && (
            <span className={`shrink-0 text-xs font-bold px-2 py-0.5 rounded-full ${status.classes}`}>{status.label}</span>
          )}
        </div>
        <p className="text-xs text-slate-500 truncate">
          {event.venue_slug ? (
            <Link href={`/venues/${event.venue_slug}`} className="hover:underline hover:text-slate-700 transition-colors">
              {event.venue_name}
            </Link>
          ) : (
            event.venue_name
          )}
        </p>
      </div>

      <div className="flex flex-wrap gap-2 shrink-0">
        {offers.length > 0 ? (
          offers.map(offer => (
            <a
              key={offer.kind}
              href={offer.href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-bold px-3 py-1.5 rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors whitespace-nowrap"
            >
              {offer.label}
            </a>
          ))
        ) : (
          <Link
            href={`/events/${event.slug}`}
            className="text-xs font-bold px-3 py-1.5 rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors whitespace-nowrap"
          >
            View event
          </Link>
        )}
      </div>
    </div>
  )
}
