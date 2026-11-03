import Link from 'next/link'
import type { EventWithVenue } from '@/lib/types/database'
import type { Show } from '@/lib/shows'
import { eventImageUrl } from '@/lib/eventImages'
import { displayTitle, venueLabel } from '@/lib/displayTitle'

// Homepage card shapes (Nov 2026): each section gets its own look so the page reads like a magazine, not one long
// shelf of identical white cards. All server components; images are CSS backgrounds like the rest of the site.

const tz = 'Europe/London'
const dayShort = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { weekday: 'short', timeZone: tz })
const dayNum = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', timeZone: tz })
const monShort = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { month: 'short', timeZone: tz })
const dateLine = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: tz })
const pounds = (n: number | null | undefined) => n == null ? null : `£${Number(n).toFixed(Number(n) % 1 ? 2 : 0)}`
const img = (e: Pick<EventWithVenue, 'image_url' | 'category' | 'title'>) => eventImageUrl(e.image_url, e.category, e.title)

/** Picture with text over the bottom: the base of every new card. */
function Overlay({ href, image, children, className = '', top }: { href: string; image: string; children: React.ReactNode; className?: string; top?: React.ReactNode }) {
  return (
    <Link href={href} className={`group relative block overflow-hidden rounded-2xl bg-slate-900 shadow-sm hover:shadow-xl transition-shadow ${className}`}>
      <span className="absolute inset-0 bg-cover bg-center transition-transform duration-500 group-hover:scale-105" style={{ backgroundImage: `url("${image}")` }} />
      <span className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent" />
      {top && <span className="absolute top-3 left-3 right-3 flex flex-wrap gap-1.5">{top}</span>}
      <span className="absolute inset-x-0 bottom-0 p-4 sm:p-5 text-white">{children}</span>
    </Link>
  )
}

const chip = (text: string, style: React.CSSProperties) => <span className="text-[11px] font-extrabold uppercase tracking-wide rounded-full px-2.5 py-1" style={style}>{text}</span>

/** West End: a tall theatre poster. */
export function PosterCard({ show }: { show: Show }) {
  const price = pounds(show.priceFrom)
  return (
    <Overlay href={`/west-end/${show.slug}`} image={eventImageUrl(show.imageUrl, 'theatre', show.title)} className="aspect-[2/3]"
      top={<>
        {show.status === 'sold_out' && chip('Sold out', { backgroundColor: '#dc2626', color: '#fff' })}
        {price && <span className="ml-auto text-xs font-extrabold rounded-full bg-white text-slate-900 px-2.5 py-1 shadow">From {price}</span>}
      </>}>
      <span className="block text-base sm:text-lg font-extrabold leading-tight line-clamp-2">{show.title}</span>
      <span className="block text-xs text-white/75 mt-1 truncate">{show.venueName}</span>
      <span className="block text-xs font-bold text-white/85 mt-1.5">Next: {dateLine(show.nextDate)}</span>
    </Overlay>
  )
}

/** Events This Week: the week's biggest show large, the next few as a guide-style list. */
export function WeekFeature({ events }: { events: EventWithVenue[] }) {
  const [lead, ...rest] = events
  if (!lead) return null
  return (
    <div className="grid gap-5 lg:grid-cols-[1.35fr_1fr]">
      <Overlay href={`/events/${lead.slug}`} image={img(lead)} className="min-h-[300px] sm:min-h-[380px]"
        top={chip(`${dayShort(lead.start_date)} ${dayNum(lead.start_date)} ${monShort(lead.start_date)}`, { backgroundColor: '#E8003D', color: '#fff' })}>
        <span className="block text-xs font-bold uppercase tracking-widest text-white/70">This week&apos;s big one</span>
        <span className="block text-2xl sm:text-3xl font-extrabold leading-tight mt-1 line-clamp-2">{displayTitle(lead.title)}</span>
        <span className="block text-sm text-white/80 mt-1 truncate">{venueLabel(lead.venue_name, lead.venue_city)}</span>
        <span className="mt-3 inline-flex rounded-xl px-4 py-2 text-sm font-extrabold" style={{ backgroundColor: '#E8003D' }}>Get tickets →</span>
      </Overlay>
      <ul className="divide-y divide-slate-200 rounded-2xl bg-white border border-slate-200 overflow-hidden">
        {rest.slice(0, 5).map(e => (
          <li key={e.id}>
            <Link href={`/events/${e.slug}`} className="flex items-center gap-4 px-4 py-3.5 hover:bg-slate-50 transition-colors">
              <span className="w-12 shrink-0 text-center">
                <span className="block text-[11px] font-bold uppercase text-slate-400">{dayShort(e.start_date)}</span>
                <span className="block text-2xl font-extrabold leading-none text-slate-900">{dayNum(e.start_date)}</span>
                <span className="block text-[11px] font-bold uppercase text-slate-400">{monShort(e.start_date)}</span>
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-bold text-slate-900 leading-snug line-clamp-2">{displayTitle(e.title)}</span>
                <span className="block text-sm text-slate-500 truncate">{venueLabel(e.venue_name, e.venue_city)}</span>
              </span>
              <span className="text-lg font-bold" style={{ color: '#E8003D' }} aria-hidden>→</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Just Announced: wide news-style card with a NEW badge and when tickets go on sale. */
export function AnnouncedCard({ event }: { event: EventWithVenue }) {
  const onSale = event.presale_start && (!event.public_onsale_start || event.presale_start < event.public_onsale_start) ? { at: event.presale_start, label: 'Presale' } : event.public_onsale_start ? { at: event.public_onsale_start, label: 'On sale' } : null
  const when = onSale ? new Date(onSale.at).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: tz }).replace(':00', '') : null
  return (
    <Overlay href={`/events/${event.slug}`} image={img(event)} className="aspect-[16/11]"
      top={<>{chip('New', { backgroundColor: '#E8003D', color: '#fff' })}{when && chip(`${onSale!.label} ${when}`, { backgroundColor: '#fff', color: '#0f172a' })}</>}>
      <span className="block text-xl font-extrabold leading-tight line-clamp-2">{displayTitle(event.title)}</span>
      <span className="block text-sm text-white/75 mt-1 truncate">{venueLabel(event.venue_name, event.venue_city)} · {dateLine(event.start_date)}</span>
    </Overlay>
  )
}

/** Gigsberg band: resale tickets listed now, with the resale from-price. */
export function ResaleCard({ event }: { event: EventWithVenue & { resale_from?: number | null } }) {
  const from = pounds(event.resale_from)
  return (
    <Overlay href={`/events/${event.slug}`} image={img(event)} className="aspect-[4/5]"
      top={chip(from ? `Resale from ${from}` : 'Tickets listed now', { backgroundColor: '#FFD23F', color: '#1a1f6e' })}>
      <span className="block text-lg font-extrabold leading-tight line-clamp-2">{displayTitle(event.title)}</span>
      <span className="block text-xs text-white/75 mt-1 truncate">{venueLabel(event.venue_name, event.venue_city)}</span>
      <span className="block text-xs font-bold text-white/85 mt-1">{dateLine(event.start_date)}</span>
    </Overlay>
  )
}

/** Featured: one large tile and four small ones, text over the pictures. */
export function FeaturedGrid({ events }: { events: EventWithVenue[] }) {
  const [big, ...small] = events.slice(0, 5)
  if (!big) return null
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 lg:grid-rows-2 gap-4">
      <Overlay href={`/events/${big.slug}`} image={img(big)} className="col-span-2 lg:row-span-2 min-h-[280px] lg:min-h-[460px]">
        <span className="block text-xs font-bold uppercase tracking-widest text-white/70">{dateLine(big.start_date)}</span>
        <span className="block text-2xl sm:text-4xl font-extrabold leading-tight mt-1 line-clamp-2">{displayTitle(big.title)}</span>
        <span className="block text-sm text-white/80 mt-1 truncate">{venueLabel(big.venue_name, big.venue_city)}</span>
      </Overlay>
      {small.map(e => (
        <Overlay key={e.id} href={`/events/${e.slug}`} image={img(e)} className="min-h-[170px] lg:min-h-0">
          <span className="block text-[11px] font-bold uppercase tracking-widest text-white/70">{dateLine(e.start_date)}</span>
          <span className="block text-base font-extrabold leading-tight mt-0.5 line-clamp-2">{displayTitle(e.title)}</span>
          <span className="block text-xs text-white/75 truncate">{e.venue_city}</span>
        </Overlay>
      ))}
    </div>
  )
}
