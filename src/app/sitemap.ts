import { GUIDES } from '@/lib/guides'
import { CITY_TYPES, MIN_INDEXABLE, cityTypeUrl } from '@/lib/cityTypeSeo'
import { SEASONS, seasonWindow, matchesSeason } from '@/lib/citySeasonSeo'
import { upcomingMonths, monthWindow } from '@/lib/cityMonthSeo'
import { CITY_GENRES, genreForArtistGenre } from '@/lib/cityGenreSeo'
import type { MetadataRoute } from 'next'
import { createPublicClient } from '@/lib/supabase/public'
import { getArtistSeoAlias, getEventSeoAlias } from '@/lib/seoAliases'
import { CITIES } from '@/lib/cities'
import { fetchWestEndShows } from '@/lib/showPool'
import { LIVE_EVENT_STATUSES } from '@/lib/eventPools'
import { shouldListArtistInSitemap } from '@/lib/artistEvents'
import { repeatPerformanceSlugs } from '@/lib/repeatPerformances'

// Regenerated at most hourly (the sitemap was dynamic before; once public pages
// stopped using cookies it became a static file frozen at build time).
export const revalidate = 86400

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

type VenueRow       = { id: string; slug: string; city: string | null }
type ArtistRow      = { id: string; slug: string; name: string | null; is_featured: boolean | null }
type SlugUpdatedRow = { id: string; slug: string; title: string; created_at: string; page_changed_at: string | null; venue_id: string | null; start_date: string; category: string; source: string | null; event_artists?: Array<{ artists: { genre: string | null } | null }> | null }
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
        .select('id, slug, title, created_at, page_changed_at, venue_id, start_date, category, source, event_artists(artists(genre))')
        .gte('start_date', nowISO)
        // Cancelled / postponed shows are not sitemap material.
        .in('status', LIVE_EVENT_STATUSES)
        .order('start_date').order('id')
        .range(from, from + PAGE_SIZE - 1) as unknown as Promise<{ data: SlugUpdatedRow[] | null }>
    }),
  )
  return pages.flatMap(p => p.data ?? [])
}

// Ids of events folded into a canonical event (premium / lounge / VIP packages
// and repeat source records, event_canonical_map.is_canonical = false). Their
// pages canonical to the main event page and are noindex, so they are left out
// of the sitemap. Returns null when the lookup fails: the caller then keeps the
// full list rather than dropping real events.
async function fetchDuplicateEventIds(supabase: DbClient): Promise<Set<string> | null> {
  const ids = new Set<string>()
  try {
    for (let from = 0; from < 20 * PAGE_SIZE; from += PAGE_SIZE) {
      const { data, error } = await supabase
        .from('event_canonical_map')
        .select('id')
        .eq('is_canonical', false)
        .order('id')
        .range(from, from + PAGE_SIZE - 1) as unknown as { data: { id: string }[] | null; error: { message: string } | null }
      if (error) throw new Error(error.message)
      for (const r of data ?? []) ids.add(r.id)
      if ((data ?? []).length < PAGE_SIZE) return ids
    }
  } catch (err) {
    console.error('[sitemap] duplicate event lookup failed', err)
    return null
  }
  return ids
}

async function fetchAllVenues(supabase: DbClient): Promise<VenueRow[]> {
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
        .select('id, slug, city')
        .not('slug', 'is', null)
        .range(from, from + PAGE_SIZE - 1) as unknown as Promise<{ data: VenueRow[] | null }>
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
async function fetchArtistUpcomingCounts(supabase: DbClient, nowISO: string): Promise<Map<string, number> | null> {
  // No exact count here: `count=exact` on this embedded inner join returns a
  // 500 (statement timeout) on production, which used to silently empty the map
  // and drop every artist from the sitemap. Page in waves until a short page.
  const WAVE = 6
  const counts = new Map<string, number>()
  try {
    for (let wave = 0; wave < 30; wave++) {
      const pages = await Promise.all(
        Array.from({ length: WAVE }, (_, i) => {
          const from = (wave * WAVE + i) * PAGE_SIZE
          return supabase
            .from('event_artists')
            .select('artist_id, events!inner(start_date, status)')
            .gte('events.start_date', nowISO)
            .in('events.status', LIVE_EVENT_STATUSES)
            .order('event_id')
            .order('artist_id')
            .range(from, from + PAGE_SIZE - 1) as unknown as PromiseLike<{ data: { artist_id: string }[] | null; error: { message: string } | null }>
        }),
      )
      let short = false
      for (const page of pages) {
        if (page.error) throw new Error(page.error.message)
        const rows = page.data ?? []
        for (const row of rows) counts.set(row.artist_id, (counts.get(row.artist_id) ?? 0) + 1)
        if (rows.length < PAGE_SIZE) short = true
      }
      if (short) return counts
    }
    return counts
  } catch (err) {
    console.error('[sitemap] artist event counts failed; listing all named artists', err)
    return null
  }
}

// Promoter pages (/promoters/[slug]) for organisers with at least one upcoming live listing. Empty ones stay out.
async function fetchPromotersWithEvents(supabase: DbClient, nowISO: string): Promise<{ slug: string }[]> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from('events')
      .select('organisers!inner(slug)')
      .eq('source', 'organiser')
      .gte('start_date', nowISO)
      .in('status', LIVE_EVENT_STATUSES)
      .limit(1000) as { data: { organisers: { slug: string } | null }[] | null; error: { message: string } | null }
    if (error) throw new Error(error.message)
    return [...new Set((data ?? []).map(r => r.organisers?.slug).filter((x): x is string => !!x))].map(slug => ({ slug }))
  } catch (err) {
    console.error('[sitemap] promoter lookup failed', err)
    return []
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const supabase = createPublicClient()
  const now      = new Date().toISOString()

  const [allEventRows, duplicateIds, venueRows, artistRows, westEndShows, artistCounts, promoterRows] = await Promise.all([
    fetchAllEvents(supabase, now),
    fetchDuplicateEventIds(supabase),
    fetchAllVenues(supabase),
    fetchAllArtists(supabase),
    fetchWestEndShows(supabase),
    fetchArtistUpcomingCounts(supabase, now),
    fetchPromotersWithEvents(supabase, now),
  ])

  const staticPages: MetadataRoute.Sitemap = [
    { url: BASE,                          lastModified: new Date(), changeFrequency: 'daily',   priority: 1.0 },
    { url: `${BASE}/events`,              lastModified: new Date(), changeFrequency: 'daily',   priority: 0.9 },
    { url: `${BASE}/on-sale-this-week`,   lastModified: new Date(), changeFrequency: 'daily',   priority: 0.8 },
    { url: `${BASE}/this-week`,           lastModified: new Date(), changeFrequency: 'daily',   priority: 0.8 },
    { url: `${BASE}/west-end`,            lastModified: new Date(), changeFrequency: 'daily',   priority: 0.9 },
    { url: `${BASE}/artists`,             lastModified: new Date(), changeFrequency: 'daily',   priority: 0.7 },
    { url: `${BASE}/attractions`,         lastModified: new Date(), changeFrequency: 'daily',   priority: 0.6 },
    // Phase 5A: the editorial news hub (/news) was never in here — every
    // other static top-level page was. Individual on-sale-this-week/[slug]
    // pages are deliberately NOT added here: each one represents "this
    // week's" on-sale group for an artist and goes stale within days, so
    // indexing them long-term isn't useful the way a stable page is.
    { url: `${BASE}/news`,                lastModified: new Date(), changeFrequency: 'daily',   priority: 0.8 },
    { url: `${BASE}/widgets`,             changeFrequency: 'monthly', priority: 0.4 },
    { url: `${BASE}/calendars`,           changeFrequency: 'monthly', priority: 0.5 },
    { url: `${BASE}/new-tours`,           lastModified: new Date(), changeFrequency: 'daily', priority: 0.7 },
    { url: `${BASE}/insights`,            lastModified: new Date(), changeFrequency: 'weekly', priority: 0.6 },
    { url: `${BASE}/guides`,              changeFrequency: 'monthly', priority: 0.5 },
    { url: `${BASE}/list-your-event`,     changeFrequency: 'monthly', priority: 0.6 },
    { url: `${BASE}/sell-tickets`,        changeFrequency: 'monthly', priority: 0.7 },
    ...GUIDES.map(g => ({ url: `${BASE}/guides/${g.slug}`, lastModified: new Date(`${g.updated}T12:00:00Z`), changeFrequency: 'monthly' as const, priority: 0.6 })),
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

  // Tonight pages: every city, like This weekend (the list changes daily, the page is always useful).
  const cityTonightPages: MetadataRoute.Sitemap = CITIES.map(city => ({
    url:             `${BASE}/cities/${encodeURIComponent(city.name)}/tonight`,
    changeFrequency: 'daily' as const,
    priority:        0.7,
  }))

  const cityThisWeekendPages: MetadataRoute.Sitemap = CITIES.map(city => ({
    url:             `${BASE}/cities/${encodeURIComponent(city.name)}/this-weekend`,
    changeFrequency: 'daily' as const,
    priority:        0.7,
  }))

  // Long runs list one event per performance; only the soonest few are indexable.
  // Package / duplicate records are excluded: they canonical to the main event.
  const eventRows = duplicateIds ? allEventRows.filter(e => !duplicateIds.has(e.id)) : allEventRows
  // Council / tourism-board listings (workshops, markets, village events) stay on the site and city pages but are
  // left out of the sitemap, so Google's attention goes to shows people buy tickets for (3 Nov 2026).
  // Events listed by their own organiser ("List your event") always go in, whatever the category: a real event with a
  // real ticket page, written by the people running it, and often the only page on the web for a small-town gig.
  const isLocalListing = (e: SlugUpdatedRow) => e.source !== 'organiser' && (e.category === 'local' || /_council$/.test(e.source ?? ''))
  const repeatSlugs = repeatPerformanceSlugs(eventRows)
  // lastModified = when what the page shows last changed (migration 107), not when a sync last touched the row.
  const eventPages: MetadataRoute.Sitemap = eventRows.filter(e => !repeatSlugs.has(e.slug) && !isLocalListing(e)).map(e => ({
    url:             `${BASE}/events/${e.slug}`,
    lastModified:    new Date(e.page_changed_at ?? e.created_at),
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
  // Only venues with something on: a venue with no upcoming events is a thin page
  // (and is served noindex), so it should not spend crawl budget.
  const venuesWithEvents = new Set(eventRows.map(e => e.venue_id).filter(Boolean))
  const venuePages: MetadataRoute.Sitemap = venueRows.filter(v => venuesWithEvents.has(v.id)).map(v => ({
    url:             `${BASE}/venues/${v.slug}`,
    changeFrequency: 'weekly' as const,
    priority:        0.7,
  }))

  const artistPages: MetadataRoute.Sitemap = artistRows
    .filter(a => shouldListArtistInSitemap({
      name: a.name,
      upcomingEvents: artistCounts ? (artistCounts.get(a.id) ?? 0) : 2,
      isFeatured: a.is_featured,
    }))
    .map(a => ({
      url:             `${BASE}/artists/${a.slug}`,
      changeFrequency: 'weekly' as const,
      priority:        0.6,
    }))
    .filter(a => !getArtistSeoAlias(a.url.split('/').pop() ?? ''))

  // "{Type} in {City}" pages (/cities/Coventry/concerts) with enough upcoming shows to be worth indexing:
  // counted as distinct shows (title + venue), so a long theatre run counts once, matching the page.
  const venueCity = new Map(venueRows.map(v => [v.id, (v.city ?? '').toLowerCase()]))
  const typeShows = new Map<string, Set<string>>()
  for (const e of eventRows) {
    const c = e.venue_id ? venueCity.get(e.venue_id) : null
    if (!c) continue
    const k = `${c}|${e.category}`
    if (!typeShows.has(k)) typeShows.set(k, new Set())
    typeShows.get(k)!.add(`${e.title.trim().toLowerCase()}|${e.venue_id}`)
  }
  const cityTypePages: MetadataRoute.Sitemap = CITIES.flatMap(city => CITY_TYPES
    .filter(t => (typeShows.get(`${city.name.toLowerCase()}|${t.category}`)?.size ?? 0) >= MIN_INDEXABLE)
    .map(t => ({ url: cityTypeUrl(city.name, t), changeFrequency: 'daily' as const, priority: 0.8 })))

  // Seasonal pages (/cities/Leeds/panto, /christmas, /new-years-eve) while the season is on, counted the same way.
  const seasonShows = new Map<string, Set<string>>()
  for (const season of SEASONS) {
    const w = seasonWindow(season)
    for (const e of eventRows) {
      if (e.start_date < w.from || e.start_date >= w.to || !matchesSeason(season, e)) continue
      const c = e.venue_id ? venueCity.get(e.venue_id) : null
      if (!c) continue
      const k = `${c}|${season.slug}`
      if (!seasonShows.has(k)) seasonShows.set(k, new Set())
      seasonShows.get(k)!.add(`${e.title.trim().toLowerCase()}|${e.venue_id}`)
    }
  }
  const citySeasonPages: MetadataRoute.Sitemap = CITIES.flatMap(city => SEASONS
    .filter(x => (seasonShows.get(`${city.name.toLowerCase()}|${x.slug}`)?.size ?? 0) >= MIN_INDEXABLE)
    .map(x => ({ url: `${BASE}/cities/${encodeURIComponent(city.name)}/${x.slug}`, changeFrequency: 'daily' as const, priority: 0.8 })))

  // Month pages (/cities/Leeds/december-2026) for the next 12 months with 5+ shows.
  const months = upcomingMonths().map(m => ({ m, w: monthWindow(m) }))
  const monthShows = new Map<string, Set<string>>()
  for (const e of eventRows) {
    const hit = months.find(x => e.start_date >= x.w.from && e.start_date < x.w.to)
    const c = hit && e.venue_id ? venueCity.get(e.venue_id) : null
    if (!hit || !c) continue
    const k = `${c}|${hit.m.slug}`
    if (!monthShows.has(k)) monthShows.set(k, new Set())
    monthShows.get(k)!.add(`${e.title.trim().toLowerCase()}|${e.venue_id}`)
  }
  const cityMonthPages: MetadataRoute.Sitemap = CITIES.flatMap(city => months
    .filter(x => (monthShows.get(`${city.name.toLowerCase()}|${x.m.slug}`)?.size ?? 0) >= MIN_INDEXABLE)
    .map(x => ({ url: `${BASE}/cities/${encodeURIComponent(city.name)}/${x.m.slug}`, changeFrequency: 'daily' as const, priority: 0.7 })))

  // Genre pages (/cities/Manchester/metal-gigs): concerts whose artists carry that genre, 5+ shows.
  const genreShows = new Map<string, Set<string>>()
  for (const e of eventRows) {
    if (e.category !== 'concert') continue
    const c = e.venue_id ? venueCity.get(e.venue_id) : null
    if (!c) continue
    for (const g of new Set((e.event_artists ?? []).map(a => genreForArtistGenre(a.artists?.genre)?.slug).filter(Boolean))) {
      const k = `${c}|${g}`
      if (!genreShows.has(k)) genreShows.set(k, new Set())
      genreShows.get(k)!.add(`${e.title.trim().toLowerCase()}|${e.venue_id}`)
    }
  }
  const cityGenrePages: MetadataRoute.Sitemap = CITIES.flatMap(city => CITY_GENRES
    .filter(g => (genreShows.get(`${city.name.toLowerCase()}|${g.slug}`)?.size ?? 0) >= MIN_INDEXABLE)
    .map(g => ({ url: `${BASE}/cities/${encodeURIComponent(city.name)}/${g.slug}`, changeFrequency: 'daily' as const, priority: 0.7 })))

  const promoterPages: MetadataRoute.Sitemap = promoterRows.map(p => ({
    url:             `${BASE}/promoters/${p.slug}`,
    changeFrequency: 'weekly' as const,
    priority:        0.5,
  }))

  return [...staticPages, ...promoterPages, ...cityPages, ...cityTypePages, ...citySeasonPages, ...cityMonthPages, ...cityGenrePages, ...cityThisWeekPages, ...cityThisWeekendPages, ...cityTonightPages, ...westEndShowPages, ...eventPages, ...venuePages, ...artistPages]
}
