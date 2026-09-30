import Parser from 'rss-parser'
import { createAdminClient } from '@/lib/supabase/admin'
import { CITIES } from '@/lib/cities'

type DbClient = ReturnType<typeof createAdminClient>

export function citySlug(cityName: string): string {
  return cityName.toLowerCase().replace(/\s+/g, '-')
}

// Sentinel city_slug for the homepage's national (not city-scoped) news
// feed — stored in the same city_news table since the schema doesn't care
// what the slug is, rather than standing up a second table for one row type.
export const NATIONAL_SLUG = 'national'
const NATIONAL_NAME = 'UK National'

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
  '-%22Kentucky+Derby%22+-%22Epsom+Derby%22+-%22Irish+Derby%22+-%22Dubai+World+Cup%22+' +
  '-%22University+of+Kentucky%22+-UKNow+-commencement+-Wildcats+-alumni'

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
  // "Derby"/"Derby race" as a generic American event TYPE (soap box derby,
  // demolition derby, pinewood derby) rather than the English city — this is
  // what actually let the Colorado/Oklahoma stories through, since neither
  // mentions football or horse racing.
  /\bsoap box derby\b/i, /\bdemolition derby\b/i, /\bpinewood derby\b/i,
  /\bderby race\b/i, /\bderby days\b/i,
  // The national feed's query anchors on the bare word "UK" to bias results
  // toward Britain — but Google News resolves "UK" to the University of
  // Kentucky's "UKNow" news site just as readily as "United Kingdom", and
  // its commencement/alumni/recital stories never spell out "Kentucky", so
  // the US-state-name blocklist below never caught them. These are the
  // actual giveaway terms confirmed from real contaminated results.
  /\buknow\b/i, /\buniversity of kentucky\b/i, /\bcommencement\b/i,
  /\bwildcats\b/i,
]

// Several of the 36 UK cities share a name with a US or Canadian town
// (Derby CT/KS, Manchester NH, Cambridge MA, Bristol CT/TN/VA, Plymouth MA,
// Newport RI, Richmond VA, Oxford MS, Reading PA, Norwich CT, London
// Ontario, and more) — a plain city-name search picks up their local news
// too. Two independent, low-false-negative-risk signals catch almost all of
// it: the standard American/Canadian "City, ST" dateline format (never
// occurs organically in UK press), and the full state/province name spelled
// out (safe to blocklist outright — no legitimate "concert in Derby"
// headline is going to organically contain "Oklahoma").
const US_STATE_ABBR =
  'AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|' +
  'MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY'
const CA_PROVINCE_ABBR = 'ON|BC|QC|AB|MB|SK|NS|NB|NL|PE'
const US_STATE_NAMES = [
  'Alabama', 'Alaska', 'Arizona', 'Arkansas', 'California', 'Colorado', 'Connecticut',
  'Delaware', 'Florida', 'Georgia', 'Hawaii', 'Idaho', 'Illinois', 'Indiana', 'Iowa',
  'Kansas', 'Kentucky', 'Louisiana', 'Maine', 'Maryland', 'Massachusetts', 'Michigan',
  'Minnesota', 'Mississippi', 'Missouri', 'Montana', 'Nebraska', 'Nevada',
  'New Hampshire', 'New Jersey', 'New Mexico', 'North Carolina', 'North Dakota',
  'Ohio', 'Oklahoma', 'Oregon', 'Pennsylvania', 'Rhode Island', 'South Carolina',
  'South Dakota', 'Tennessee', 'Texas', 'Utah', 'Vermont', 'Virginia', 'Washington',
  'West Virginia', 'Wisconsin', 'Wyoming',
]
const CA_PROVINCE_NAMES = [
  'Ontario', 'Quebec', 'British Columbia', 'Alberta', 'Manitoba', 'Saskatchewan',
  'Nova Scotia', 'New Brunswick', 'Newfoundland and Labrador', 'Prince Edward Island',
]
const NORTH_AMERICA_BLOCKLIST: RegExp[] = [
  new RegExp(`,\\s*(?:${US_STATE_ABBR}|${CA_PROVINCE_ABBR})\\b`), // "Lawton, OK" dateline
  ...[...US_STATE_NAMES, ...CA_PROVINCE_NAMES].map(
    name => new RegExp(`\\b${name.replace(/\s+/g, '\\s+')}\\b`, 'i')
  ),
]

// US government sites (.gov) are a near-certain non-UK signal — UK
// government sites are under .gov.uk, a different TLD entirely.
function isUsGovHost(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase()
    return host.endsWith('.gov') && !host.endsWith('.gov.uk')
  } catch {
    return false
  }
}

// Same idea for American universities: .edu is a US-specific TLD (the
// University of Kentucky's "UKNow" news site is exactly the kind of source
// this exists to catch — see the HEADLINE_BLOCKLIST comment above). UK
// universities are under .ac.uk, never .edu.
function isUsEduHost(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase()
    return host.endsWith('.edu')
  } catch {
    return false
  }
}

function isFalsePositive(item: { headline: string; source: string | null; url: string }): boolean {
  const text = `${item.headline} ${item.source ?? ''}`
  if (HEADLINE_BLOCKLIST.some(re => re.test(text))) return true
  if (NORTH_AMERICA_BLOCKLIST.some(re => re.test(text))) return true
  if (isUsGovHost(item.url)) return true
  if (isUsEduHost(item.url)) return true
  return false
}

// Shared low-level fetch: takes an already-encoded Google News query string,
// parses the RSS feed, and applies the same deterministic false-positive
// backstop every feed goes through — city-scoped and national alike.
async function fetchNewsForQuery(q: string): Promise<NewsItem[]> {
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
    .filter(i => !isFalsePositive(i))
    .slice(0, 8)
}

function fetchCityNews(cityName: string): Promise<NewsItem[]> {
  const cityForQuery = cityName.replace(/\s+/g, '+')
  const q = `%22${cityForQuery}%22+(concert+OR+gig+OR+tour+OR+tickets+OR+arena+OR+festival+OR+entertainment)+${NEWS_EXCLUDE_TERMS}`
  return fetchNewsForQuery(q)
}

// The homepage's general "entertainment news from all over" feed — not tied
// to any one city. Same GB-locale RSS search and the same blocklist as every
// city feed, just without a `"City Name"` term, so this naturally skews
// toward genuinely national/major stories (an arena tour, a festival
// lineup, a big on-sale) rather than small local listings.
function fetchNationalNews(): Promise<NewsItem[]> {
  const q = `(concert+OR+gig+OR+tour+OR+festival+OR+arena+OR+%22on+sale%22+OR+presale)+UK+${NEWS_EXCLUDE_TERMS}`
  return fetchNewsForQuery(q)
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
        .select('id, url')
        .eq('city_slug', feed.slug)

      if (existingErr) {
        console.error(`[city-news] existing-rows lookup failed for "${feed.name}" (non-fatal): ${existingErr.message}`)
      } else {
        const freshUrls = new Set(rows.map(r => r.url))
        const staleIds = (existingRows ?? [])
          .filter(r => !freshUrls.has(r.url as string))
          .map(r => r.id)
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
