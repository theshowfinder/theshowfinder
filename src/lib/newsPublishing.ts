// Pure publish/unpublish logic for the News Intelligence Inbox
// (supabase/migration_026_news_candidates.sql). Extracted out of
// src/app/admin/actions.ts so the publish <-> unpublish contract can be
// unit-tested directly (src/lib/newsPublishing.test.ts) without pulling in
// Next.js server-action machinery (cookies/redirect/revalidatePath) or a
// live Supabase connection.
//
// Every function here is a pure data-in/data-out helper — no DB calls, no
// side effects. actions.ts feeds their output straight into the same
// db.from(...) calls it always used; this file only decides *what* to
// write, never *how* to write it, so it stays consistent with the rest of
// the codebase's style of calling the Supabase client directly.
//
// Uses relative imports with explicit .ts extensions (not the '@/' alias
// used everywhere else in this codebase) specifically so the test file can
// run standalone with plain `node --test` — Node's native ESM loader
// requires explicit extensions and has no tsconfig `paths` alias
// resolution.
//
// NATIONAL_SLUG/NATIONAL_NAME are deliberately re-declared here rather than
// imported from ./cityNews.ts: that file also imports `rss-parser` and
// `@/lib/supabase/admin`/`@/lib/cities` via the '@/' alias, which would
// drag the whole RSS pipeline (and its unresolvable-under-plain-node
// aliases) into this file's dependency graph just to get two string
// constants. Values must stay in sync with cityNews.ts's own
// NATIONAL_SLUG/NATIONAL_NAME by hand — both are stable, long-settled
// sentinels (unlikely to change), and pulling cityNews.ts in just to
// compare them isn't worth reintroducing the alias problem this avoids.
import type { NewsCandidate } from './types/database.ts'

export const NATIONAL_SLUG = 'national'
export const NATIONAL_NAME = 'UK National'

type CandidateScope = Pick<NewsCandidate, 'scope_type' | 'city_slug' | 'city_name'>
type CandidatePublishFields = Pick<NewsCandidate, 'scope_type' | 'city_slug' | 'city_name' | 'headline' | 'url' | 'source' | 'published_at'>
type CandidateUnpublishFields = Pick<NewsCandidate, 'scope_type' | 'city_slug' | 'city_name' | 'url'>

export function canPublishCandidate(reviewStatus: NewsCandidate['review_status']): boolean {
  // 'published' is allowed through too — re-publishing (e.g. after editing
  // the headline) just re-upserts the same city_news row.
  return reviewStatus === 'approved' || reviewStatus === 'published'
}

export function canUnpublishCandidate(reviewStatus: NewsCandidate['review_status']): boolean {
  return reviewStatus === 'published'
}

export interface CandidateCityTarget {
  city_slug: string
  city_name: string
}

// Resolves the exact city_news identity (city_slug/city_name) a candidate
// maps to. Centralised so publish and unpublish can never disagree about
// which row belongs to which candidate — both call this, not two separate
// copies of the national/city branching.
export function resolveCityNewsTarget(candidate: CandidateScope): CandidateCityTarget | null {
  if (candidate.scope_type === 'national') return { city_slug: NATIONAL_SLUG, city_name: NATIONAL_NAME }
  if (candidate.city_slug && candidate.city_name) return { city_slug: candidate.city_slug, city_name: candidate.city_name }
  return null
}

export interface CityNewsUpsertRow {
  city_slug: string
  city_name: string
  headline: string
  url: string
  source: string | null
  published_at: string | null
  fetched_at: string
  is_editorial: true
}

// The row publishNewsCandidateAction upserts into city_news, keyed on its
// existing (city_slug, url) unique constraint — so publishing the same
// candidate twice re-writes this same row instead of duplicating it.
export function buildPublishUpsertRow(candidate: CandidatePublishFields, now: string): CityNewsUpsertRow | null {
  const target = resolveCityNewsTarget(candidate)
  if (!target) return null
  return {
    city_slug: target.city_slug,
    city_name: target.city_name,
    headline: candidate.headline,
    url: candidate.url,
    source: candidate.source,
    published_at: candidate.published_at,
    fetched_at: now,
    is_editorial: true,
  }
}

export interface CityNewsDeleteFilter {
  city_slug: string
  url: string
  is_editorial: true
}

// The filter unpublishNewsCandidateAction deletes by. is_editorial: true is
// load-bearing, not decorative — it's what makes this structurally unable
// to ever match an RSS-sourced row, even one that happened to share the
// exact same (city_slug, url) by coincidence. An RSS row always has
// is_editorial = false (the column default), so it can never satisfy this
// filter, and a different candidate's published row has a different url,
// so it can't either.
export function buildUnpublishDeleteFilter(candidate: CandidateUnpublishFields): CityNewsDeleteFilter | null {
  const target = resolveCityNewsTarget(candidate)
  if (!target) return null
  return { city_slug: target.city_slug, url: candidate.url, is_editorial: true }
}

export interface PublishCandidatePatch {
  review_status: 'published'
  published_to_city_news_at: string
  updated_at: string
}

export function buildPublishCandidatePatch(now: string): PublishCandidatePatch {
  return { review_status: 'published', published_to_city_news_at: now, updated_at: now }
}

export interface UnpublishCandidatePatch {
  review_status: 'approved'
  published_to_city_news_at: null
  updated_at: string
}

// Unpublishing returns the candidate to 'approved' (not 'pending') — it was
// reviewed and approved before it went live, and that review doesn't
// become invalid just because the public row was pulled; only the
// publish-specific metadata is cleared. reviewed_at is deliberately left
// alone for the same reason.
export function buildUnpublishCandidatePatch(now: string): UnpublishCandidatePatch {
  return { review_status: 'approved', published_to_city_news_at: null, updated_at: now }
}

// Paths to revalidate after a publish or unpublish. This codebase has no
// separate "national news" route today — the national feed only renders on
// the homepage (src/app/page.tsx) — so '/' stands in for both "homepage"
// and "national news page" until/unless a dedicated route exists.
export function revalidatePathsForCandidate(candidate: CandidateScope): string[] {
  const paths = ['/']
  if (candidate.scope_type === 'city' && candidate.city_name) {
    paths.push('/cities/' + encodeURIComponent(candidate.city_name))
  }
  return paths
}
