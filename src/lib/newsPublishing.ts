// Pure publish/unpublish logic for the News Intelligence Inbox
// (supabase/migration_026_news_candidates.sql, extended by
// supabase/migration_027_news_candidate_multi_city_provenance.sql for
// multi-city targeting). Kept free of Next.js/Supabase machinery
// (cookies(), redirect(), revalidatePath(), a live db client) so it can be
// unit-tested with Node's built-in test runner — see newsPublishing.test.ts.
//
// NATIONAL_SLUG/NATIONAL_NAME are re-declared here rather than imported
// from ./cityNews.ts, specifically to keep this file free of that file's
// rss-parser and '@/' path-alias imports, neither of which resolves under
// plain `node --test`. Both are long-settled sentinels; keep them in sync
// by hand if either is ever renamed.
import type { NewsCandidate } from './types/database.ts'

export const NATIONAL_SLUG = 'national'
export const NATIONAL_NAME = 'UK National'

type CandidateScope = Pick<NewsCandidate, 'scope_type' | 'city_slug' | 'city_name'>
type CandidatePublishFields = Pick<NewsCandidate, 'scope_type' | 'city_slug' | 'city_name' | 'headline' | 'url' | 'source' | 'published_at'>
type CandidateUnpublishFields = Pick<NewsCandidate, 'scope_type' | 'city_slug' | 'city_name' | 'url'>

export function canPublishCandidate(reviewStatus: NewsCandidate['review_status']): boolean {
  return reviewStatus === 'approved' || reviewStatus === 'published'
}

export function canUnpublishCandidate(reviewStatus: NewsCandidate['review_status']): boolean {
  return reviewStatus === 'published'
}

export interface CandidateCityTarget { city_slug: string; city_name: string }

// A candidate's real target cities live in news_candidate_cities (Phase
// 2) — pass its rows as `cityRows`. For a national candidate that table is
// irrelevant and the single national target is returned regardless of
// what's passed. For a city candidate with no cityRows (e.g. a
// pre-Phase-2 candidate whose join-table backfill somehow didn't run, or
// a caller that hasn't fetched them), this falls back to the legacy
// singular city_slug/city_name columns so nothing that already works
// breaks. An empty result means "cannot resolve a target" — callers must
// treat that as an error, not silently skip it.
export function resolveCityNewsTargets(
  candidate: CandidateScope,
  cityRows: CandidateCityTarget[] = []
): CandidateCityTarget[] {
  if (candidate.scope_type === 'national') return [{ city_slug: NATIONAL_SLUG, city_name: NATIONAL_NAME }]
  if (cityRows.length) return cityRows
  if (candidate.city_slug && candidate.city_name) return [{ city_slug: candidate.city_slug, city_name: candidate.city_name }]
  return []
}

export interface CityNewsUpsertRow {
  city_slug: string; city_name: string; headline: string; url: string
  source: string | null; published_at: string | null; fetched_at: string; is_editorial: true
}

// One upsert row per target city (or exactly one, for national). Returns
// [] — not null — when there are no resolvable targets, so callers can
// treat "nothing to publish" uniformly whether it came from a malformed
// national candidate or a city candidate with no cities attached.
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
    published_at:  candidate.published_at,
    fetched_at:    now,
    is_editorial:  true as const,
  }))
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

// Always revalidates '/' (cheap and idempotent even when a city-scoped
// story can't actually appear there today) plus one '/cities/<name>' path
// per target city.
export function revalidatePathsForCandidate(
  candidate: CandidateScope,
  targets: CandidateCityTarget[] = []
): string[] {
  const paths = ['/']
  if (candidate.scope_type === 'city') {
    for (const target of targets) {
      paths.push('/cities/' + encodeURIComponent(target.city_name))
    }
  }
  return paths
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
