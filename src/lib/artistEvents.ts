// Artist pages: which events an artist has coming up, and whether the page is
// worth indexing / listing in the sitemap. Pure logic only (no '@/' imports) so
// it runs under plain `node --test`.
//
// Background: the artist page used to read only from tours/tour_dates, which
// are filled for just a couple of hand-curated artists. Every other artist
// page said "No dates announced yet" even when the artist had shows booked, so
// Google saw thousands of near-empty pages. The real data is event_artists ->
// events, which this module shapes into list rows.

export interface ArtistEventRow {
  id: string
  slug: string
  title: string
  startDate: string
  status: string
  venueName: string | null
  venueCity: string | null
  category?: string | null
}

// Shape of one `event_artists` row as returned by PostgREST for
// `select('is_headliner, events!inner(id, slug, title, start_date, status, venue:venues(name, city))')`.
export interface ArtistEventLink {
  events:
    | {
        id: string
        slug: string
        title: string
        start_date: string
        status: string
        category?: string | null
        venue: { name: string; city: string } | null
      }
    | null
}

// Flatten, drop rows with no joined event, de-duplicate by event id (an artist
// can be linked to the same event twice, e.g. headliner + support) and sort
// soonest first.
export function toArtistEventRows(links: ArtistEventLink[] | null | undefined): ArtistEventRow[] {
  const seen = new Set<string>()
  const rows: ArtistEventRow[] = []
  for (const link of links ?? []) {
    const e = link.events
    if (!e || seen.has(e.id)) continue
    seen.add(e.id)
    rows.push({
      id: e.id,
      slug: e.slug,
      title: e.title,
      startDate: e.start_date,
      status: e.status,
      venueName: e.venue?.name ?? null,
      venueCity: e.venue?.city ?? null,
      category: e.category ?? null,
    })
  }
  return rows.sort((a, b) => a.startDate.localeCompare(b.startDate))
}

// An artist page with nothing to show (no upcoming events and no curated tour
// dates) is a thin page: keep it out of Google's index until there is something
// on it. `follow` stays true so links on it still count.
export function shouldIndexArtistPage(input: { upcomingEvents: number; tourDates: number }): boolean {
  return input.upcomingEvents > 0 || input.tourDates > 0
}

// Sitemap entry rule. A one-show artist's page mostly duplicates that show's
// own page, so it is left out of the sitemap (it is still reachable and
// indexable via links). Curated artists (featured / with a tour) and artists
// with two or more upcoming events are listed. Blank names are never listed.
export function shouldListArtistInSitemap(input: {
  name: string | null | undefined
  upcomingEvents: number
  isFeatured?: boolean | null
  hasTour?: boolean
}): boolean {
  if (!input.name || input.name.trim().length < 2) return false
  if (input.isFeatured || input.hasTour) return true
  return input.upcomingEvents >= 2
}

export function artistMetaDescription(name: string, upcoming: ArtistEventRow[]): string {
  if (upcoming.length === 0) {
    return `Find ${name} UK tour dates and compare ticket prices from all major providers including Ticketmaster, See Tickets and resale sites.`
  }
  const first = upcoming[0]
  const when = new Date(first.startDate).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/London',
  })
  const where = first.venueCity ? ` in ${first.venueCity}` : ''
  const count = upcoming.length === 1
    ? `${name} plays ${first.venueName ?? 'the UK'}${where} on ${when}.`
    : `${upcoming.length} upcoming UK dates, next ${when}${where}.`
  return `${name} UK tour dates and tickets. ${count} Compare prices from Ticketmaster, See Tickets and resale sites.`
}

// ── Profile info that needs no outside source ────────────────────────────────
// Every artist page gets a factual "about" line and a genre label built from our
// own event data, so no page is ever a bare list of dates even before (or
// without) a Wikipedia bio. It only states what the data shows.

const CATEGORY_LABELS: Record<string, string> = {
  concert: 'Live music',
  comedy: 'Comedy',
  theatre: 'Theatre',
  sports: 'Sport',
  family: 'Family',
}

// The most common event category across the artist's upcoming shows, as a label.
export function fallbackGenreLabel(rows: ArtistEventRow[]): string | null {
  const counts = new Map<string, number>()
  for (const r of rows) if (r.category && CATEGORY_LABELS[r.category]) counts.set(r.category, (counts.get(r.category) ?? 0) + 1)
  let best: string | null = null
  for (const [cat, n] of counts) if (!best || n > (counts.get(best) ?? 0)) best = cat
  return best ? CATEGORY_LABELS[best] : null
}

function longDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/London' })
}

// "Will Young has 2 upcoming UK dates, from 16 March 2027 (The London Palladium, London)
// to 18 March 2027 (O2 Apollo Manchester, Manchester)." Empty string when no dates.
export function buildArtistSummary(name: string, rows: ArtistEventRow[]): string {
  if (rows.length === 0) return ''
  const first = rows[0]
  const last = rows[rows.length - 1]
  const at = (r: ArtistEventRow) => [r.venueName, r.venueCity].filter(Boolean).join(', ')
  const cities = [...new Set(rows.map(r => r.venueCity).filter((c): c is string => !!c))]
  if (rows.length === 1) {
    const where = at(first)
    return `${name} plays the UK on ${longDate(first.startDate)}${where ? ` at ${where}` : ''}.`
  }
  const span = `from ${longDate(first.startDate)}${at(first) ? ` (${at(first)})` : ''} to ${longDate(last.startDate)}${at(last) ? ` (${at(last)})` : ''}`
  const cityPart = cities.length > 1
    ? ` across ${cities.length} cities including ${cities.slice(0, 3).join(', ')}`
    : ''
  return `${name} has ${rows.length} upcoming UK dates, ${span}${cityPart}.`
}
