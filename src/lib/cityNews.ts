import Parser from 'rss-parser'
import { createAdminClient } from '@/lib/supabase/admin'
import { CITIES } from '@/lib/cities'
import { selectStaleCityNewsIds } from './newsPublishing.ts'
import {
  type NewsItem,
  NEWS_EXCLUDE_TERMS,
  filterAndRankNewsItems,
  mergeNationalFeedResults,
} from './newsFiltering.ts'

type DbClient = ReturnType<typeof createAdminClient>

export function citySlug(cityName: string): string {
  return cityName.toLowerCase().replace(/\s+/g, '-')
}

// Sentinel city_slug for the homepage's national (not city-scoped) news
// feed — stored in the same city_news table since the schema doesn't care
// what the slug is, rather than standing up a second table for one row type.
export const NATIONAL_SLUG = 'national'
export const NATIONAL_NAME = 'UK National'

// Same pattern, for the public Main News page (/news) — a third
// independent publishing destination (see migration_029 and
// src/lib/newsPublishing.ts/resolveCityNewsTargets). Like NATIONAL_SLUG,
// this slug is never touched by the RSS sync below (syncCityNews's feed
// list only ever iterates CITIES + the national feed), so a story
// published here is automatically exempt from RSS pruning without even
// needing the is_editorial check — nothing ever looks at this slug except
// the News page's own query and the News-Intelligence-Inbox publish/
// unpublish actions.
export const NEWS_HUB_SLUG = 'news-hub'
export const NEWS_HUB_NAME = 'TheShowFinder News'

function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms))
}

// ── Feed fetch ────────────────────────────────────────────────────────────

interface RawItem {
  title?: string
  link?: string
  pubDate?: string
  creator?: string
  sourceTag?: unknown
}

function resolveSource(item: RawItem): string | null {
  if (typeof item.creator === 'string' && item.creator.trim()) return item.creator.trim()

  const raw = item.sourceTag
  if (typeof raw === 'string' && raw.trim()) return raw.trim()
  if (raw && typeof raw === 'object') {
    const text = (raw as { _?: string })._ ?? (raw as { ['#text']?: string })['#text']
    if (typeof text === 'string' && text.trim()) return text.trim()
  }

  if (item.link) {
    try {
      return new URL(item.link).hostname.replace(/^www\./, '') || null
    } catch {
      return null
    }
  }
  return null
}

const RSS_PER_ITEM_TIMEOUT_MS = 15000

// Shared low-level fetch: takes an already-encoded Google News query string,
// parses the RSS feed, maps raw items to NewsItem, and hands off to
// filterAndRankNewsItems (newsFiltering.ts) for the deterministic
// false-positive/freshness/ranking backstop every feed goes through — city-
// scoped and national alike.
async function fetchNewsForQuery(q: string): Promise<NewsItem[]> {
  // "when:4d" scopes the Google News search itself to the last 4 days —
  // a soft hint (like the -exclude terms), not a hard guarantee, which is
  // why filterAndRankNewsItems's freshness check still enforces it
  // deterministically.
  const feedUrl = `https://news.google.com/rss/search?q=${q}+when:4d&hl=en-GB&gl=GB&ceid=GB:en`

  const parser = new Parser<Record<string, unknown>, RawItem>({
    timeout: RSS_PER_ITEM_TIMEOUT_MS,
    customFields: { item: [['source', 'sourceTag']] },
  })
  const feed = await parser.parseURL(feedUrl)

  const items: NewsItem[] = (feed.items ?? []).map(item => ({
    headline:    (item.title ?? '').trim(),
    url:         item.link ?? '',
    source:      resolveSource(item),
    publishedAt: item.pubDate && !Number.isNaN(Date.parse(item.pubDate)) ? new Date(item.pubDate).toISOString() : null,
  }))

  return filterAndRankNewsItems(items, Date.now())
}

function fetchCityNews(cityName: string): Promise<NewsItem[]> {
  const cityForQuery = cityName.replace(/\s+/g, '+')
  const q = `%22${cityForQuery}%22+(concert+OR+gig+OR+tour+OR+tickets+OR+arena+OR+festival+OR+entertainment)+${NEWS_EXCLUDE_TERMS}`
  return fetchNewsForQuery(q)
}

// The homepage's general "entertainment news from all over" feed — not tied
// to any one city.
//
// Chris, 2026-09-30: "there is loads of UK entertainment news, why is this
// proving so difficult" -- fair challenge. Every fix up to this point
// (University of Kentucky, a Wyoming tourism piece, an Australian-politics
// story, a Japan concert, an American band's US tour) was a patch on the
// same underlying mistake: this was a generic Google News keyword SEARCH,
// which returns whatever anywhere on the web matches a query, ranked by an
// opaque relevance score -- it was never actually a "UK entertainment
// news" feed, just the closest approximation without picking real
// publications. That's why every anchor word eventually leaked something.
//
// Fixed properly this time: pull directly from five UK entertainment/music
// desks' own RSS feeds (NATIONAL_FEEDS below). These ARE dedicated UK
// entertainment coverage, not a keyword guess at it, so there's no anchor
// word left to leak through. ENTERTAINMENT_TERMS is kept as a live-events
// relevance filter -- these desks also cover TV, film, museums and art, not
// every story is a concert/gig/tour, and TheShowFinder is specifically
// about live events -- and the same MAX_NEWS_AGE_MS freshness cutoff still
// applies. City feeds are untouched (below) -- no single outlet covers all
// 36 cities' local scenes, so the Google News search + blocklist approach
// stays there, and it's been working correctly on every city checked so far
// (e.g. Leicester: fresh, genuinely local, correctly filtered).
const NATIONAL_FEEDS: { source: string; url: string }[] = [
  { source: 'BBC News',       url: 'https://feeds.bbci.co.uk/news/entertainment_and_arts/rss.xml' },
  { source: 'NME',            url: 'https://www.nme.com/news/music/feed' },
  { source: 'The Guardian',   url: 'https://www.theguardian.com/music/rss' },
  { source: 'The Independent', url: 'https://www.independent.co.uk/arts-entertainment/music/rss' },
  { source: 'Sky News',       url: 'https://feeds.skynews.com/feeds/rss/entertainment.xml' },
]

async function fetchNamedFeed(feed: { source: string; url: string }): Promise<NewsItem[]> {
  const parser = new Parser<Record<string, unknown>, RawItem>({ timeout: RSS_PER_ITEM_TIMEOUT_MS })
  try {
    const parsed = await parser.parseURL(feed.url)
    return (parsed.items ?? [])
      .map(item => ({
        headline:    (item.title ?? '').trim(),
        url:         item.link ?? '',
        source:      feed.source,
        publishedAt: item.pubDate && !Number.isNaN(Date.parse(item.pubDate)) ? new Date(item.pubDate).toISOString() : null,
      }))
      .filter(i => i.headline && i.url)
  } catch (err) {
    // One outlet's feed hiccuping (a timeout, a redesign) should never take
    // out the other four -- this is why each feed gets its own try/catch
    // instead of one Promise.all that fails as a whole.
    console.error(`[city-news] national feed "${feed.source}" failed (non-fatal):`, err)
    return []
  }
}

async function fetchNationalNews(): Promise<NewsItem[]> {
  const perFeed = await Promise.all(NATIONAL_FEEDS.map(fetchNamedFeed))
  return mergeNationalFeedResults(perFeed, Date.now())
}

// ── Logging (reuses sync_log, same as the Ticketmaster sync — one row per
//    city, `city` holds the real city name here) ────────────────────────────

async function logCityRun(
  db: DbClient,
  run: { city: string; startedAt: string; itemsSynced: number; status: 'ok' | 'error'; error?: string },
): Promise<void> {
  try {
    await db.from('sync_log').insert({
      city:          run.city,
      started_at:    run.startedAt,
      completed_at:  new Date().toISOString(),
      events_synced: run.itemsSynced,
      status:        run.status,
      error:         run.error ?? null,
    })
  } catch (err) {
    console.error(`[city-news] sync_log write failed for "${run.city}" (non-fatal):`, err)
  }
}

// ── Public result type ───────────────────────────────────────────────────────

export interface CityNewsSyncResult {
  citiesProcessed: number
  totalFetched:    number
  totalUpserted:   number
  totalDeleted:    number
  errors:          number
  perCity: Array<{ city: string; fetched: number; upserted: number; status: 'ok' | 'error'; error?: string }>
}

const CITY_DELAY_MS = 300

// ── Main entry point ─────────────────────────────────────────────────────

// One feed to sync: a city (slug = citySlug(name)) or the national feed
// (slug = NATIONAL_SLUG). Same fetch → upsert → prune → log pipeline either
// way — adding another non-city feed later (e.g. a genre-specific one) is
// just another entry in the list `syncCityNews` builds below.
interface NewsFeed {
  slug: string
  name: string
  fetch: () => Promise<NewsItem[]>
}

async function syncOneFeed(
  db: DbClient,
  feed: NewsFeed,
): Promise<{ fetched: number; upserted: number; deleted: number; status: 'ok' | 'error'; error?: string }> {
  const startedAt = new Date().toISOString()

  try {
    const items = await feed.fetch()
    let upserted = 0
    let deleted  = 0

    if (items.length) {
      const rows = items.map(i => ({
        city_slug:    feed.slug,
        city_name:    feed.name,
        headline:     i.headline,
        url:          i.url,
        source:       i.source,
        published_at: i.publishedAt,
        fetched_at:   new Date().toISOString(),
      }))
      const { error } = await db.from('city_news').upsert(rows, { onConflict: 'city_slug,url' })
      if (error) throw new Error(`upsert failed: ${error.message}`)
      upserted = items.length

      // Replace, don't accumulate: anything already stored for this feed
      // that isn't part of today's fresh top-8 is gone the moment we have
      // a successful fetch to replace it with — including any false
      // positive that slipped through on a previous run before this
      // blocklist existed. We only prune when today's fetch actually
      // returned data, so a transient empty/failed fetch never wipes out
      // otherwise-good existing rows.
      const { data: existingRows, error: existingErr } = await db
        .from('city_news')
        .select('id, url, is_editorial')
        .eq('city_slug', feed.slug)

      if (existingErr) {
        console.error(`[city-news] existing-rows lookup failed for "${feed.name}" (non-fatal): ${existingErr.message}`)
      } else {
        const freshUrls = new Set(rows.map(r => r.url))
        // Never prune a manually-published editorial row (News Intelligence
        // Inbox, see migration_026_news_candidates.sql) — it will never
        // appear in an RSS fetch, so "not in today's fresh set" doesn't
        // mean stale for these the way it does for RSS-sourced rows. See
        // selectStaleCityNewsIds (newsPublishing.ts) for the unit-tested
        // predicate this calls.
        const staleIds = selectStaleCityNewsIds(
          (existingRows ?? []) as { id: string; url: string; is_editorial: boolean }[],
          freshUrls
        )
        if (staleIds.length) {
          const { error: delErr } = await db.from('city_news').delete().in('id', staleIds)
          if (delErr) {
            console.error(`[city-news] cleanup failed for "${feed.name}" (non-fatal): ${delErr.message}`)
          } else {
            deleted = staleIds.length
          }
        }
      }
    }

    await logCityRun(db, { city: feed.name, startedAt, itemsSynced: items.length, status: 'ok' })
    return { fetched: items.length, upserted, deleted, status: 'ok' }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[city-news] "${feed.name}" failed:`, message)
    await logCityRun(db, { city: feed.name, startedAt, itemsSynced: 0, status: 'error', error: message })
    return { fetched: 0, upserted: 0, deleted: 0, status: 'error', error: message }
  }
}

// ── Main entry point ─────────────────────────────────────────────────────

export async function syncCityNews(): Promise<CityNewsSyncResult> {
  const db = createAdminClient()

  const feeds: NewsFeed[] = [
    ...CITIES.map(city => ({ slug: citySlug(city.name), name: city.name, fetch: () => fetchCityNews(city.name) })),
    { slug: NATIONAL_SLUG, name: NATIONAL_NAME, fetch: fetchNationalNews },
  ]

  let totalFetched = 0, totalUpserted = 0, totalDeleted = 0, errors = 0
  const perCity: CityNewsSyncResult['perCity'] = []

  for (const feed of feeds) {
    const result = await syncOneFeed(db, feed)
    totalFetched  += result.fetched
    totalUpserted += result.upserted
    totalDeleted  += result.deleted
    if (result.status === 'error') errors++
    perCity.push({ city: feed.name, fetched: result.fetched, upserted: result.upserted, status: result.status, error: result.error })

    await sleep(CITY_DELAY_MS)
  }

  console.log(`[city-news] ── Sync complete ──`)
  console.log(`[city-news]    feeds=${feeds.length} fetched=${totalFetched} upserted=${totalUpserted} deleted=${totalDeleted} errors=${errors}`)

  return { citiesProcessed: feeds.length, totalFetched, totalUpserted, totalDeleted, errors, perCity }
}

// Refreshes just the homepage's national feed, skipping all 36 per-city
// feeds — the full syncCityNews() run takes long enough (36 sequential
// fetches + a 300ms pace delay each) that it doesn't fit inside a quick
// manual re-run when only the national feed's blocklist/query changed.
// Same fetch → upsert → prune pipeline as every other feed via syncOneFeed.
export async function syncNationalNewsOnly(): Promise<{ fetched: number; upserted: number; deleted: number; status: 'ok' | 'error'; error?: string }> {
  const db = createAdminClient()
  return syncOneFeed(db, { slug: NATIONAL_SLUG, name: NATIONAL_NAME, fetch: fetchNationalNews })
}
