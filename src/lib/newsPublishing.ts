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
import { buildSocialShareLink } from './analytics.ts'

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

// ── Test/internal content guard (Daily Intelligence, 2 Oct 2026) ────────
//
// The Daily Intelligence Dashboard flagged a leftover seed/test row
// ("Showfinder Phase 1 Test — Do Not Share") sitting at review_status
// 'approved'. canPublishCandidate above correctly allows publishing any
// approved candidate — that's its whole job — but nothing distinguished
// this specific row as something that must never actually go out, so an
// admin clicking Publish on it (today, or on some future similarly-
// named test row) would succeed and make it genuinely public.
//
// There's no dedicated "is_test" column, and adding one is a schema
// change this fix deliberately avoids (see the project notes on this
// investigation for why). Instead: a headline that itself says not to
// publish it is treated as binding — "approved" only means a human
// marked it reviewed, it doesn't override the content's own "don't
// share this" instruction. Deliberately narrow (explicit opt-out
// phrases only) so a genuine editorial headline is never accidentally
// blocked.
const BLOCKED_TEST_CONTENT_MARKERS = ['do not share', 'do not publish']

export function isBlockedTestContent(headline: string): boolean {
  const lower = headline.toLowerCase()
  return BLOCKED_TEST_CONTENT_MARKERS.some(marker => lower.includes(marker))
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

// resolveCityNewsTargets above deliberately mixes three different kinds
// of target into one list (Homepage, Main News page, and real cities) —
// that's the right shape for city_news, which treats all three as rows
// in the same table. Anything that means "per *city*" specifically (the
// Social Pack "Create city posts" action, in particular) must not treat
// NATIONAL_SLUG/NEWS_HUB_SLUG as a city — "UK National" and "TheShowFinder
// News" are not real places and have no /cities/<name> page to link to.
// This is also what keeps a national Social Pack (however it's created)
// genuinely separate from the per-city ones, rather than one of them
// silently being a fake "city" called "UK National".
export function filterRealCityTargets(targets: CandidateCityTarget[]): CandidateCityTarget[] {
  return targets.filter(t => t.city_slug !== NATIONAL_SLUG && t.city_slug !== NEWS_HUB_SLUG)
}

// A second, independent gate against inventing content for an
// unsupported city. In normal operation every row in news_candidate_cities
// was already validated against the real city list at save time
// (isSupportedCityName in actions.ts) — this exists as defense in depth
// for anything that reaches this code a different way (legacy data, a
// direct database edit, a future caller that forgets the save-time
// check), so a Social Pack can never be generated for a city the site
// doesn't actually support. Pure and city-list-agnostic — callers pass
// whatever list of supported names is current (CITIES.map(c => c.name)
// in practice) rather than this file depending on cities.ts directly.
export function filterSupportedCityTargets(targets: CandidateCityTarget[], supportedCityNames: string[]): CandidateCityTarget[] {
  const supported = new Set(supportedCityNames)
  return targets.filter(t => supported.has(t.city_name))
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

// ── Admin queue health (Phase 4: "Fresh News & Editorial Operations") ──────
//
// Pure "does this candidate need an admin's attention right now" logic for
// the /admin/news queue — factored out so the queue page can both render a
// per-row badge and compute an aggregate count/filter from the exact same
// rules, and so the rules themselves are unit-tested rather than living
// only as inline JSX conditionals.

export type NewsCandidateAttentionReason =
  | 'no_destination'          // approved/pending with nowhere to publish to
  | 'stale_pending'           // sat in 'pending' too long, nobody's looked at it
  | 'approved_not_published'  // reviewed and approved, but never actually published
  | 'ai_suggestion_failed'    // a URL import's AI call ran but produced nothing usable
  | 'blocked_test_content'    // headline itself says not to publish it (isBlockedTestContent)
  | 'not_visible'             // published, but pushed out of a destination's visible
                               // slice by newer rows — see isCandidateVisibleAtDestination
                               // and destinationDisplayLimit below. Unlike the other
                               // reasons, candidateAttentionReasons() never returns this
                               // one itself (it would need a live city_news fetch per
                               // destination, which isn't pure) — the admin queue page
                               // computes it separately and merges it into the same
                               // reasons list for display.

// 2 days unreviewed is long enough that it's not "just added this morning"
// but short enough that it still means something actionable today.
export const STALE_PENDING_MS = 2 * 24 * 60 * 60 * 1000
// 1 day approved-but-not-published usually means it was approved and then
// forgotten, not that someone's still actively deciding on it.
export const STALE_APPROVED_MS = 24 * 60 * 60 * 1000

type CandidateAttentionFields = Pick<
  NewsCandidate,
  'review_status' | 'discovered_at' | 'reviewed_at' | 'intake_method' | 'ai_model' | 'ai_suggestions' | 'headline'
>

// A URL-imported candidate's AI call is only counted as having *failed*
// (as opposed to "no suggestion was ever attempted", e.g. a manual
// candidate, or "not configured", e.g. ANTHROPIC_API_KEY unset site-wide —
// that's a one-time configuration fact, not a per-candidate problem, and
// is surfaced separately where it's actually actionable) when: it's a
// url_import candidate, a model was actually invoked (ai_model is set —
// requestAiSuggestions in newsAiSuggestions.ts leaves this null only when
// no API key was configured at all), and the suggestion that came back has
// no usable headline despite having warnings recorded against it — the
// exact shape requestAiSuggestions produces on a non-2xx response, a
// timeout, a network error, an empty response body, or unparseable JSON.
export function didAiSuggestionFail(candidate: Pick<NewsCandidate, 'intake_method' | 'ai_model' | 'ai_suggestions'>): boolean {
  if (candidate.intake_method !== 'url_import') return false
  if (!candidate.ai_model) return false
  const ai = candidate.ai_suggestions as { headline?: string | null; warnings?: string[] } | null
  if (!ai) return false
  if (ai.headline) return false
  return Array.isArray(ai.warnings) && ai.warnings.length > 0
}

// `hasNoDestination` is the caller's own `!resolveCityNewsTargets(candidate,
// cityRows).length` result — passed in rather than recomputed here so this
// stays a pure function of already-known facts, with no second definition
// of what counts as a destination to keep in sync.
export function candidateAttentionReasons(
  candidate: CandidateAttentionFields,
  hasNoDestination: boolean,
  now: number
): NewsCandidateAttentionReason[] {
  const reasons: NewsCandidateAttentionReason[] = []

  if ((candidate.review_status === 'pending' || candidate.review_status === 'approved') && hasNoDestination) {
    reasons.push('no_destination')
  }

  if (candidate.review_status === 'pending' && now - new Date(candidate.discovered_at).getTime() > STALE_PENDING_MS) {
    reasons.push('stale_pending')
  }

  if (
    candidate.review_status === 'approved' &&
    candidate.reviewed_at &&
    now - new Date(candidate.reviewed_at).getTime() > STALE_APPROVED_MS
  ) {
    reasons.push('approved_not_published')
  }

  if (didAiSuggestionFail(candidate)) {
    reasons.push('ai_suggestion_failed')
  }

  // Flagged regardless of review_status — a test row sitting in 'pending'
  // is just as much a trap for a future "approve everything" pass as one
  // already 'approved'. isBlockedTestContent (and the hard block in
  // publishNewsCandidateAction) are the two layers: this makes it visible
  // in the queue, that makes it impossible to actually publish.
  if (isBlockedTestContent(candidate.headline)) {
    reasons.push('blocked_test_content')
  }

  return reasons
}

// Did a published candidate's own city_news row actually make it into the
// visible top-N for one of its destinations? A story can be live
// (published_to_city_news_at set, is_editorial row present) and still be
// invisible to a real visitor once enough newer content — RSS or other
// editorial — has pushed it out of rankCityNewsForDisplay's slice. Takes
// the already-fetched rows for one destination (one city_news.city_slug)
// and the real page limit that destination renders with (5 for a city
// page, 6 for the homepage, effectively unbounded for /news).
export function isCandidateVisibleAtDestination(
  candidateUrl: string,
  destinationRows: { url: string; published_at: string | null }[],
  limit: number
): boolean {
  return rankCityNewsForDisplay(destinationRows, limit).some(r => r.url === candidateUrl)
}

// The real page-rendering limit for a given city_news destination slug —
// a single source of truth for isCandidateVisibleAtDestination callers,
// matching the actual .limit(...) each live page queries with: the
// homepage reads NATIONAL_SLUG with .limit(6) (src/app/page.tsx), /news
// reads NEWS_HUB_SLUG with .limit(100) (src/app/news/page.tsx — in
// practice unbounded, a city page reads its own slug with .limit(5)
// (src/app/cities/[city]/page.tsx). If any of those page limits ever
// change, update this function to match — nothing enforces the two stay
// in sync automatically.
export function destinationDisplayLimit(citySlug: string): number {
  if (citySlug === NATIONAL_SLUG) return 6
  if (citySlug === NEWS_HUB_SLUG) return 100
  return 5
}

// ── Publish destination summary (Phase 4, requirement 4) ────────────────
//
// Human-readable list of exactly where a candidate will appear if
// published right now — used both for the "this will publish to..."
// summary shown before publishing and the confirm-dialog message, so both
// are built from the exact same facts resolveCityNewsTargets itself uses
// (Homepage/Main News page flags plus the real target city list), not a
// second hand-written description that could drift out of sync.
export function describeDestinations(
  candidate: Pick<NewsCandidate, 'publish_to_homepage' | 'publish_to_news_page'>,
  cityNames: string[]
): string[] {
  const parts: string[] = []
  if (candidate.publish_to_homepage) parts.push('Homepage')
  if (candidate.publish_to_news_page) parts.push('Main News page')
  parts.push(...cityNames)
  return parts
}

// ── Share & Email Kit defaults (Phase 4, requirement 5) ──────────────────
//
// For an approved or published candidate, the admin UI offers an editable
// "share kit" of reusable copy — headline, short summary, social caption,
// email teaser, source link, cities, hashtags — seeded from whatever is
// already on the candidate (headline/summary/source_url/url) and, where
// present, the existing Claude-generated ai_suggestions.social_caption/
// email_teaser. This never calls the AI again and nothing here persists:
// the admin page holds these as local editable state only, matching
// Chris's "we will first test the content manually" framing — no
// Facebook/Instagram/TikTok posting is wired up in this phase.

type ShareKitCandidateFields = Pick<NewsCandidate, 'headline' | 'summary' | 'story_type' | 'artist_name' | 'url' | 'source_url'>

export interface ShareKitAiFields {
  summary?: string | null
  social_caption?: string | null
  email_teaser?: string | null
}

export interface ShareKitDefaults {
  headline: string
  summary: string
  socialCaption: string
  emailTeaser: string
  sourceLink: string
  cities: string[]
  hashtags: string[]
}

// A human label ("Van Morrison", "Newcastle upon Tyne") -> a single
// hashtag token: strips anything that isn't a letter/number, then
// title-cases each word and joins them. Returns '' for a label with no
// alphanumeric content at all (e.g. an empty string), which callers
// filter out rather than ever emitting a bare '#'.
function toHashtag(label: string): string {
  const cleaned = label.replace(/[^a-zA-Z0-9 ]/g, ' ').trim()
  if (!cleaned) return ''
  const words = cleaned.split(/\s+/)
  return '#' + words.map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('')
}

const STORY_TYPE_HASHTAGS: Partial<Record<NewsCandidate['story_type'], string>> = {
  presale: '#Presale',
  tour_announcement: '#TourAnnouncement',
  new_dates: '#NewDates',
  venue_news: '#VenueNews',
  general_entertainment: '#LiveMusic',
}

// Pure, deterministic — no AI call. #TheShowFinder is always included;
// the artist (if any) and each target city each contribute one tag, the
// story type contributes one more where it maps to something read as a
// hashtag, and a national (no-city) story gets #UK as a fallback so it is
// never left with just the brand tag. Order is stable for the same input
// (Set preserves insertion order), duplicates are naturally de-duplicated
// by the Set (e.g. an artist named "UK" wouldn't double up with the
// national fallback — a deliberately harmless edge case, not one worth
// guarding against explicitly).
export function buildDefaultHashtags(candidate: ShareKitCandidateFields, cityNames: string[]): string[] {
  const tags = new Set<string>()
  tags.add('#TheShowFinder')

  if (candidate.artist_name) {
    const artistTag = toHashtag(candidate.artist_name)
    if (artistTag) tags.add(artistTag)
  }

  for (const city of cityNames) {
    const cityTag = toHashtag(city)
    if (cityTag) tags.add(cityTag)
  }

  const storyTag = STORY_TYPE_HASHTAGS[candidate.story_type]
  if (storyTag) tags.add(storyTag)

  if (cityNames.length === 0) tags.add('#UK')

  return [...tags]
}

// Composes the full share-kit default set. aiSuggestions is the
// candidate's own parsed ai_suggestions (or null for a manually-entered
// candidate, or one with no AI involvement) — social_caption/email_teaser
// only ever come from there since news_candidates has no dedicated
// columns for them; summary prefers the candidate's own (possibly
// edited) summary field over the AI's, falling back to it only when the
// candidate has none. sourceLink prefers the original publisher URL
// (source_url) over TheShowFinder's own article URL, since the share kit
// is for crediting/linking the original story, falling back to `url`
// for a manually-entered candidate with no separate source_url.
export function buildShareKitDefaults(
  candidate: ShareKitCandidateFields,
  cityNames: string[],
  aiSuggestions: ShareKitAiFields | null
): ShareKitDefaults {
  return {
    headline: candidate.headline,
    summary: candidate.summary ?? aiSuggestions?.summary ?? '',
    socialCaption: aiSuggestions?.social_caption ?? '',
    emailTeaser: aiSuggestions?.email_teaser ?? '',
    sourceLink: candidate.source_url ?? candidate.url,
    cities: cityNames,
    hashtags: buildDefaultHashtags(candidate, cityNames),
  }
}

// ── Platform-specific share links (Phase 5A, requirement 5) ──────────────
//
// "Improve the Share & Email Kit only if necessary so it produces
// platform-specific versions for Facebook, Instagram, TikTok, and
// Email." The copy itself (headline/summary/caption/teaser) is already
// platform-agnostic text an admin edits by hand — what actually differs
// per platform is the *link* each one should carry, so traffic arriving
// back on the site can be told apart in GA4 (requirement 4's "Social
// traffic"). This never posts anywhere — still copy-and-paste only, per
// ShareKit.tsx's existing design — it just tags the link each copy
// button hands the admin with the right utm_source/medium for wherever
// they're about to paste it.

export type SharePlatform = 'facebook' | 'instagram' | 'tiktok' | 'email'

export type ShareKitPlatformLinks = Record<SharePlatform, string>

const SHARE_PLATFORMS: SharePlatform[] = ['facebook', 'instagram', 'tiktok', 'email']

// candidateId is the news_candidates row id — stable for the life of the
// story, so every platform's tagged link for the same story shares one
// utm_campaign (share-<id>) while utm_source tells the platforms apart.
export function buildShareKitPlatformLinks(sourceLink: string, candidateId: string): ShareKitPlatformLinks {
  const links = {} as ShareKitPlatformLinks
  for (const platform of SHARE_PLATFORMS) {
    links[platform] = buildSocialShareLink(sourceLink, platform, candidateId)
  }
  return links
}


// ── Admin queue sort/filter (Phase 4, requirement 1 & 7) ─────────────────
//
// Pulled out of src/app/admin/news/page.tsx so the queue's ordering and
// filtering rules are unit-tested the same way every other piece of this
// phase is, rather than living only as inline logic in a server component
// (which the rest of this file's header explains can't be imported by
// `node --test` — it has '@/' path-alias and JSX dependencies the plain
// test runner can't resolve).

// Review-queue ordering: pending stories surface first (the actual inbox),
// then approved (waiting to publish), then the two resolved states. Within
// a status, highest priority and newest-discovered sort first. This is the
// queue's one fixed row order — filters narrow which rows are shown, they
// never change how shown rows are ordered.
const QUEUE_STATUS_RANK: Record<NewsCandidate['review_status'], number> = { pending: 0, approved: 1, published: 2, rejected: 3 }
const QUEUE_PRIORITY_RANK: Record<NewsCandidate['priority'], number> = { high: 0, normal: 1, low: 2 }

type QueueSortableCandidate = Pick<NewsCandidate, 'review_status' | 'priority' | 'discovered_at'>

export function sortNewsCandidatesForQueue<T extends QueueSortableCandidate>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const statusDiff = QUEUE_STATUS_RANK[a.review_status] - QUEUE_STATUS_RANK[b.review_status]
    if (statusDiff !== 0) return statusDiff
    const priorityDiff = QUEUE_PRIORITY_RANK[a.priority] - QUEUE_PRIORITY_RANK[b.priority]
    if (priorityDiff !== 0) return priorityDiff
    return new Date(b.discovered_at).getTime() - new Date(a.discovered_at).getTime()
  })
}

// "Recently added" filter chip window — 7 days, matching the chip's own
// "(7d)" label in the admin UI.
export const RECENT_QUEUE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000

export interface NewsQueueFilterParams {
  status?: string
  provenance?: string
  priority?: string
  recent?: string
  attention?: string
}

type QueueFilterableCandidate = Pick<NewsCandidate, 'review_status' | 'intake_method' | 'priority' | 'discovered_at'>

// `reasons` is the same per-row attention-reasons list candidateAttentionReasons
// (plus the page's own async 'not_visible' check) already produced — passed
// in rather than recomputed, so this stays a pure function of already-known
// facts with one definition of what "needs attention" means.
export function matchesNewsQueueFilters(
  candidate: QueueFilterableCandidate,
  reasons: NewsCandidateAttentionReason[],
  params: NewsQueueFilterParams,
  now: number
): boolean {
  if (params.status && candidate.review_status !== params.status) return false
  if (params.provenance && candidate.intake_method !== params.provenance) return false
  if (params.priority && candidate.priority !== params.priority) return false
  if (params.recent === '1' && now - new Date(candidate.discovered_at).getTime() > RECENT_QUEUE_WINDOW_MS) return false
  if (params.attention === '1' && reasons.length === 0) return false
  return true
}
