// Pure publish/unpublish logic for the News Intelligence Inbox
// (supabase/migration_026_news_candidates.sql, extended by
// supabase/migration_027_news_candidate_multi_city_provenance.sql for
// multi-city targeting and supabase/migration_029_news_candidate_destinations.sql
// for independent Homepage/Main-News-page destinations). Kept free of
// Next.js/Supabase machinery (cookies(), redirect(), revalidatePath(), a
// live db client) so it can be unit-tested with Node's built-in test
// runner — see newsPublishing.test.ts.
//
// NATIONAL_SLUG/NATIONAL_NAME/NEWS_HUB_SLUG/NEWS_HUB_NAME are re-declared
// here rather than imported from ./cityNews.ts, specifically to keep this
// file free of that file's rss-parser and '@/' path-alias imports,
// neither of which resolves under plain `node --test`. All four are
// long-settled sentinels; keep them in sync by hand if any is ever
// renamed.
import type { NewsCandidate } from './types/database.ts'

export const NATIONAL_SLUG = 'national'
export const NATIONAL_NAME = 'UK National'
export const NEWS_HUB_SLUG = 'news-hub'
export const NEWS_HUB_NAME = 'TheShowFinder News'

// publish_to_homepage/publish_to_news_page are independent destination
// flags (migration_029) — completely separate from scope_type, which
// continues to do only what it always did: gate whether city_slug/
// city_name/news_candidate_cities apply at all. A candidate can be
// scope_type 'city' with 3 cities AND publish_to_homepage true AND
// publish_to_news_page true, all at once; a bare 'national' candidate
// with both destination flags false now resolves to zero targets, not an
// implied homepage — see resolveCityNewsTargets below.
type CandidateScope = Pick<NewsCandidate, 'scope_type' | 'city_slug' | 'city_name' | 'publish_to_homepage' | 'publish_to_news_page'>
type CandidatePublishFields = Pick<NewsCandidate, 'scope_type' | 'city_slug' | 'city_name' | 'headline' | 'url' | 'source' | 'published_at'>
type CandidateUnpublishFields = Pick<NewsCandidate, 'scope_type' | 'city_slug' | 'city_name' | 'url'>

export function canPublishCandidate(reviewStatus: NewsCandidate['review_status']): boolean {
  return reviewStatus === 'approved' || reviewStatus === 'published'
}

export function canUnpublishCandidate(reviewStatus: NewsCandidate['review_status']): boolean {
  return reviewStatus === 'published'
}

export interface CandidateCityTarget { city_slug: string; city_name: string }

// Builds the full list of city_news targets across all three independent
// destination kinds: Homepage (publish_to_homepage → the NATIONAL_SLUG
// sentinel row, same bucket the homepage query reads), Main News page
// (publish_to_news_page → the NEWS_HUB_SLUG sentinel row), and Cities
// (only when scope_type is 'city' — unchanged gating from before this
// migration). All three can combine freely: a candidate may resolve to
// homepage + news page + N cities, or just news page + N cities, or just
// N cities, or nothing at all if every flag/field is unset (callers must
// treat an empty result as "cannot publish", not silently skip it — see
// publishNewsCandidateAction).
//
// A candidate's real target cities live in news_candidate_cities (Phase
// 2) — pass its rows as `cityRows`. For a city candidate with no cityRows
// (e.g. a pre-Phase-2 candidate whose join-table backfill somehow didn't
// run, or a caller that hasn't fetched them), this falls back to the
// legacy singular city_slug/city_name columns so nothing that already
// works breaks.
export function resolveCityNewsTargets(
  candidate: CandidateScope,
  cityRows: CandidateCityTarget[] = []
): CandidateCityTarget[] {
  const targets: CandidateCityTarget[] = []

  if (candidate.publish_to_homepage) targets.push({ city_slug: NATIONAL_SLUG, city_name: NATIONAL_NAME })
  if (candidate.publish_to_news_page) targets.push({ city_slug: NEWS_HUB_SLUG, city_name: NEWS_HUB_NAME })

  if (candidate.scope_type === 'city') {
    if (cityRows.length) targets.push(...cityRows)
    else if (candidate.city_slug && candidate.city_name) targets.push({ city_slug: candidate.city_slug, city_name: candidate.city_name })
  }

  return targets
}

export interface CityNewsUpsertRow {
  city_slug: string; city_name: string; headline: string; url: string
  source: string | null; published_at: string | null; fetched_at: string; is_editorial: true
}

// One upsert row per target city (or exactly one, for national). Returns
// [] — not null — when there are no resolvable targets, so callers can
// treat "nothing to publish" uniformly whether it came from a malformed
// national candidate or a city candidate with no cities attached.
//
// published_at here is deliberately `now` (the actual Showfinder publish
// timestamp — the same value the caller also writes to
// news_candidates.published_to_city_news_at), NOT candidate.published_at.
//
// Why: city_news.published_at is both the public ranking key (the city
// page and homepage query `.order('published_at', {ascending:false})
// .limit(N)`) and the "Today" / "N days ago" label NewsCardGrid renders.
// It's shared with RSS-sourced rows, which legitimately use the source
// article's own recency to compete for one of those N slots. An editorial
// candidate's `published_at` column, by contrast, holds the *original
// article's* publication date (still admin-editable, still the field
// shown as "Published date" in NewsCandidateForm) — kept purely for
// editorial provenance. Writing that original, often several-days-old
// date straight into city_news.published_at meant an editorial story
// could be structurally outranked by that same day's RSS churn within
// hours of going live, even though from the reader's (and the site's)
// point of view it had just been published. (This is exactly what
// happened to the Andrea Bocelli candidate on 2026-09-30: it stayed
// visible on Cardiff, the lowest-RSS-volume target city, for about a day
// before dropping out of the top 5 there too, while higher-volume cities
// like London never showed it at all.)
//
// Using `now` instead fixes that without giving editorial content a
// permanent boost: the row still ranks on plain recency against RSS rows
// (see rankCityNewsForDisplay below) and will naturally fall down the
// list as newer content — editorial or RSS — gets published, exactly the
// way an RSS row would. It only ever surfaces because it's actually
// recent by Showfinder-publish-time, which is the correct meaning of
// "this just went up on the site."
//
// No migration needed for this: the original article date already has a
// home (news_candidates.published_at) separate from this upsert row, so
// nothing new needs to be stored to preserve it.
export function buildPublishUpsertRows(
  candidate: CandidatePublishFields,
  targets: CandidateCityTarget[],
  now: string
): CityNewsUpsertRow[] {
  return targets.map(target => ({
    city_slug:     target.city_slug,
    city_name:     target.city_name,
    headline:      candidate.headline,
    url:           candidate.url,
    source:        candidate.source,
    published_at:  now,
    fetched_at:    now,
    is_editorial:  true as const,
  }))
}

// ── Public display ranking ───────────────────────────────────────────────────
//
// The exact "what shows, in what order" rule the city page and homepage
// news sections use, pulled out as a pure function so it's independently
// testable without a live database. Plain recency, nothing else: editorial
// and RSS rows rank purely by published_at, newest first. An editorial row
// is prominent only because its published_at (set to the Showfinder
// publish time above, not the source article's date) is recent — it is
// NOT given a permanent is_editorial boost, so it falls down the list
// exactly like an RSS row would as newer content of either kind appears.
// Both the city page and homepage already fetch pre-sorted, pre-limited
// results from Supabase (`.order('published_at', {ascending:false})
// .limit(N)`); passing that result through this function too is
// deliberately redundant in production — it costs nothing against an
// already-small result set — and exists so the ranking contract itself
// (not just the data going into it) is covered by a unit test.
export function rankCityNewsForDisplay<T extends { published_at: string | null }>(
  rows: T[],
  limit: number
): T[] {
  const time = (row: T) => (row.published_at ? new Date(row.published_at).getTime() : -Infinity)
  return [...rows].sort((a, b) => time(b) - time(a)).slice(0, limit)
}

export interface CityNewsDeleteFilter { city_slugs: string[]; url: string; is_editorial: true }

// A single filter covering every target city at once (the caller issues
// one `.in('city_slug', citySlugs).eq('url', ...).eq('is_editorial', true)`
// delete) rather than one filter per city — same net effect, fewer round
// trips. Returns null when there's nothing to delete against.
export function buildUnpublishDeleteFilter(
  candidate: CandidateUnpublishFields,
  targets: CandidateCityTarget[]
): CityNewsDeleteFilter | null {
  if (!targets.length) return null
  return { city_slugs: targets.map(t => t.city_slug), url: candidate.url, is_editorial: true }
}

export interface PublishCandidatePatch { review_status: 'published'; published_to_city_news_at: string; updated_at: string }
export function buildPublishCandidatePatch(now: string): PublishCandidatePatch {
  return { review_status: 'published', published_to_city_news_at: now, updated_at: now }
}

export interface UnpublishCandidatePatch { review_status: 'approved'; published_to_city_news_at: null; updated_at: string }
export function buildUnpublishCandidatePatch(now: string): UnpublishCandidatePatch {
  return { review_status: 'approved', published_to_city_news_at: null, updated_at: now }
}

// Always revalidates '/' (cheap and idempotent even when homepage isn't
// itself a destination for this candidate) plus '/news' when the Main
// News page is a target, plus one '/cities/<name>' path per target city.
export function revalidatePathsForCandidate(
  candidate: CandidateScope,
  targets: CandidateCityTarget[] = []
): string[] {
  const paths = ['/']
  for (const target of targets) {
    if (target.city_slug === NATIONAL_SLUG) {
      continue // already covered by the unconditional '/' above
    } else if (target.city_slug === NEWS_HUB_SLUG) {
      paths.push('/news')
    } else if (candidate.scope_type === 'city') {
      paths.push('/cities/' + encodeURIComponent(target.city_name))
    }
  }
  return paths
}

// ── RSS sync / editorial-row protection ─────────────────────────────────────
//
// The daily RSS sync (src/lib/cityNews.ts, syncOneFeed) replaces a feed's
// city_news rows with whatever it just fetched, pruning anything from a
// previous run that's no longer in today's results. A manually-published
// editorial row (is_editorial: true) will never appear in an RSS fetch —
// it's not from RSS at all — so without this exclusion it would look
// "stale" and get deleted on the very next sync, typically within 24
// hours of being published. Pulled out as a pure predicate so this
// protection is unit-tested directly rather than only read as correct by
// inspection; cityNews.ts calls this instead of filtering inline.
export interface PrunableCityNewsRow { id: string; url: string; is_editorial: boolean }

export function selectStaleCityNewsIds(existingRows: PrunableCityNewsRow[], freshUrls: Set<string>): string[] {
  return existingRows
    .filter(row => !freshUrls.has(row.url) && !row.is_editorial)
    .map(row => row.id)
}

// ── URL canonicalization & duplicate detection ──────────────────────────────
//
// Every candidate's `url` is normalized through this before it's saved
// (see parseNewsCandidateForm in src/app/admin/actions.ts), so the exact
// same article submitted as "http://Example.com/story/", "https://
// example.com/story" and "https://www.example.com/story#top" all collapse
// to one stored value — making the existing UNIQUE(url) constraint on
// news_candidates a real duplicate guard instead of one a trailing slash
// or a www. can slip past. Deliberately conservative: only scheme, host
// case, a leading "www.", a trailing slash and the fragment are
// normalized — the query string is left alone, since some sites
// legitimately use it to distinguish different articles (?id=123).
export function normalizeUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim()
  try {
    const parsed = new URL(trimmed)
    const protocol = parsed.protocol === 'http:' ? 'https:' : parsed.protocol
    const host = parsed.hostname.toLowerCase().replace(/^www\./, '')
    const port = parsed.port ? ':' + parsed.port : ''
    let path = parsed.pathname
    if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1)
    return `${protocol}//${host}${port}${path}${parsed.search}`
  } catch {
    // Not a parseable URL at all — isValidHttpUrl() will reject it
    // upstream; just pass the trimmed value through unchanged here.
    return trimmed
  }
}

export type DuplicateMatchSource = 'candidate' | 'published'

export interface DuplicateMatch {
  source: DuplicateMatchSource
  headline: string
  cityName: string | null
}

// Pure decision logic for "is this URL already in use" — given whatever
// rows the two lookup queries (news_candidates and city_news, both by the
// normalized url) found, decide what message to show. Candidates take
// priority in the message since that's the more actionable state (there's
// a record to go look at/approve); a live city_news row is reported
// second. Excluding the candidate's own id (when editing) is the caller's
// job when it builds `existingCandidate`.
export function describeDuplicateUrl(
  existingCandidate: { headline: string } | null,
  existingCityNews: { headline: string; city_name: string } | null
): DuplicateMatch | null {
  if (existingCandidate) {
    return { source: 'candidate', headline: existingCandidate.headline, cityName: null }
  }
  if (existingCityNews) {
    return { source: 'published', headline: existingCityNews.headline, cityName: existingCityNews.city_name }
  }
  return null
}
