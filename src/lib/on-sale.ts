import type { EventWithVenue, Artist } from './types/database'

export type SaleType = 'presale' | 'onsale'

export type OnSaleGroup = {
  artistName: string
  slug:        string
  image_url:   string | null
  onsale_date: string    // earliest actionable sale date for the group — a presale
                          // start if one exists and is sooner, otherwise the public
                          // on-sale start. See saleType for which kind it is.
  saleType:    SaleType
  events:      EventWithVenue[]
  dbArtist:    Artist | null
}

// Strip tour/venue suffix from Ticketmaster-style titles:
// "Taylor Swift | The Eras Tour"               → "Taylor Swift"
// "Coldplay: Music of the Spheres"             → "Coldplay"
// "Lewis Capaldi - Broken By Desire"           → "Lewis Capaldi"
// "Theory of a Deadman "The Barricade Tour""   → "Theory of a Deadman"
// "Harry Styles"                               → "Harry Styles"
export function extractArtistName(title: string): string {
  return title.split(/\s+\|\s+|\s*:\s+|\s+[-–—]\s+|\s+"[^"]+"/)[0].trim()
}

export function toSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim()
}

// An event can go "on sale" in two ways: a presale window (fan club, venue,
// card member, etc.) or the general public on-sale. Whichever comes first is
// the one that actually matters to someone trying to catch tickets early, so
// this picks the earliest of the two and tags which kind it is.
function earliestSale(event: EventWithVenue): { date: string; type: SaleType } | null {
  const publicDate = event.public_onsale_start ?? event.onsale_date ?? null
  const presaleDate = event.presale_start ?? null

  if (presaleDate && publicDate) {
    return presaleDate <= publicDate
      ? { date: presaleDate, type: 'presale' }
      : { date: publicDate, type: 'onsale' }
  }
  if (presaleDate) return { date: presaleDate, type: 'presale' }
  if (publicDate)  return { date: publicDate,  type: 'onsale' }
  return null
}

export function groupEventsByArtist(
  events:  EventWithVenue[],
  artists: Artist[],
): OnSaleGroup[] {
  const artistByName = new Map(artists.map(a => [a.name.toLowerCase(), a]))
  const groupMap     = new Map<string, OnSaleGroup>()

  for (const event of events) {
    const artistName = extractArtistName(event.title)
    const slug       = toSlug(artistName)
    const dbArtist   = artistByName.get(artistName.toLowerCase()) ?? null
    const sale       = earliestSale(event)

    const existing = groupMap.get(slug)
    if (!existing) {
      groupMap.set(slug, {
        artistName,
        slug,
        image_url:   dbArtist?.image_url ?? event.image_url,
        onsale_date: sale?.date ?? new Date().toISOString(),
        saleType:    sale?.type ?? 'onsale',
        events:      [event],
        dbArtist,
      })
    } else {
      existing.events.push(event)
      if (sale && sale.date < existing.onsale_date) {
        existing.onsale_date = sale.date
        existing.saleType    = sale.type
      }
      if (!existing.image_url) {
        existing.image_url = dbArtist?.image_url ?? event.image_url
      }
    }
  }

  return [...groupMap.values()].sort((a, b) =>
    a.onsale_date.localeCompare(b.onsale_date)
  )
}

export function fmtOnSaleLabel(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short',
    hour: '2-digit', minute: '2-digit',
  }).replace(',', '') + ' GMT'
}
