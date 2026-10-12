import type { MetadataRoute } from 'next'
import { createPublicClient } from '@/lib/supabase/public'
import { getArtistSeoAlias, getEventSeoAlias } from '@/lib/seoAliases'
import { CITIES } from '@/lib/cities'
import { fetchWestEndShows } from '@/lib/showPool'
import { LIVE_EVENT_STATUSES } from '@/lib/eventPools'
import { shouldListArtistInSitemap } from '@/lib/artistEvents'

// Regenerated at most hourly (the sitemap was dynamic before; once public pages
// stopped using cookies it became a static file frozen at build time).
export const revalidate = 3600

export const maxDuration = 60

const BASE = 'https://www.theshowfinder.com'

// Supabase's PostgREST layer caps any single request at 1000 rows
// regardless of the .limit() passed in the query — the previous version of
// this file asked for up to 5000/2000/1000 rows per table but silently
// only ever got the first 1000 back every time. With 25,000+ upcoming
// events and 4,000+ artists, that meant well over half the site's pages
// were never in the sitemap at all. The three fetchAll* helpers below page
// through in parallel batches of 1000 instead, so every row makes it in
// regardless of table size — nothing here needs raising a Supabase project
// setting to fix, it's all done from the query side.
const PAGE_SIZE = 1000

type SlugRow        = { slug: string }
type ArtistRow      = { id: string; slug: string; name: string | null; is_featured: boolean | null }
type SlugUpdatedRow = { slug: string; updated_at: string }
type DbClient       = ReturnType<typeof createPublicClient>

async function fetchAllEvents(supabase: DbClient, nowISO: string): Promise<SlugUpdatedRow[]> {
  const { count } = await supabase
    .from('events')
    .select('*', { count: 'exact', head: true })
    .gte('start_date', nowISO)
  const total = count ?? 0
  if (total === 0) return []

  const pageCount = Math.ceil(total / PAGE_SIZE)
  const pages = await Promise.all(
    Array.from({ length: pageCount }, (_, i) => {
      const from = i * PAGE_SIZE
      return supabase
        .from('events')
        .select('slug, updated_at')
        .gte('start_date', nowISO)
        .range(from, from + PAGE_SIZE - 1) as unknown as Promise<{ data: SlugUpdatedRow[] | null }>
    }),
  )
  return pages.flatMap(p => p.data ?? [])
}

async function fetchAllVenues(supabase: DbClient): Promise<SlugRow[]> {
  const { count } = await supabase
    .from('venues')
    .select('*', { count: 'exact', head: true })
    .not('slug', 'is', null)
  const total = count ?? 0
  if (total === 0) return []

  const pageCount = Math.ceil(total / PAGE_SIZE)
  const pages = await Promise.all(
    Array.from({ length: pageCount }, (_, i) => {
      const from = i * PAGE_SIZE
      return supabase
        .from('venues')
        .select('slug')
        .not('slug', 'is', null)
        .range(from, from + PAGE_SIZE - 1) as unknown as Promise<{ data: SlugRow[] | null }>
    }),
  )
  return pages.flatMap(p => p.data ?? [])
}

async function fetchAllArtists(supabase: DbClient): Promise<ArtistRow[]> {
  const { count } = await supabase.from('artists').select('*', { count: 'exact', head: true })
  const total = count ?? 0
  if (total === 0) return []

  const pageCount = Math.ceil(total / PAGE_SIZE)
  const pages = await Promise.all(
    Array.from({ length: pageCount }, (_, i) => {
      const from = i * PAGE_SIZE
      return supabase
        .from('artists')
        .select('id, slug, name, is_featured')
        .order('id')
        .range(from, from + PAGE_SIZE - 1) as unknown as Promise<{ data: ArtistRow[] | null }>
    }),
  )
  return pages.flatMap(p => p.data ?? [])
}

// artist_id -> number of upcoming, live events they are linked to. Used to keep
// near-empty artist pages (no upcoming shows, or a single show that already has
// its own page) out of the sitemap: thousands of those were sitting at
// "Discovered - currently not indexed" in Search Console.
async function fetchArtistUpcomingCounts(supabase: DbClient, nowISO: string): Promise<Map<string, number>> {
  const { count } = await supabase
    .from('event_artists')
    .select('artist_id, events!inner(start_date, status)', { count: 'exact', head: true })
    .gte('events.start_date', nowISO)
    .in('events.status', LIVE_EVENT_STATUSES)
  const total = count ?? 0
  const counts = new Map<string, number>()
  if (total === 0) return counts

  const pageCount = Math.ceil(total / PAGE_SIZE)
  const pages = await Promise.all(
    Array.from({ length: pageCount }, (_, i) => {
      const from = i * PAGE_SIZE
      return supabase
        .from('event_artists')
        .select('artist_id, events!inner(start_date, status)')
        .gte('events.start_date', nowISO)
        .in('events.status', LIVE_EVENT_STATUSES)
        .order('event_id')
        .order('artist_id')
        .range(from, from + PAGE_SIZE - 1) as unknown as Promise<{ data: { artist_id: string }[] | null }>
    }),
  )
  for (const row of pages.flatMap(p => p.data ?? [])) {
    counts.set(row.artist_id, (counts.get(row.artist_id) ?? 0) + 1)
  }
  return counts
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const supabase = createPublicClient()
  const now      = new Date().toISOString()

  const [eventRows, venueRows, artistRows, westEndShows, artistCounts] = await Promise.all([
    fetchAllEvents(supabase, now),
    fetchAllVenues(supabase),
    fetchAllArtists(supabase),
    fetchWestEndShows(supabase),
    fetchArtistUpcomingCounts(supabase, now),
  ])

  const staticPages: MetadataRoute.Sitemap = [
    { url: BASE,                          lastModified: new Date(), changeFrequency: 'daily',   priority: 1.0 },
    { url: `${BASE}/events`,              lastModified: new Date(), changeFrequency: 'daily',   priority: 0.9 },
    { url: `${BASE}/on-sale-this-week`,   lastModified: new Date(), changeFrequency: 'daily',   priority: 0.8 },
    { url: `${BASE}/west-end`,            lastModified: new Date(), changeFrequency: 'daily',   priority: 0.9 },
    { url: `${BASE}/attractions`,         lastModified: new Date(), changeFrequency: 'daily',   priority: 0.6 },
    // Phase 5A: the editorial news hub (/news) was never in here — every
    // other static top-level page was. Individual on-sale-this-week/[slug]
    // pages are deliberately NOT added here: each one represents "this
    // week's" on-sale group for an artist and goes stale within days, so
    // indexing them long-term isn't useful the way a stable page is.
    { url: `${BASE}/news`,                lastModified: new Date(), changeFrequency: 'daily',   priority: 0.8 },
  ]

  const cityPages: MetadataRoute.Sitemap = CITIES.map(city => ({
    url:             `${BASE}/cities/${encodeURIComponent(city.name)}`,
    lastModified:    new Date(),
    changeFrequency: 'daily' as const,
    priority:        0.8,
  }))

  const cityThisWeekPages: MetadataRoute.Sitemap = CITIES.map(city => ({
    url:             `${BASE}/cities/${encodeURIComponent(city.name)}/this-week`,
    lastModified:    new Date(),
    changeFrequency: 'daily' as const,
    priority:        0.7,
  }))

  const eventPages: MetadataRoute.Sitemap = eventRows.map(e => ({
    url:             `${BASE}/events/${e.slug}`,
    lastModified:    new Date(e.updated_at),
    changeFrequency: 'weekly' as const,
    priority:        0.6,
  })).filter(e => !getEventSeoAlias(e.url.split('/').pop() ?? ''))

  // One page per West End show (not per performance).
  const westEndShowPages: MetadataRoute.Sitemap = westEndShows.map(s => ({
    url:             `${BASE}/west-end/${s.slug}`,
    lastModified:    new Date(),
    changeFrequency: 'daily' as const,
    priority:        0.8,
  }))

  // No lastModified on venue/artist URLs: we have no real "last changed" date
  // for them, and stamping every URL with "now" teaches Google to ignore the
  // field for the whole sitemap (including events, where it IS accurate).
  const venuePages: MetadataRoute.Sitemap = venueRows.map(v => ({
    url:             `${BASE}/venues/${v.slug}`,
    changeFrequency: 'weekly' as const,
    priority:        0.7,
  }))

  const artistPages: MetadataRoute.Sitemap = artistRows
    .filter(a => shouldListArtistInSitemap({
      name: a.name,
      upcomingEvents: artistCounts.get(a.id) ?? 0,
      isFeatured: a.is_featured,
    }))
    .map(a => ({
      url:             `${BASE}/artists/${a.slug}`,
      changeFrequency: 'weekly' as const,
      priority:        0.6,
    }))
    .filter(a => !getArtistSeoAlias(a.url.split('/').pop() ?? ''))

  return [...staticPages, ...cityPages, ...cityThisWeekPages, ...westEndShowPages, ...eventPages, ...venuePages, ...artistPages]
}
