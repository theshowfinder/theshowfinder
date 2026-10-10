import type { MetadataRoute } from 'next'
import { createClient } from '@/lib/supabase/server'
import { getArtistSeoAlias, getEventSeoAlias } from '@/lib/seoAliases'
import { CITIES } from '@/lib/cities'

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
type SlugUpdatedRow = { slug: string; updated_at: string }
type DbClient       = Awaited<ReturnType<typeof createClient>>

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

async function fetchAllArtists(supabase: DbClient): Promise<SlugRow[]> {
  const { count } = await supabase.from('artists').select('*', { count: 'exact', head: true })
  const total = count ?? 0
  if (total === 0) return []

  const pageCount = Math.ceil(total / PAGE_SIZE)
  const pages = await Promise.all(
    Array.from({ length: pageCount }, (_, i) => {
      const from = i * PAGE_SIZE
      return supabase
        .from('artists')
        .select('slug')
        .range(from, from + PAGE_SIZE - 1) as unknown as Promise<{ data: SlugRow[] | null }>
    }),
  )
  return pages.flatMap(p => p.data ?? [])
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const supabase = await createClient()
  const now      = new Date().toISOString()

  const [eventRows, venueRows, artistRows] = await Promise.all([
    fetchAllEvents(supabase, now),
    fetchAllVenues(supabase),
    fetchAllArtists(supabase),
  ])

  const staticPages: MetadataRoute.Sitemap = [
    { url: BASE,                          lastModified: new Date(), changeFrequency: 'daily',   priority: 1.0 },
    { url: `${BASE}/events`,              lastModified: new Date(), changeFrequency: 'daily',   priority: 0.9 },
    { url: `${BASE}/on-sale-this-week`,   lastModified: new Date(), changeFrequency: 'daily',   priority: 0.8 },
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

  const venuePages: MetadataRoute.Sitemap = venueRows.map(v => ({
    url:             `${BASE}/venues/${v.slug}`,
    lastModified:    new Date(),
    changeFrequency: 'weekly' as const,
    priority:        0.7,
  }))

  const artistPages: MetadataRoute.Sitemap = artistRows.map(a => ({
    url:             `${BASE}/artists/${a.slug}`,
    lastModified:    new Date(),
    changeFrequency: 'weekly' as const,
    priority:        0.6,
  })).filter(a => !getArtistSeoAlias(a.url.split('/').pop() ?? ''))

  return [...staticPages, ...cityPages, ...cityThisWeekPages, ...eventPages, ...venuePages, ...artistPages]
}
