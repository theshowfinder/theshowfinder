// Share-with-friends helpers: the pre-written message, tracked links per
// channel, and the per-channel share URLs (WhatsApp, Facebook, X, email).
//
// Pure module (no '@/' imports) so it runs under `node --test`.

export type ShareChannel = 'native' | 'copy' | 'whatsapp' | 'facebook' | 'x' | 'email'

export interface ShareInput {
  title: string
  venueName?: string | null
  city?: string | null
  /** ISO start time; shown in London time with BST/GMT. */
  startISO?: string | null
  status?: string | null
}

const TZ = 'Europe/London'

// "Sat 18 Oct, 19:30 BST". Midnight in London is treated as "time not
// known" and shows the date only, rather than a misleading 00:00.
export function formatShareWhen(startISO: string | null | undefined): string | null {
  if (!startISO) return null
  const d = new Date(startISO)
  if (Number.isNaN(d.getTime())) return null
  const date = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short' }).format(d)
  const hm = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }).format(d)
  if (hm === '00:00' || hm === '24:00') return date
  const time = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', timeZoneName: 'short' }).format(d)
  return `${date}, ${time}`
}

// The sentence that goes before the link.
export function buildShareText(input: ShareInput): string {
  const where = [input.venueName, input.city].filter((p): p is string => !!p && p.trim().length > 0)
  const when = formatShareWhen(input.startISO)
  const details = [...where, ...(when ? [when] : [])].join(', ')
  const base = details ? `${input.title}, ${details}` : input.title
  if (input.status === 'sold_out') return `${base}. Sold out at the box office, but worth checking resale:`
  if (input.status === 'cancelled') return `${base} has been cancelled.`
  if (input.status === 'postponed') return `${base} has been postponed.`
  return `Fancy this? ${base}. Find tickets:`
}

// Message for sharing an artist (or venue) page rather than a single show.
export function buildArtistShareText(name: string, upcomingCount: number): string {
  if (upcomingCount > 1) return `${name} has ${upcomingCount} UK dates coming up. Find tickets:`
  if (upcomingCount === 1) return `${name} is playing the UK soon. Find tickets:`
  return `Have a look at ${name} on TheShowFinder:`
}

// Tracked copy of the page URL for a channel. The canonical URL (in <head>
// and the sitemap) never carries these parameters.
export function trackedShareUrl(url: string, channel: ShareChannel): string {
  const sep = url.includes('?') ? '&' : '?'
  return `${url}${sep}utm_source=share&utm_medium=${channel}&utm_campaign=event_share`
}

export function whatsappHref(text: string, url: string): string {
  return `https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`
}

export function facebookHref(url: string): string {
  return `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`
}

export function xHref(text: string, url: string): string {
  return `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`
}

export function mailtoHref(subject: string, text: string, url: string): string {
  return `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(`${text}\n\n${url}`)}`
}

// Text for the 1200x630 share card. next/og only ships a Latin font; any other
// character (emoji, symbols, CJK, zero-width or variation-selector marks that
// are invisible in the title) makes it try to download a "dynamic font" and log
// "Failed to download dynamic font. Status: 400". Keep Latin letters, digits,
// common punctuation and currency; drop the rest.
export function cardSafeText(value: string | null | undefined): string {
  return (value ?? '')
    .normalize('NFC')
    .replace(/[‘’‛]/g, "'")
    .replace(/[“”„]/g, '"')
    .replace(/[^ -~ -ɏ‐-―•…€]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}
