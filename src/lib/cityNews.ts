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

// Query-level excludes: a best-effort hint to Google News. These reduce
// volume but are NOT a reliable filter — Google's "-term" operators are a
// soft relevance signal, not a hard match rule, and the exact same query has
// been observed to return a clean result set on one run and a contaminated
// one (e.g. "AC MILAN vs. INTER: AN UNMISSABLE DERBY") a few hours later with
// no change to the query at all. Kept because it does reduce noise, but the
// HEADLINE_BLOCKLIST below is the actual guarantee.
const NEWS_EXCLUDE_TERMS =
  '-football+-soccer+-%22Serie+A%22+-%22Premier+League%22+-EFL+-Championship+' +
  '-%22horse+racing%22+-racecourse+-jockey+-racehorse+' +
  '-%22Kentucky+Derby%22+-%22Epsom+Derby%22+-%22Irish+Derby%22+-%22Dubai+World+Cup%22'

// Deterministic backstop applied to every fetched headline, regardless of
// what the Google News query itself returned. This is what actually
// guarantees a city whose name doubles as sporting vocabulary (Derby above
// all: a football/rugby rivalry fixture anywhere in the world, and a family
// of horse races) never shows football or horse-racing results as "local
// entertainment news". Applied to every city — a no-op for names that were
// never ambiguous, since none of these terms would otherwise appear.
const HEADLINE_BLOCKLIST: RegExp[] = [
  /\bfootball\b/i, /\bsoccer\b/i,
  /\bfa cup\b/i, /\bcarabao cup\b/i, /\bleague cup\b/i, /\bplay-?off(s)?\b/i,
  /\bpremier league\b/i, /\befl\b/i, /\bchampionship\b/i,
  /\bserie a\b/i, /\bla liga\b/i, /\bbundesliga\b/i, /\bligue 1\b/i,
  /\brugby\b/i, /\bfixture(s)?\b/i,
  /\bvs\.?\b/i, /\(\s*[ah]\s*\)/i, // "X vs Y" / "Team (A)" / "Team (H)" fixture notation
  /\bafc\b/i, /\bf\.?c\.?\b/i,
  /\bhorse racing\b/i, /\bracecourse\b/i, /\bracehorse\b/i, /\bjockey\b/i, /\bthoroughbred\b/i,
  /\bracing post\b/i, /\bracing tv\b/i, /\bgrand national\b/i, /\bnon-runner\b/i, /\bbetting ring\b/i,
  /\bkentucky derby\b/i, /\bepsom derby\b/i, /\birish derby\b/i,
  /\bdubai world cup\b/i, /\bdubai duty free\b/i,
]

function isFalsePositive(headline: string): boolean {
  return HEADLINE_BLOCKLIST.some(re => re.test(headline))
}

async function fetchCityNews(cityName: string): Promise<NewsItem[]> {
  const cityForQuery = cityName.replace(/\s+/g, '+')
  const q = `%22${cityForQuery}%22+(concert+OR+gig+OR+tour+OR+tickets+OR+arena+OR+festival+OR+entertainment)+${NEWS_EXCLUDE_TERMS}`
  const feedUrl = `https://news.google.com/rss/search?q=${q}&hl=en-GB&gl=GB&ceid=GB:en`

  const parser = new Parser<Record<string, unknown>, RawItem>({
    timeout: RSS_PER_ITEM_TIMEOUT_MS,
    customFields: { item: [['source', 'sourceTag']] },
  })
  const feed = await parser.parseURL(feedUrl)

  return (feed.items ?? [])
    .map(item => ({
      headline:    (item.title ?? '').trim(),
      url:         item.link ?? '',
      source:      resolveSource(item),
      publishedAt: item.pubDate && !Number.isNaN(Date.parse(item.pubDate)) ? new Date(item.pubDate).toISOString() : null,
    }))
    .filter(i => i.headline && i.url)
    .filter(i => !isFalsePositive(i.headline))
    .slice(0, 8)
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
        totalUpserted += items.length

        // Replace, don't accumulate: anything already stored for this city
        // that isn't part of today's fresh top-8 is gone the moment we have
        // a successful fetch to replace it with — including any false
        // positive that slipped through on a previous run before this
        // blocklist existed (or before Google's query-level exclusion
        // happened to catch it). We only prune when today's fetch actually
        // returned data, so a transient empty/failed fetch never wipes
        // out otherwise-good existing rows.
        const { data: existingRows, error: existingErr } = await db
          .from('city_news')
          .select('id, url')
          .eq('city_slug', slug)

        if (existingErr) {
          console.error(`[city-news] existing-rows lookup failed for "${city.name}" (non-fatal): ${existingErr.message}`)
        } else {
          const freshUrls = new Set(rows.map(r => r.url))
          const staleIds = (existingRows ?? [])
            .filter(r => !freshUrls.has(r.url as string))
            .map(r => r.id)
          if (staleIds.length) {
            const { error: delErr } = await db.from('city_news').delete().in('id', staleIds)
            if (delErr) {
              console.error(`[city-news] cleanup failed for "${city.name}" (non-fatal): ${delErr.message}`)
            } else {
              totalDeleted += staleIds.length
            }
          }
        }
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
