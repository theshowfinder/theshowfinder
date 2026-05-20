import type { EventWithVenue, Artist } from './types/database'

export type OnSaleGroup = {
  artistName: string
  slug:        string
  image_url:   string | null
  onsale_date: string
  events:      EventWithVenue[]
  dbArtist:    Artist | null
}

// Strip tour/venue suffix from Ticketmaster-style titles:
// "Taylor Swift | The Eras Tour" → "Taylor Swift"
// "Coldplay: Music of the Spheres" → "Coldplay"
// "Lewis Capaldi - Broken By Desire" → "Lewis Capaldi"
// "Harry Styles" → "Harry Styles"
export function extractArtistName(title: string): string {
  return title.split(/\s+\|\s+|\s*:\s+|\s+[-–—]\s+/)[0].trim()
}

export function toSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim()
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

    const existing = groupMap.get(slug)
    if (!existing) {
      groupMap.set(slug, {
        artistName,
        slug,
        image_url:   dbArtist?.image_url ?? event.image_url,
        onsale_date: event.onsale_date ?? new Date().toISOString(),
        events:      [event],
        dbArtist,
      })
    } else {
      existing.events.push(event)
      if (event.onsale_date && event.onsale_date < existing.onsale_date) {
        existing.onsale_date = event.onsale_date
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
