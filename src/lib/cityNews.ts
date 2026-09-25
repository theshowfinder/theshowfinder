import Parser from 'rss-parser'
import { createAdminClient } from '@/lib/supabase/admin'
import { CITIES } from '@/lib/cities'

type DbClient = ReturnType<typeof createAdminClient>

export function citySlug(cityName: string): string {
  return cityName.toLowerCase().replace(/\s+/g, '-')
}

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

interface NewsItem {
  headline: string
  url: string
  source: string | null
  publishedAt: string | null
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

async function fetchCityNews(cityName: string): Promise<NewsItem[]> {
  const cityForQuery = cityName.replace(/\s+/g, '+')
  const q = `%22${cityForQuery}%22+(concert+OR+gig+OR+tour+OR+tickets+OR+arena+OR+festival+OR+entertainment)`
  const feedUrl = `https://news.google.com/rss/search?q=${q}&hl=en-GB&gl=GB&ceid=GB:en`

  const parser = new Parser<Record<string, unknown>, RawItem>({
    timeout: RSS_PER_ITEM_TIMEOUT_MS,
    customFields: { item: [['source', 'sourceTag']] },
  })
  const feed = await parser.parseURL(feedUrl)

  return (feed.items ?? [])
    .slice(0, 8)
    .map(item => ({
      headline:    (item.title ?? '').trim(),
      url:         item.link ?? '',
      source:      resolveSource(item),
      publishedAt: item.pubDate && !Number.isNaN(Date.parse(item.pubDate)) ? new Date(item.pubDate).toISOString() : null,
    }))
    .filter(i => i.headline && i.url)
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
const STALE_DAYS = 14

// ── Main entry point ─────────────────────────────────────────────────────────

export async function syncCityNews(): Promise<CityNewsSyncResult> {
  const db = createAdminClient()

  let totalFetched = 0, totalUpserted = 0, totalDeleted = 0, errors = 0
  const perCity: CityNewsSyncResult['perCity'] = []

  for (const city of CITIES) {
    const slug = citySlug(city.name)
    const startedAt = new Date().toISOString()

    try {
      const items = await fetchCityNews(city.name)
      totalFetched += items.length

      if (items.length) {
        const rows = items.map(i => ({
          city_slug:    slug,
          city_name:    city.name,
          headline:     i.headline,
          url:          i.url,
          source:       i.source,
          published_at: i.publishedAt,
          fetched_at:   new Date().toISOString(),
        }))
        const { error } = await db.from('city_news').upsert(rows, { onConflict: 'city_slug,url' })
        if (error) throw new Error(`upsert failed: ${error.message}`)
      }
      totalUpserted += items.length

      // Rows not refreshed in the last 14 days have either dropped out of
      // Google's top-8 results or the sync hasn't run — either way, stale.
      const cutoff = new Date(Date.now() - STALE_DAYS * 24 * 60 * 60 * 1000).toISOString()
      const { data: deleted, error: delErr } = await db
        .from('city_news')
        .delete()
        .eq('city_slug', slug)
        .lt('fetched_at', cutoff)
        .select('id')
      if (delErr) {
        console.error(`[city-news] cleanup failed for "${city.name}" (non-fatal): ${delErr.message}`)
      } else {
        totalDeleted += deleted?.length ?? 0
      }

      perCity.push({ city: city.name, fetched: items.length, upserted: items.length, status: 'ok' })
      await logCityRun(db, { city: city.name, startedAt, itemsSynced: items.length, status: 'ok' })
    } catch (err) {
      errors++
      const message = err instanceof Error ? err.message : String(err)
      console.error(`[city-news] "${city.name}" failed:`, message)
      perCity.push({ city: city.name, fetched: 0, upserted: 0, status: 'error', error: message })
      await logCityRun(db, { city: city.name, startedAt, itemsSynced: 0, status: 'error', error: message })
    }

    await sleep(CITY_DELAY_MS)
  }

  console.log(`[city-news] ── Sync complete ──`)
  console.log(`[city-news]    cities=${CITIES.length} fetched=${totalFetched} upserted=${totalUpserted} deleted=${totalDeleted} errors=${errors}`)

  return { citiesProcessed: CITIES.length, totalFetched, totalUpserted, totalDeleted, errors, perCity }
}
