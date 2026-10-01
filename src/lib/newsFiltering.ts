// Pure, dependency-free RSS/news-item filtering and ranking logic — Phase 4
// ("Fresh News & Editorial Operations") extraction of logic that previously
// lived only inside src/lib/cityNews.ts. Moved here, unchanged, so it can
// be unit-tested directly with Node's built-in test runner (see
// newsFiltering.test.ts) — same reasoning as src/lib/newsPublishing.ts's
// header comment: this file imports nothing beyond the TypeScript standard
// library (no rss-parser, no '@/' path aliases, no Supabase client), which
// is what lets `node --test` run it directly with no build step.
//
// This is a pure, behaviour-preserving extraction: every regex, constant
// and filter/sort/cap step below is copied verbatim from cityNews.ts,
// which now imports all of it back and calls it from the same two call
// sites (fetchNewsForQuery for the 37 per-city Google News searches,
// fetchNationalNews for the 5-outlet national feed). Nothing about what
// gets kept or dropped from a real RSS fetch changes as a result of this
// file existing. The extensive comments on several of the constants below
// record real, hard-won fixes for specific contamination bugs found in
// production (University of Kentucky's "UKNow" news site leaking into the
// "UK" national feed, a Wyoming tourism piece, Colorado/Oklahoma "derby"
// events leaking into Derby's city feed, etc.) — kept verbatim since they
// explain *why* each pattern exists, not just what it matches.

export interface NewsItem {
  headline: string
  url: string
  source: string | null
  publishedAt: string | null
}

// Chris, 2026-09-30: nothing older than 3-4 days — this is meant to read
// as "what's happening right now", not a stale digest.
export const MAX_NEWS_AGE_MS = 4 * 24 * 60 * 60 * 1000

// Query-level excludes: a best-effort hint to Google News. These reduce
// volume but are NOT a reliable filter — Google's "-term" operators are a
// soft relevance signal, not a hard match rule, and the exact same query has
// been observed to return a clean result set on one run and a contaminated
// one (e.g. "AC MILAN vs. INTER: AN UNMISSABLE DERBY") a few hours later with
// no change to the query at all. Kept because it does reduce noise, but the
// HEADLINE_BLOCKLIST below is the actual guarantee.
export const NEWS_EXCLUDE_TERMS =
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
export const HEADLINE_BLOCKLIST: RegExp[] = [
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
  /\bwildcats\b/i, /\brupp arena\b/i, /\bdanceblue\b/i, /\blexington\b/i,
  // The national feed's "British" anchor (see fetchNationalNews) still lets
  // through stories that merely mention a British person/company doing
  // something abroad -- e.g. a US regional outlet's tourism-boosting piece
  // about a British TOUR COMPANY (coach holidays, not concert tours)
  // praising an American town. "tour company" is the generic giveaway
  // (a real concert story says "UK tour", never "tour company"), plus the
  // specific outlet/place confirmed from a real contaminated result.
  /\btour compan(y|ies)\b/i, /\bcowboy state daily\b/i, /\bcheyenne\b/i,
]

// Positive backstop -- the mirror image of HEADLINE_BLOCKLIST. Google's OR
// query matching is a loose relevance signal, not a hard requirement, and
// once "when:4d" narrows the fresh result pool it will happily fill
// remaining slots with any story that merely contains the anchor word --
// confirmed live with "British Jews back calls to ban Australian academic
// Randa Abdel-Fattah" (AFR), a political story with zero connection to
// music/entertainment. Every kept item must itself read like real
// entertainment/live-events coverage, checked against the headline alone
// (not source, which is just the publisher's name).
export const ENTERTAINMENT_TERMS: RegExp[] = [
  /\bconcert(s)?\b/i, /\bgig(s)?\b/i, /\btour(s)?\b/i, /\bfestival(s)?\b/i,
  /\barena\b/i, /\bticket(s)?\b/i, /\bpresale\b/i, /\bon sale\b/i,
  /\balbum\b/i, /\bsingle\b/i, /\bep\b/i, /\bband\b/i, /\bsinger\b/i,
  /\brapper\b/i, /\bdj\b/i, /\bmusical\b/i, /\btheatre\b/i, /\btheater\b/i,
  /\bcomedy\b/i, /\bcomedian\b/i, /\bsetlist\b/i, /\blineup\b/i, /\bheadliner\b/i,
  /\bstadium\b/i, /\bperformance\b/i, /\borchestra\b/i, /\bsymphony\b/i,
  /\bstand-?up\b/i, /\bshow(s)?\b/i, /\bvenue\b/i, /\bmusic\b/i,
  /\bartist(s)?\b/i, /\bsold out\b/i, /\bencore\b/i, /\bentertainment\b/i,
  /\bopera\b/i, /\bballet\b/i, /\bpanto(mime)?\b/i,
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
export const NORTH_AMERICA_BLOCKLIST: RegExp[] = [
  new RegExp(`,\\s*(?:${US_STATE_ABBR}|${CA_PROVINCE_ABBR})\\b`), // "Lawton, OK" dateline
  ...[...US_STATE_NAMES, ...CA_PROVINCE_NAMES].map(
    name => new RegExp(`\\b${name.replace(/\s+/g, '\\s+')}\\b`, 'i')
  ),
]

// US government sites (.gov) are a near-certain non-UK signal — UK
// government sites are under .gov.uk, a different TLD entirely.
export function isUsGovHost(url: string): boolean {
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
export function isUsEduHost(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase()
    return host.endsWith('.edu')
  } catch {
    return false
  }
}

export function isFalsePositive(item: { headline: string; source: string | null; url: string }): boolean {
  const text = `${item.headline} ${item.source ?? ''}`
  if (HEADLINE_BLOCKLIST.some(re => re.test(text))) return true
  if (NORTH_AMERICA_BLOCKLIST.some(re => re.test(text))) return true
  if (isUsGovHost(item.url)) return true
  if (isUsEduHost(item.url)) return true
  if (!ENTERTAINMENT_TERMS.some(re => re.test(item.headline))) return true
  return false
}

// Deterministic freshness check behind Google's "when:4d" soft hint (see
// fetchNewsForQuery in cityNews.ts) — a null or unparseable publishedAt is
// never "fresh enough". No parseable date means we can't verify it's
// recent, so it doesn't get the benefit of the doubt: drop it rather than
// risk another stale item slipping in the way the UKNow ones did.
export function isFreshEnough(publishedAt: string | null, now: number, maxAgeMs: number = MAX_NEWS_AGE_MS): boolean {
  if (publishedAt === null) return false
  const t = new Date(publishedAt).getTime()
  if (Number.isNaN(t)) return false
  return now - t <= maxAgeMs
}

// Shared per-item filter + recency sort + top-N cap, used for a single
// city's Google News search results (fetchNewsForQuery in cityNews.ts).
// Exact same pipeline as before this was extracted: require headline+url,
// reject false positives, require freshness, newest first, cap at 8.
// Phase 4 fix (requirement 2's "whether duplicate stories are prevented"
// audit item): a single Google News RSS search can itself return the same
// article URL more than once (e.g. a syndicated repost picked up twice by
// the search). That wasn't deduped here before — only the national-feed
// merge (mergeNationalFeedResults, below) deduped by url, since *that*
// function's whole job is combining several feeds that might overlap.
// Left alone, two rows with the same (city_slug, url) reaching
// syncOneFeed's `db.from('city_news').upsert(rows, { onConflict:
// 'city_slug,url' })` call (cityNews.ts) make Postgres reject the entire
// upsert with "ON CONFLICT DO UPDATE command cannot affect row a second
// time" — so an in-feed duplicate wasn't just a redundant row, it could
// fail that city's whole sync run for the day. Deduping by url here,
// before the slice, closes that gap without changing output for the
// (overwhelmingly common) case of no duplicates.
export function filterAndRankNewsItems(items: NewsItem[], now: number, limit = 8): NewsItem[] {
  const seenUrls = new Set<string>()
  return items
    .filter(i => i.headline && i.url)
    .filter(i => !isFalsePositive(i))
    .filter(i => isFreshEnough(i.publishedAt, now))
    .filter(i => {
      if (seenUrls.has(i.url)) return false
      seenUrls.add(i.url)
      return true
    })
    .sort((a, b) => new Date(b.publishedAt!).getTime() - new Date(a.publishedAt!).getTime())
    .slice(0, limit)
}

// National feed merge (fetchNationalNews in cityNews.ts): flattens every
// named outlet's already-fetched results (one failed outlet simply
// contributes an empty array — see fetchNamedFeed's own try/catch, which
// never throws), applies the same false-positive filter, an explicit
// entertainment-relevance check (these desks also cover TV/film/museums,
// not just live events — ENTERTAINMENT_TERMS is already inside
// isFalsePositive too; this second check is a deliberate pre-existing
// redundancy, kept as-is), the same freshness filter, dedupes the rare
// story two outlets both ran, then ranks/caps the same way as the city
// path. Items are assumed to already have non-empty headline/url (that
// check happens earlier, inside fetchNamedFeed) — no headline/url filter
// here, matching the original un-extracted code exactly.
export function mergeNationalFeedResults(perFeedResults: NewsItem[][], now: number, limit = 8): NewsItem[] {
  const seenUrls = new Set<string>()
  return perFeedResults
    .flat()
    .filter(i => !isFalsePositive(i))
    .filter(i => ENTERTAINMENT_TERMS.some(re => re.test(i.headline)))
    .filter(i => isFreshEnough(i.publishedAt, now))
    .filter(i => {
      // The rare story two of these desks both cover.
      if (seenUrls.has(i.url)) return false
      seenUrls.add(i.url)
      return true
    })
    .sort((a, b) => new Date(b.publishedAt!).getTime() - new Date(a.publishedAt!).getTime())
    .slice(0, limit)
}
