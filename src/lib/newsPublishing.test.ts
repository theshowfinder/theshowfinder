// Unit tests for src/lib/newsPublishing.ts — the pure publish/unpublish
// logic behind /admin/news's Publish and Unpublish actions, plus (Phase 2)
// URL canonicalization/duplicate-detection and multi-city targeting.
//
// Run with: node --test src/lib/newsPublishing.test.ts
// (or `npm test`, which runs every *.test.ts under src/lib). Uses Node's
// built-in test runner — no new dependency, and Node's native TypeScript
// support (Node 22.6+) runs this file directly, no build step needed.
//
// These test the real, shipped functions (imported below), not a
// reimplemented copy — so a change to the actual publish/unpublish
// contract in newsPublishing.ts will fail these tests directly.
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  canPublishCandidate,
  canUnpublishCandidate,
  isBlockedTestContent,
  resolveCityNewsTargets,
  buildPublishUpsertRows,
  buildUnpublishDeleteFilter,
  buildPublishCandidatePatch,
  buildUnpublishCandidatePatch,
  revalidatePathsForCandidate,
  normalizeUrl,
  describeDuplicateUrl,
  rankCityNewsForDisplay,
  selectStaleCityNewsIds,
  NATIONAL_SLUG,
  NATIONAL_NAME,
  NEWS_HUB_SLUG,
  NEWS_HUB_NAME,
  didAiSuggestionFail,
  candidateAttentionReasons,
  isCandidateVisibleAtDestination,
  STALE_PENDING_MS,
  STALE_APPROVED_MS,
  describeDestinations,
  buildDefaultHashtags,
  buildShareKitDefaults,
  buildShareKitPlatformLinks,
  destinationDisplayLimit,
  sortNewsCandidatesForQueue,
  matchesNewsQueueFilters,
  RECENT_QUEUE_WINDOW_MS,
} from './newsPublishing.ts'
import type { NewsCandidate } from './types/database.ts'

const NOW = '2026-09-30T12:00:00.000Z'
const LATER = '2026-09-30T13:00:00.000Z'

// A "national manual candidate" — every candidate in this system is
// manually created (RSS writes straight to city_news, never to
// news_candidates — see src/lib/cityNews.ts), so this doubles as
// requirement 6's "national manual candidate" test fixture.
// publish_to_homepage: true models migration_029's backfill
// (`UPDATE news_candidates SET publish_to_homepage = true WHERE
// scope_type = 'national'`) — every *pre-existing* national candidate
// keeps resolving to the homepage exactly as it always did. A *new*
// national candidate created after the migration starts with both
// destination flags false (see the 'destination combinations' describe
// block below) — scope_type 'national' no longer implies Homepage by
// itself.
function nationalCandidate(overrides: Record<string, unknown> = {}) {
  return {
    scope_type: 'national' as const,
    city_slug: null,
    city_name: null,
    publish_to_homepage: true,
    publish_to_news_page: false,
    headline: 'Oasis add second Wembley date',
    url: 'https://nme.com/oasis-wembley-2',
    source: 'NME',
    published_at: '2026-09-29T09:00:00.000Z',
    ...overrides,
  }
}

// A "city manual candidate" — single-city case (legacy columns populated,
// as every pre-Phase-2 candidate and every new single-city one is).
function cityCandidate(overrides: Record<string, unknown> = {}) {
  return {
    scope_type: 'city' as const,
    city_slug: 'derby',
    city_name: 'Derby',
    publish_to_homepage: false,
    publish_to_news_page: false,
    headline: 'Vaillant Live announces new autumn residency',
    url: 'https://derbytelegraph.co.uk/vaillant-live-residency',
    source: 'Derby Telegraph',
    published_at: '2026-09-29T09:00:00.000Z',
    ...overrides,
  }
}

const DERBY = { city_slug: 'derby', city_name: 'Derby' }
const NOTTINGHAM = { city_slug: 'nottingham', city_name: 'Nottingham' }
const LEICESTER = { city_slug: 'leicester', city_name: 'Leicester' }

describe('canPublishCandidate / canUnpublishCandidate', () => {
  test('publish allowed from approved and published, blocked otherwise', () => {
    assert.equal(canPublishCandidate('approved'), true)
    assert.equal(canPublishCandidate('published'), true)
    assert.equal(canPublishCandidate('pending'), false)
    assert.equal(canPublishCandidate('rejected'), false)
  })

  test('unpublish allowed only from published', () => {
    assert.equal(canUnpublishCandidate('published'), true)
    assert.equal(canUnpublishCandidate('approved'), false)
    assert.equal(canUnpublishCandidate('pending'), false)
    assert.equal(canUnpublishCandidate('rejected'), false)
  })
})

// Daily Intelligence investigation, 2 Oct 2026: a leftover seed/test row
// ("Showfinder Phase 1 Test — Do Not Share") was sitting at review_status
// 'approved' — canPublishCandidate correctly allows that, so this is the
// separate, content-level guard that actually blocks it (wired into
// publishNewsCandidateAction in src/app/admin/actions.ts).
describe('isBlockedTestContent', () => {
  test('blocks the exact reported test headline', () => {
    assert.equal(isBlockedTestContent('Showfinder Phase 1 Test — Do Not Share'), true)
  })

  test('is case-insensitive', () => {
    assert.equal(isBlockedTestContent('showfinder phase 1 test — DO NOT SHARE'), true)
  })

  test('also blocks the "do not publish" variant', () => {
    assert.equal(isBlockedTestContent('Internal seed row — do not publish'), true)
  })

  test('a genuine editorial headline is never blocked', () => {
    assert.equal(isBlockedTestContent('Oasis announce surprise Manchester reunion show'), false)
    assert.equal(isBlockedTestContent('Birmingham Hippodrome unveils 2027 panto lineup'), false)
  })

  test('the word "test" alone, with no opt-out phrase, is not blocked — stays narrow to avoid false positives on genuine headlines', () => {
    assert.equal(isBlockedTestContent('Taste Test: five festival food stalls worth queuing for'), false)
  })
})

describe('resolveCityNewsTargets — national manual candidate (migrated, publish_to_homepage backfilled true)', () => {
  test('resolves to the single NATIONAL_SLUG sentinel target, regardless of any cityRows passed', () => {
    assert.deepEqual(resolveCityNewsTargets(nationalCandidate()), [{ city_slug: 'national', city_name: 'UK National' }])
    assert.deepEqual(resolveCityNewsTargets(nationalCandidate(), [DERBY]), [{ city_slug: 'national', city_name: 'UK National' }])
  })
})

describe('resolveCityNewsTargets — city manual candidate', () => {
  test('single city: cityRows (news_candidate_cities) is the source of truth', () => {
    assert.deepEqual(resolveCityNewsTargets(cityCandidate(), [DERBY]), [DERBY])
  })

  test('falls back to the legacy singular city_slug/city_name when no cityRows are passed', () => {
    assert.deepEqual(resolveCityNewsTargets(cityCandidate()), [{ city_slug: 'derby', city_name: 'Derby' }])
  })

  test('multi-city: every row in cityRows becomes a target', () => {
    const targets = resolveCityNewsTargets(cityCandidate(), [DERBY, NOTTINGHAM, LEICESTER])
    assert.deepEqual(targets, [DERBY, NOTTINGHAM, LEICESTER])
  })

  test('malformed city candidate (missing slug/name, no cityRows) resolves to an empty list, not null', () => {
    assert.deepEqual(
      resolveCityNewsTargets({ scope_type: 'city', city_slug: null, city_name: null, publish_to_homepage: false, publish_to_news_page: false }),
      [],
    )
  })
})

// migration_029 — Homepage and Main News page are independent destination
// flags, completely separate from scope_type/cities. Covers every
// combination requirement 'Add tests for each destination combination'
// calls for: Homepage alone, News page alone, both together, both plus
// cities, News page plus cities with Homepage explicitly off, and a
// scope_type 'national' candidate with neither flag set (proving national
// no longer implies Homepage on its own).
describe('resolveCityNewsTargets — destination combinations (migration_029)', () => {
  test('Homepage only: a national candidate with no destinations selected resolves to zero targets — national no longer implies Homepage', () => {
    const candidate = nationalCandidate({ publish_to_homepage: false, publish_to_news_page: false })
    assert.deepEqual(resolveCityNewsTargets(candidate), [])
  })

  test('Homepage only, explicitly opted in', () => {
    const candidate = nationalCandidate({ publish_to_homepage: true, publish_to_news_page: false })
    assert.deepEqual(resolveCityNewsTargets(candidate), [{ city_slug: NATIONAL_SLUG, city_name: NATIONAL_NAME }])
  })

  test('Main News page only (national candidate, Homepage off)', () => {
    const candidate = nationalCandidate({ publish_to_homepage: false, publish_to_news_page: true })
    assert.deepEqual(resolveCityNewsTargets(candidate), [{ city_slug: NEWS_HUB_SLUG, city_name: NEWS_HUB_NAME }])
  })

  test('Homepage + Main News page together (national candidate, no cities)', () => {
    const candidate = nationalCandidate({ publish_to_homepage: true, publish_to_news_page: true })
    assert.deepEqual(resolveCityNewsTargets(candidate), [
      { city_slug: NATIONAL_SLUG, city_name: NATIONAL_NAME },
      { city_slug: NEWS_HUB_SLUG, city_name: NEWS_HUB_NAME },
    ])
  })

  test('Homepage + Main News page + multiple cities, all at once', () => {
    const candidate = cityCandidate({ publish_to_homepage: true, publish_to_news_page: true })
    const targets = resolveCityNewsTargets(candidate, [DERBY, NOTTINGHAM])
    assert.deepEqual(targets, [
      { city_slug: NATIONAL_SLUG, city_name: NATIONAL_NAME },
      { city_slug: NEWS_HUB_SLUG, city_name: NEWS_HUB_NAME },
      DERBY,
      NOTTINGHAM,
    ])
  })

  test('Main News page + selected cities only, Homepage explicitly off', () => {
    const candidate = cityCandidate({ publish_to_homepage: false, publish_to_news_page: true })
    const targets = resolveCityNewsTargets(candidate, [DERBY, LEICESTER])
    assert.deepEqual(targets, [
      { city_slug: NEWS_HUB_SLUG, city_name: NEWS_HUB_NAME },
      DERBY,
      LEICESTER,
    ])
  })

  test('cities only — neither Homepage nor Main News page selected (today\'s default for a brand-new city candidate)', () => {
    const candidate = cityCandidate({ publish_to_homepage: false, publish_to_news_page: false })
    assert.deepEqual(resolveCityNewsTargets(candidate, [DERBY]), [DERBY])
  })

  test('nothing selected at all: national scope, both destination flags false, no cities applicable — zero targets, not a crash', () => {
    const candidate = nationalCandidate({ publish_to_homepage: false, publish_to_news_page: false })
    assert.deepEqual(resolveCityNewsTargets(candidate), [])
  })
})

// publishNewsCandidateAction (src/app/admin/actions.ts) guards publishing
// with exactly `if (!resolveCityNewsTargets(candidate, cityTargets).length)
// throw ...` before it ever upserts a city_news row — this is the
// migration_029 safeguard that stops a candidate with no Homepage, no
// Main News page and no city targets from "publishing" successfully while
// appearing nowhere on the public site. These tests exercise that exact
// condition against the real resolveCityNewsTargets/buildPublishUpsertRows
// functions the action calls, proving the guard fires precisely when (and
// only when) there is truly nothing to publish to, and that zero rows
// would ever be written for such a candidate even if the guard were
// bypassed. Saving a candidate with no destinations is never blocked —
// only the publish action is.
describe('publish guard — a candidate with no selected destination is blocked, not silently published nowhere (migration_029)', () => {
  test('national candidate with both destination flags false and no cities: resolveCityNewsTargets is empty, so the action\'s guard fires', () => {
    const candidate = nationalCandidate({ publish_to_homepage: false, publish_to_news_page: false })
    const targets = resolveCityNewsTargets(candidate, [])
    assert.deepEqual(targets, [])
    // Mirrors the exact check in publishNewsCandidateAction.
    assert.equal(!targets.length, true, 'the publish action must refuse to publish this candidate')
  })

  test('city-scoped candidate with no destination flags and no cityRows: same empty result, same guard', () => {
    const candidate = cityCandidate({ publish_to_homepage: false, publish_to_news_page: false, city_slug: null, city_name: null })
    const targets = resolveCityNewsTargets(candidate, [])
    assert.deepEqual(targets, [])
    assert.equal(!targets.length, true, 'the publish action must refuse to publish this candidate')
  })

  test('even if the guard were bypassed, buildPublishUpsertRows writes zero city_news rows for an empty target list — nothing ever appears nowhere silently', () => {
    const candidate = nationalCandidate({ publish_to_homepage: false, publish_to_news_page: false })
    const targets = resolveCityNewsTargets(candidate, [])
    assert.deepEqual(buildPublishUpsertRows(candidate, targets, NOW), [])
  })

  test('adding just one destination (Homepage) is enough to clear the guard', () => {
    const candidate = nationalCandidate({ publish_to_homepage: true, publish_to_news_page: false })
    const targets = resolveCityNewsTargets(candidate, [])
    assert.equal(targets.length > 0, true)
  })
})

describe('buildPublishUpsertRows', () => {
  test('national candidate produces exactly one national city_news row, is_editorial true', () => {
    const rows = buildPublishUpsertRows(nationalCandidate(), resolveCityNewsTargets(nationalCandidate()), NOW)
    assert.equal(rows.length, 1)
    assert.deepEqual(rows[0], {
      city_slug: 'national',
      city_name: 'UK National',
      headline: 'Oasis add second Wembley date',
      url: 'https://nme.com/oasis-wembley-2',
      source: 'NME',
      // published_at is the publish timestamp (NOW), not the candidate's own
      // published_at ('2026-09-29T09:00:00.000Z' — the original article's
      // date) — see the dedicated describe block below for the regression
      // this guards against.
      published_at: NOW,
      fetched_at: NOW,
      is_editorial: true,
    })
  })

  test('multi-city candidate produces one row per target city, same headline/url/source', () => {
    const candidate = cityCandidate()
    const rows = buildPublishUpsertRows(candidate, [DERBY, NOTTINGHAM, LEICESTER], NOW)
    assert.equal(rows.length, 3)
    assert.deepEqual(rows.map(r => r.city_slug).sort(), ['derby', 'leicester', 'nottingham'])
    for (const row of rows) {
      assert.equal(row.headline, candidate.headline)
      assert.equal(row.url, candidate.url)
      assert.equal(row.is_editorial, true)
    }
  })

  test('no targets produces no rows', () => {
    assert.deepEqual(buildPublishUpsertRows(cityCandidate(), [], NOW), [])
  })
})

describe('buildPublishUpsertRows — effective publish date (city-ranking fix)', () => {
  // Regression coverage for the Andrea Bocelli bug (2026-09-30): an
  // editorial candidate's own `published_at` holds the ORIGINAL article's
  // date (still admin-editable, still shown as "Original article date" in
  // NewsCandidateForm) — it must never flow into the city_news row that
  // actually drives public ranking/display. The row must instead carry the
  // real Showfinder publish time (`now`), however old or recent the
  // article itself was.
  test('uses `now` for published_at, ignoring an old candidate.published_at entirely', () => {
    const oldArticleDate = '2020-01-01T00:00:00.000Z'
    const candidate = nationalCandidate({ published_at: oldArticleDate })
    const rows = buildPublishUpsertRows(candidate, resolveCityNewsTargets(candidate), NOW)
    assert.equal(rows[0].published_at, NOW)
    assert.notEqual(rows[0].published_at, oldArticleDate)
  })

  test('uses `now` even when candidate.published_at is null (no article date was ever captured)', () => {
    const candidate = nationalCandidate({ published_at: null })
    const rows = buildPublishUpsertRows(candidate, resolveCityNewsTargets(candidate), NOW)
    assert.equal(rows[0].published_at, NOW)
  })

  test('applies the exact same `now` timestamp to every targeted city row, not a per-row value', () => {
    const candidate = cityCandidate({ published_at: '2019-06-15T00:00:00.000Z' })
    const rows = buildPublishUpsertRows(candidate, [DERBY, NOTTINGHAM, LEICESTER], NOW)
    assert.equal(rows.length, 3)
    for (const row of rows) assert.equal(row.published_at, NOW)
    assert.equal(new Set(rows.map(r => r.published_at)).size, 1)
  })

  test('republishing with a later `now` updates published_at to the new publish time', () => {
    const candidate = cityCandidate()
    const first = buildPublishUpsertRows(candidate, [DERBY], NOW)
    const second = buildPublishUpsertRows(candidate, [DERBY], LATER)
    assert.equal(first[0].published_at, NOW)
    assert.equal(second[0].published_at, LATER)
  })
})

describe('buildUnpublishDeleteFilter', () => {
  test('covers every target city in one filter', () => {
    const candidate = cityCandidate()
    const targets = [DERBY, NOTTINGHAM, LEICESTER]
    const filter = buildUnpublishDeleteFilter(candidate, targets)
    assert.deepEqual(filter, {
      city_slugs: ['derby', 'nottingham', 'leicester'],
      url: candidate.url,
      is_editorial: true,
    })
  })

  test('is_editorial: true is always present — this is the RSS-safety guard (requirement 8)', () => {
    assert.equal(buildUnpublishDeleteFilter(nationalCandidate(), resolveCityNewsTargets(nationalCandidate()))?.is_editorial, true)
    assert.equal(buildUnpublishDeleteFilter(cityCandidate(), [DERBY])?.is_editorial, true)
  })

  test('returns null with no targets', () => {
    assert.equal(buildUnpublishDeleteFilter(cityCandidate(), []), null)
  })
})

describe('buildPublishCandidatePatch / buildUnpublishCandidatePatch', () => {
  test('publish patch sets published status + timestamp', () => {
    assert.deepEqual(buildPublishCandidatePatch(NOW), {
      review_status: 'published',
      published_to_city_news_at: NOW,
      updated_at: NOW,
    })
  })

  test('unpublish patch returns to approved and clears publish metadata', () => {
    assert.deepEqual(buildUnpublishCandidatePatch(LATER), {
      review_status: 'approved',
      published_to_city_news_at: null,
      updated_at: LATER,
    })
  })
})

describe('revalidatePathsForCandidate', () => {
  test('national candidate (Homepage target) revalidates only the homepage', () => {
    assert.deepEqual(revalidatePathsForCandidate(nationalCandidate(), resolveCityNewsTargets(nationalCandidate())), ['/'])
  })

  test('single-city candidate revalidates the homepage and its city page', () => {
    assert.deepEqual(revalidatePathsForCandidate(cityCandidate(), [DERBY]), ['/', '/cities/Derby'])
  })

  test('multi-city candidate revalidates the homepage plus every target city page', () => {
    assert.deepEqual(
      revalidatePathsForCandidate(cityCandidate(), [DERBY, NOTTINGHAM]),
      ['/', '/cities/Derby', '/cities/Nottingham']
    )
  })

  test('Main News page target revalidates / and /news', () => {
    const candidate = nationalCandidate({ publish_to_homepage: false, publish_to_news_page: true })
    const targets = resolveCityNewsTargets(candidate)
    assert.deepEqual(revalidatePathsForCandidate(candidate, targets), ['/', '/news'])
  })

  test('Homepage + Main News page + cities all together revalidates all four, with no duplicate \'/\'', () => {
    const candidate = cityCandidate({ publish_to_homepage: true, publish_to_news_page: true })
    const targets = resolveCityNewsTargets(candidate, [DERBY, NOTTINGHAM])
    assert.deepEqual(revalidatePathsForCandidate(candidate, targets), ['/', '/news', '/cities/Derby', '/cities/Nottingham'])
  })

  test('zero destinations (nothing selected) still revalidates \'/\' and nothing else', () => {
    const candidate = nationalCandidate({ publish_to_homepage: false, publish_to_news_page: false })
    assert.deepEqual(revalidatePathsForCandidate(candidate, resolveCityNewsTargets(candidate)), ['/'])
  })
})

describe('normalizeUrl — canonicalization for duplicate detection', () => {
  test('collapses scheme, host case, www., trailing slash and fragment differences', () => {
    const variants = [
      'https://Example.com/story',
      'http://example.com/story',
      'https://www.example.com/story',
      'https://example.com/story/',
      'https://example.com/story#section',
    ]
    const normalized = variants.map(normalizeUrl)
    for (const n of normalized) assert.equal(n, 'https://example.com/story')
  })

  test('leaves the query string alone — different query = different article', () => {
    assert.equal(normalizeUrl('https://example.com/story?id=1'), 'https://example.com/story?id=1')
    assert.notEqual(normalizeUrl('https://example.com/story?id=1'), normalizeUrl('https://example.com/story?id=2'))
  })

  test('an unparseable value passes through trimmed, rather than throwing', () => {
    assert.equal(normalizeUrl('  not a url  '), 'not a url')
  })
})

describe('describeDuplicateUrl (requirement 2: duplicate protection)', () => {
  test('no matches -> no duplicate', () => {
    assert.equal(describeDuplicateUrl(null, null), null)
  })

  test('an existing candidate takes priority over a published city_news row', () => {
    const result = describeDuplicateUrl(
      { headline: 'Already queued story' },
      { headline: 'Already live story', city_name: 'Derby' }
    )
    assert.deepEqual(result, { source: 'candidate', headline: 'Already queued story', cityName: null })
  })

  test('a published city_news row is reported when there is no candidate match', () => {
    const result = describeDuplicateUrl(null, { headline: 'Already live story', city_name: 'Derby' })
    assert.deepEqual(result, { source: 'published', headline: 'Already live story', cityName: 'Derby' })
  })
})

// ── Full-cycle simulation: publish -> unpublish -> publish again ──────────
// A minimal in-memory stand-in for the city_news table, applying the exact
// same upsert/delete semantics publishNewsCandidateAction /
// unpublishNewsCandidateAction use against Supabase (upsert on
// city_slug+url; delete filtered on city_slug (IN) + url + is_editorial).
// This is what actually proves requirements 2, 3, 4, 7 and 8 end-to-end,
// not just that each builder function returns the right shape in
// isolation.
interface CityNewsRow {
  city_slug: string
  city_name: string
  headline: string
  url: string
  source: string | null
  published_at: string | null
  fetched_at: string
  is_editorial: boolean
}

class FakeCityNewsTable {
  rows: CityNewsRow[] = []

  upsert(row: CityNewsRow) {
    const i = this.rows.findIndex(r => r.city_slug === row.city_slug && r.url === row.url)
    if (i >= 0) this.rows[i] = row
    else this.rows.push(row)
  }

  upsertMany(rows: CityNewsRow[]) {
    for (const row of rows) this.upsert(row)
  }

  deleteWhere(filter: { city_slugs: string[]; url: string; is_editorial: boolean }) {
    const before = this.rows.length
    this.rows = this.rows.filter(
      r => !(filter.city_slugs.includes(r.city_slug) && r.url === filter.url && r.is_editorial === filter.is_editorial),
    )
    return before - this.rows.length // rows actually deleted
  }

  find(city_slug: string, url: string) {
    return this.rows.find(r => r.city_slug === city_slug && r.url === url) ?? null
  }
}

describe('publish -> unpublish -> publish again (full cycle, single city)', () => {
  test('the whole cycle behaves correctly against a simulated city_news table', () => {
    const table = new FakeCityNewsTable()
    const candidate = cityCandidate()
    const targets = [DERBY]

    // An unrelated RSS-sourced row for the SAME city — is_editorial: false,
    // different url. Must survive every step below untouched.
    const rssRow: CityNewsRow = {
      city_slug: 'derby',
      city_name: 'Derby',
      headline: 'Derby LIVE announces panto lineup',
      url: 'https://derbytelegraph.co.uk/panto-lineup',
      source: 'Derby Telegraph',
      published_at: '2026-09-28T08:00:00.000Z',
      fetched_at: '2026-09-30T03:00:00.000Z',
      is_editorial: false,
    }
    table.upsert(rssRow)

    // 1. Publish.
    let candidateState: { review_status: string; published_to_city_news_at: string | null } = {
      review_status: 'approved',
      published_to_city_news_at: null,
    }
    assert.equal(canPublishCandidate(candidateState.review_status as never), true)
    table.upsertMany(buildPublishUpsertRows(candidate, targets, NOW))
    candidateState = { ...candidateState, ...buildPublishCandidatePatch(NOW) }

    assert.equal(table.find('derby', candidate.url)?.is_editorial, true)
    assert.equal(candidateState.review_status, 'published')
    assert.equal(candidateState.published_to_city_news_at, NOW)
    assert.deepEqual(table.find('derby', rssRow.url), rssRow) // RSS row untouched

    // 2. Unpublish.
    assert.equal(canUnpublishCandidate(candidateState.review_status as never), true)
    const deleteFilter = buildUnpublishDeleteFilter(candidate, targets)!
    const deletedCount = table.deleteWhere(deleteFilter)
    candidateState = { ...candidateState, ...buildUnpublishCandidatePatch(LATER) }

    assert.equal(deletedCount, 1)
    assert.equal(table.find('derby', candidate.url), null) // gone from the public table
    assert.equal(candidateState.review_status, 'approved') // back to approved, not pending
    assert.equal(candidateState.published_to_city_news_at, null) // metadata cleared
    assert.deepEqual(table.find('derby', rssRow.url), rssRow) // RSS row STILL untouched (req. 8)

    // 3. Unpublishing again is idempotent — the row is already gone.
    const secondDelete = table.deleteWhere(deleteFilter)
    assert.equal(secondDelete, 0) // nothing to delete, no error, clean no-op
    assert.equal(table.find('derby', candidate.url), null)

    // 4. Publish again — proves the cycle is fully reversible.
    const republishTime = '2026-09-30T14:00:00.000Z'
    table.upsertMany(buildPublishUpsertRows(candidate, targets, republishTime))
    candidateState = { ...candidateState, ...buildPublishCandidatePatch(republishTime) }

    assert.equal(table.rows.length, 2) // candidate's row + the untouched RSS row — no duplicates
    assert.equal(table.find('derby', candidate.url)?.fetched_at, republishTime)
    assert.equal(candidateState.review_status, 'published')
    assert.equal(candidateState.published_to_city_news_at, republishTime)
  })

  test('an RSS row sharing the same URL (is_editorial: false) is never deleted by unpublish', () => {
    // Pathological but worth proving directly: even if an RSS row somehow
    // shared the exact same city_slug+url as a published candidate, the
    // is_editorial:true filter means unpublish still can't touch it.
    const table = new FakeCityNewsTable()
    const candidate = cityCandidate()
    const collidingRssRow: CityNewsRow = {
      city_slug: 'derby',
      city_name: 'Derby',
      headline: 'A coincidentally identical URL from the RSS pipeline',
      url: candidate.url,
      source: 'Derby Telegraph',
      published_at: null,
      fetched_at: NOW,
      is_editorial: false,
    }
    table.upsert(collidingRssRow)

    const deletedCount = table.deleteWhere(buildUnpublishDeleteFilter(candidate, [DERBY])!)

    assert.equal(deletedCount, 0)
    assert.deepEqual(table.find('derby', candidate.url), collidingRssRow)
  })
})

describe('publish -> unpublish -> publish again (full cycle, multi-city — requirement 3/6)', () => {
  test('one candidate targeting three cities publishes/unpublishes/republishes as a unit, without touching other cities’ RSS rows', () => {
    const table = new FakeCityNewsTable()
    const candidate = cityCandidate({ headline: 'UK-wide pantomime tour announced', url: 'https://example.com/panto-tour' })
    const targets = [DERBY, NOTTINGHAM, LEICESTER]

    // RSS rows in two of the three target cities, plus a city NOT targeted
    // by this candidate at all — none of these three should ever move.
    const derbyRss: CityNewsRow = { city_slug: 'derby', city_name: 'Derby', headline: 'Derby RSS story', url: 'https://x.test/derby-rss', source: 'X', published_at: null, fetched_at: NOW, is_editorial: false }
    const nottinghamRss: CityNewsRow = { city_slug: 'nottingham', city_name: 'Nottingham', headline: 'Nottingham RSS story', url: 'https://x.test/nottingham-rss', source: 'X', published_at: null, fetched_at: NOW, is_editorial: false }
    const untargetedCityRss: CityNewsRow = { city_slug: 'sheffield', city_name: 'Sheffield', headline: 'Sheffield RSS story, unrelated', url: 'https://x.test/sheffield-rss', source: 'X', published_at: null, fetched_at: NOW, is_editorial: false }
    table.upsertMany([derbyRss, nottinghamRss, untargetedCityRss])

    // 1. Publish — expect exactly 3 new rows, one per target city.
    table.upsertMany(buildPublishUpsertRows(candidate, targets, NOW))
    assert.equal(table.rows.length, 6) // 3 RSS + 3 new editorial rows
    for (const target of targets) {
      const row = table.find(target.city_slug, candidate.url)
      assert.ok(row, `expected a row in ${target.city_slug}`)
      assert.equal(row!.is_editorial, true)
    }

    // 2. Unpublish — all 3 editorial rows go, all 3 RSS rows (including
    // the untargeted city) survive untouched.
    const deleteFilter = buildUnpublishDeleteFilter(candidate, targets)!
    const deletedCount = table.deleteWhere(deleteFilter)
    assert.equal(deletedCount, 3)
    for (const target of targets) assert.equal(table.find(target.city_slug, candidate.url), null)
    assert.deepEqual(table.find('derby', derbyRss.url), derbyRss)
    assert.deepEqual(table.find('nottingham', nottinghamRss.url), nottinghamRss)
    assert.deepEqual(table.find('sheffield', untargetedCityRss.url), untargetedCityRss)

    // 3. Republish — back to 3 editorial rows, still no duplicates and
    // still no RSS row anywhere touched.
    table.upsertMany(buildPublishUpsertRows(candidate, targets, LATER))
    assert.equal(table.rows.length, 6)
    for (const target of targets) assert.equal(table.find(target.city_slug, candidate.url)?.fetched_at, LATER)
  })
})


// ── rankCityNewsForDisplay (public-ranking regression coverage) ─────────────
describe('rankCityNewsForDisplay (requirement: editorial content competes fairly, not permanently, against RSS)', () => {
  function row(published_at: string | null, is_editorial = false, headline = 'row') {
    return { headline, published_at, is_editorial }
  }

  test('an editorial story published today stays in the top 5 even surrounded by many older-dated RSS rows', () => {
    // Models the exact Birmingham/London/Manchester/Glasgow shape: 8 RSS
    // rows with a published_at older than the editorial story's effective
    // publish time, which (pre-fix) pushed Bocelli out of every city's top
    // 5. With published_at correctly set to "today" at publish time, it
    // must now rank first.
    const today = '2026-10-01T09:00:00.000Z'
    const rssRows = Array.from({ length: 8 }, (_, i) =>
      row(`2026-09-2${i % 9}T10:00:00.000Z`, false, `rss-${i}`)
    )
    const editorial = row(today, true, 'Andrea Bocelli announces UK tour dates')

    const ranked = rankCityNewsForDisplay([...rssRows, editorial], 5)

    assert.equal(ranked.length, 5)
    assert.ok(ranked.some(r => r.headline === 'Andrea Bocelli announces UK tour dates'), 'editorial story must appear in the top 5')
    assert.equal(ranked[0].headline, 'Andrea Bocelli announces UK tour dates', 'it should rank first — it is the most recent by published_at')
  })

  test('does NOT permanently rank editorial content above RSS — a newer RSS row still outranks an older editorial one', () => {
    const editorialYesterday = row('2026-09-30T09:00:00.000Z', true, 'editorial')
    const rssToday = row('2026-10-01T09:00:00.000Z', false, 'rss-today')

    const ranked = rankCityNewsForDisplay([editorialYesterday, rssToday], 5)

    assert.equal(ranked[0].headline, 'rss-today', 'a genuinely newer RSS story must outrank an older editorial one')
    assert.equal(ranked[1].headline, 'editorial')
  })

  test('an editorial story naturally falls out of the top N as enough newer content (of either kind) accumulates', () => {
    const editorial = row('2026-09-28T09:00:00.000Z', true, 'editorial')
    const newerDates = [
      '2026-09-30T00:00:00.000Z',
      '2026-10-01T00:00:00.000Z',
      '2026-10-02T00:00:00.000Z',
      '2026-10-03T00:00:00.000Z',
      '2026-10-04T00:00:00.000Z',
    ]
    const newerRss = newerDates.map((d, i) => row(d, false, `rss-${i}`))

    const ranked = rankCityNewsForDisplay([editorial, ...newerRss], 5)

    assert.equal(ranked.length, 5)
    assert.ok(!ranked.some(r => r.headline === 'editorial'), 'editorial story should fall out of the top 5 once 5 newer items exist — no permanent boost')
  })

  test('rows with a null published_at sort last, never crash the comparator', () => {
    const withNull = row(null, false, 'no-date')
    const dated = row('2026-09-30T00:00:00.000Z', false, 'dated')
    const ranked = rankCityNewsForDisplay([withNull, dated], 5)
    assert.deepEqual(ranked.map(r => r.headline), ['dated', 'no-date'])
  })

  test('does not mutate the input array', () => {
    const rows = [row('2026-09-01T00:00:00.000Z'), row('2026-09-30T00:00:00.000Z')]
    const original = [...rows]
    rankCityNewsForDisplay(rows, 1)
    assert.deepEqual(rows, original)
  })
})

// ── selectStaleCityNewsIds (requirement: editorial rows stay protected from RSS pruning) ─
describe('selectStaleCityNewsIds (requirement 8 carried forward: editorial rows survive the daily RSS prune)', () => {
  test('an editorial row absent from today\'s fresh RSS fetch is never marked stale', () => {
    const existing = [
      { id: 'editorial-1', url: 'https://gettothefront.co.uk/andrea-bocelli', is_editorial: true },
      { id: 'rss-1', url: 'https://old-rss-story.test/gone', is_editorial: false },
    ]
    const freshUrls = new Set<string>() // nothing fresh today — worst case for both rows
    const stale = selectStaleCityNewsIds(existing, freshUrls)
    assert.deepEqual(stale, ['rss-1'])
    assert.ok(!stale.includes('editorial-1'), 'editorial row must never be pruned, regardless of RSS freshness')
  })

  test('an RSS row still present in today\'s fresh fetch is not pruned either', () => {
    const existing = [{ id: 'rss-1', url: 'https://still-there.test/story', is_editorial: false }]
    const freshUrls = new Set(['https://still-there.test/story'])
    assert.deepEqual(selectStaleCityNewsIds(existing, freshUrls), [])
  })

  test('mixed set: only the genuinely-stale RSS row is selected', () => {
    const existing = [
      { id: 'editorial-1', url: 'https://example.com/editorial', is_editorial: true },
      { id: 'rss-fresh', url: 'https://example.com/fresh', is_editorial: false },
      { id: 'rss-stale', url: 'https://example.com/stale', is_editorial: false },
    ]
    const freshUrls = new Set(['https://example.com/fresh'])
    assert.deepEqual(selectStaleCityNewsIds(existing, freshUrls), ['rss-stale'])
  })
})

// ── Admin queue health (Phase 4) ────────────────────────────────────────

describe('didAiSuggestionFail', () => {
  test('manual candidates never count, regardless of fields', () => {
    assert.equal(didAiSuggestionFail({ intake_method: 'manual', ai_model: null, ai_suggestions: null }), false)
  })

  test('no API key configured (ai_model null) is not counted as a per-candidate failure', () => {
    assert.equal(didAiSuggestionFail({ intake_method: 'url_import', ai_model: null, ai_suggestions: null }), false)
  })

  test('a successful suggestion (has a headline) is not a failure, even with warnings present', () => {
    assert.equal(didAiSuggestionFail({
      intake_method: 'url_import',
      ai_model: 'claude-haiku-4-5-20251001',
      ai_suggestions: { headline: 'Oasis add second date', warnings: ['AI suggested unsupported cities, ignored: Paris.'] },
    }), false)
  })

  test('a model was invoked but produced no usable headline, with warnings recorded — a real failure', () => {
    assert.equal(didAiSuggestionFail({
      intake_method: 'url_import',
      ai_model: 'claude-haiku-4-5-20251001',
      ai_suggestions: { headline: null, warnings: ['AI suggestion request failed (HTTP 529) — fields left blank for manual entry.'] },
    }), true)
  })

  test('ai_suggestions present but no warnings array at all is not flagged (malformed data, not a known failure shape)', () => {
    assert.equal(didAiSuggestionFail({
      intake_method: 'url_import',
      ai_model: 'claude-haiku-4-5-20251001',
      ai_suggestions: { headline: null },
    }), false)
  })

  test('ai_suggestions is null entirely (model ran somehow with nothing stored) is not flagged — nothing to report', () => {
    assert.equal(didAiSuggestionFail({ intake_method: 'url_import', ai_model: 'claude-haiku-4-5-20251001', ai_suggestions: null }), false)
  })
})

describe('candidateAttentionReasons', () => {
  const NOW = new Date('2026-10-01T12:00:00.000Z').getTime()

  function candidate(overrides: Record<string, unknown> = {}) {
    return {
      review_status: 'pending' as const,
      discovered_at: '2026-10-01T10:00:00.000Z', // 2h ago — fresh
      reviewed_at: null,
      intake_method: 'manual' as const,
      ai_model: null,
      ai_suggestions: null,
      headline: 'A perfectly normal headline',
      ...overrides,
    }
  }

  test('a freshly-added pending candidate with a destination needs no attention', () => {
    assert.deepEqual(candidateAttentionReasons(candidate(), false, NOW), [])
  })

  test('no_destination fires for pending with nowhere to publish', () => {
    assert.deepEqual(candidateAttentionReasons(candidate(), true, NOW), ['no_destination'])
  })

  test('no_destination fires for approved too', () => {
    const c = candidate({ review_status: 'approved', reviewed_at: '2026-10-01T11:50:00.000Z' })
    assert.deepEqual(candidateAttentionReasons(c, true, NOW), ['no_destination'])
  })

  test('no_destination never fires for a published or rejected candidate (destinations are moot once resolved)', () => {
    assert.deepEqual(candidateAttentionReasons(candidate({ review_status: 'published' }), true, NOW), [])
    assert.deepEqual(candidateAttentionReasons(candidate({ review_status: 'rejected' }), true, NOW), [])
  })

  test('stale_pending fires once a pending candidate has sat for longer than STALE_PENDING_MS', () => {
    const c = candidate({ discovered_at: new Date(NOW - STALE_PENDING_MS - 1).toISOString() })
    assert.deepEqual(candidateAttentionReasons(c, false, NOW), ['stale_pending'])
  })

  test('stale_pending does not fire right at the boundary or under it', () => {
    const c = candidate({ discovered_at: new Date(NOW - STALE_PENDING_MS + 1000).toISOString() })
    assert.deepEqual(candidateAttentionReasons(c, false, NOW), [])
  })

  test('approved_not_published fires once an approved candidate has sat unpublished past STALE_APPROVED_MS', () => {
    const c = candidate({ review_status: 'approved', reviewed_at: new Date(NOW - STALE_APPROVED_MS - 1).toISOString() })
    assert.deepEqual(candidateAttentionReasons(c, false, NOW), ['approved_not_published'])
  })

  test('approved_not_published never fires with no reviewed_at recorded (nothing to measure against)', () => {
    const c = candidate({ review_status: 'approved', reviewed_at: null })
    assert.deepEqual(candidateAttentionReasons(c, false, NOW), [])
  })

  test('ai_suggestion_failed combines with other reasons when multiple apply at once', () => {
    const c = candidate({
      review_status: 'pending',
      discovered_at: new Date(NOW - STALE_PENDING_MS - 1).toISOString(),
      intake_method: 'url_import',
      ai_model: 'claude-haiku-4-5-20251001',
      ai_suggestions: { headline: null, warnings: ['AI returned no suggestion text — fields left blank for manual entry.'] },
    })
    assert.deepEqual(candidateAttentionReasons(c, true, NOW), ['no_destination', 'stale_pending', 'ai_suggestion_failed'])
  })

  test('a fully healthy published candidate needs no attention at all', () => {
    const c = candidate({ review_status: 'published', reviewed_at: '2026-09-29T09:00:00.000Z' })
    assert.deepEqual(candidateAttentionReasons(c, false, NOW), [])
  })

  test('blocked_test_content fires for a "Do Not Share" headline regardless of review_status', () => {
    const c = candidate({ headline: 'Showfinder Phase 1 Test — Do Not Share' })
    assert.deepEqual(candidateAttentionReasons(c, false, NOW), ['blocked_test_content'])
  })

  test('blocked_test_content combines with other reasons when multiple apply at once', () => {
    const c = candidate({ headline: 'Showfinder Phase 1 Test — Do Not Share' })
    assert.deepEqual(candidateAttentionReasons(c, true, NOW), ['no_destination', 'blocked_test_content'])
  })

  test('a normal headline never triggers blocked_test_content', () => {
    assert.deepEqual(candidateAttentionReasons(candidate(), false, NOW), [])
  })
})

describe('isCandidateVisibleAtDestination', () => {
  function row(url: string, published_at: string) {
    return { url, published_at }
  }

  test('true when the candidate url is within the top-N for that destination', () => {
    const rows = [row('https://a.com/story', '2026-10-01T09:00:00.000Z'), row('https://b.com/older', '2026-09-28T09:00:00.000Z')]
    assert.equal(isCandidateVisibleAtDestination('https://a.com/story', rows, 5), true)
  })

  test('false once enough newer rows push it out of the visible slice', () => {
    const newer = Array.from({ length: 5 }, (_, i) => row(`https://newer.com/${i}`, `2026-10-0${i + 1}T09:00:00.000Z`))
    const rows = [...newer, row('https://a.com/story', '2026-09-20T09:00:00.000Z')]
    assert.equal(isCandidateVisibleAtDestination('https://a.com/story', rows, 5), false)
  })

  test('false when the candidate url is not present in the destination rows at all', () => {
    const rows = [row('https://b.com/other', '2026-10-01T09:00:00.000Z')]
    assert.equal(isCandidateVisibleAtDestination('https://a.com/story', rows, 5), false)
  })
})

describe('describeDestinations', () => {
  test('both flags off, no cities — empty list', () => {
    assert.deepEqual(describeDestinations({ publish_to_homepage: false, publish_to_news_page: false }, []), [])
  })

  test('Homepage only', () => {
    assert.deepEqual(describeDestinations({ publish_to_homepage: true, publish_to_news_page: false }, []), ['Homepage'])
  })

  test('Main News page only', () => {
    assert.deepEqual(describeDestinations({ publish_to_homepage: false, publish_to_news_page: true }, []), ['Main News page'])
  })

  test('Homepage + Main News page + multiple cities, in a fixed order', () => {
    const result = describeDestinations({ publish_to_homepage: true, publish_to_news_page: true }, ['Derby', 'Nottingham'])
    assert.deepEqual(result, ['Homepage', 'Main News page', 'Derby', 'Nottingham'])
  })

  test('cities only, no homepage/news page', () => {
    assert.deepEqual(describeDestinations({ publish_to_homepage: false, publish_to_news_page: false }, ['Leicester']), ['Leicester'])
  })
})

describe('buildDefaultHashtags', () => {
  const base = { headline: 'h', summary: null, story_type: 'general_entertainment' as const, artist_name: null, url: 'https://theshowfinder.com/news/x', source_url: null }

  test('always includes the brand tag', () => {
    assert.ok(buildDefaultHashtags(base, []).includes('#TheShowFinder'))
  })

  test('includes a hashtag for the artist name when present', () => {
    const tags = buildDefaultHashtags({ ...base, artist_name: 'Van Morrison' }, [])
    assert.ok(tags.includes('#VanMorrison'))
  })

  test('includes a hashtag for each target city', () => {
    const tags = buildDefaultHashtags(base, ['Derby', 'Newcastle upon Tyne'])
    assert.ok(tags.includes('#Derby'))
    assert.ok(tags.includes('#NewcastleUponTyne'))
  })

  test('includes a story-type hashtag where one is mapped', () => {
    const tags = buildDefaultHashtags({ ...base, story_type: 'presale' }, [])
    assert.ok(tags.includes('#Presale'))
  })

  test('falls back to #UK when there are no target cities', () => {
    assert.ok(buildDefaultHashtags(base, []).includes('#UK'))
  })

  test('does not add #UK once at least one city is targeted', () => {
    assert.ok(!buildDefaultHashtags(base, ['Derby']).includes('#UK'))
  })

  test('never produces duplicate tags', () => {
    const tags = buildDefaultHashtags({ ...base, artist_name: 'Derby' }, ['Derby'])
    assert.equal(tags.length, new Set(tags).size)
  })

  test('strips punctuation from a multi-word label into one PascalCase tag', () => {
    const tags = buildDefaultHashtags({ ...base, artist_name: "Gerry Cinnamon & The Band" }, [])
    assert.ok(tags.includes('#GerryCinnamonTheBand'))
  })
})

describe('buildShareKitDefaults', () => {
  const base = { headline: 'Donny Osmond announces VIVA UK Tour', summary: null, story_type: 'tour_announcement' as const, artist_name: 'Donny Osmond', url: 'https://theshowfinder.com/news/donny', source_url: 'https://bbc.co.uk/story' }

  test('uses the candidate headline as-is', () => {
    const kit = buildShareKitDefaults(base, [], null)
    assert.equal(kit.headline, base.headline)
  })

  test('prefers the candidate summary over the AI summary when both exist', () => {
    const kit = buildShareKitDefaults({ ...base, summary: 'Candidate summary' }, [], { summary: 'AI summary' })
    assert.equal(kit.summary, 'Candidate summary')
  })

  test('falls back to the AI summary when the candidate has none', () => {
    const kit = buildShareKitDefaults(base, [], { summary: 'AI summary' })
    assert.equal(kit.summary, 'AI summary')
  })

  test('summary is empty string, not null, when neither source has one', () => {
    const kit = buildShareKitDefaults(base, [], null)
    assert.equal(kit.summary, '')
  })

  test('seeds social caption and email teaser from ai_suggestions when present', () => {
    const kit = buildShareKitDefaults(base, [], { social_caption: 'Caption!', email_teaser: 'Teaser!' })
    assert.equal(kit.socialCaption, 'Caption!')
    assert.equal(kit.emailTeaser, 'Teaser!')
  })

  test('social caption and email teaser default to empty string with no ai_suggestions', () => {
    const kit = buildShareKitDefaults(base, [], null)
    assert.equal(kit.socialCaption, '')
    assert.equal(kit.emailTeaser, '')
  })

  test('source link prefers source_url over the candidate url', () => {
    const kit = buildShareKitDefaults(base, [], null)
    assert.equal(kit.sourceLink, 'https://bbc.co.uk/story')
  })

  test('source link falls back to the candidate url when source_url is null', () => {
    const kit = buildShareKitDefaults({ ...base, source_url: null }, [], null)
    assert.equal(kit.sourceLink, base.url)
  })

  test('carries the resolved city names through unchanged', () => {
    const kit = buildShareKitDefaults(base, ['Derby', 'Leeds'], null)
    assert.deepEqual(kit.cities, ['Derby', 'Leeds'])
  })

  test('hashtags come from buildDefaultHashtags for the same candidate/cities', () => {
    const kit = buildShareKitDefaults(base, ['Derby'], null)
    assert.deepEqual(kit.hashtags, buildDefaultHashtags(base, ['Derby']))
  })
})

describe('buildShareKitPlatformLinks', () => {
  const sourceLink = 'https://theshowfinder.com/news/donny'

  test('returns a tagged link for all four platforms', () => {
    const links = buildShareKitPlatformLinks(sourceLink, 'cand-1')
    assert.deepEqual(Object.keys(links).sort(), ['email', 'facebook', 'instagram', 'tiktok'])
  })

  test('facebook/instagram/tiktok links are tagged medium=social with their own utm_source', () => {
    const links = buildShareKitPlatformLinks(sourceLink, 'cand-1')
    for (const platform of ['facebook', 'instagram', 'tiktok'] as const) {
      const url = new URL(links[platform])
      assert.equal(url.searchParams.get('utm_source'), platform)
      assert.equal(url.searchParams.get('utm_medium'), 'social')
      assert.equal(url.searchParams.get('utm_campaign'), 'share-cand-1')
    }
  })

  test('the email link is tagged medium=email, not social', () => {
    const links = buildShareKitPlatformLinks(sourceLink, 'cand-1')
    const url = new URL(links.email)
    assert.equal(url.searchParams.get('utm_source'), 'email')
    assert.equal(url.searchParams.get('utm_medium'), 'email')
  })

  test('every platform shares the same campaign for the same candidate', () => {
    const links = buildShareKitPlatformLinks(sourceLink, 'cand-9')
    for (const link of Object.values(links)) {
      assert.ok(link.includes('utm_campaign=share-cand-9'))
    }
  })

  test('different candidates produce different campaigns', () => {
    const a = buildShareKitPlatformLinks(sourceLink, 'cand-a')
    const b = buildShareKitPlatformLinks(sourceLink, 'cand-b')
    assert.notEqual(a.facebook, b.facebook)
  })
})

describe('destinationDisplayLimit', () => {
  test('homepage (NATIONAL_SLUG) is 6, matching src/app/page.tsx', () => {
    assert.equal(destinationDisplayLimit(NATIONAL_SLUG), 6)
  })

  test('Main News page (NEWS_HUB_SLUG) is 100, matching src/app/news/page.tsx', () => {
    assert.equal(destinationDisplayLimit(NEWS_HUB_SLUG), 100)
  })

  test('any other slug (a real city) is 5, matching src/app/cities/[city]/page.tsx', () => {
    assert.equal(destinationDisplayLimit('derby'), 5)
  })
})

describe('sortNewsCandidatesForQueue', () => {
  const c = (overrides: Partial<{ id: string; review_status: NewsCandidate['review_status']; priority: NewsCandidate['priority']; discovered_at: string }>) => ({
    id: 'x', review_status: 'pending' as const, priority: 'normal' as const, discovered_at: '2026-09-28T00:00:00.000Z', ...overrides,
  })

  test('pending sorts before approved, before published, before rejected', () => {
    const rows = [
      c({ id: 'a', review_status: 'rejected' }),
      c({ id: 'b', review_status: 'published' }),
      c({ id: 'c', review_status: 'approved' }),
      c({ id: 'd', review_status: 'pending' }),
    ]
    assert.deepEqual(sortNewsCandidatesForQueue(rows).map(r => r.id), ['d', 'c', 'b', 'a'])
  })

  test('within the same status, high priority sorts before normal, before low', () => {
    const rows = [
      c({ id: 'a', priority: 'low' }),
      c({ id: 'b', priority: 'high' }),
      c({ id: 'c', priority: 'normal' }),
    ]
    assert.deepEqual(sortNewsCandidatesForQueue(rows).map(r => r.id), ['b', 'c', 'a'])
  })

  test('within the same status and priority, newest discovered_at sorts first', () => {
    const rows = [
      c({ id: 'a', discovered_at: '2026-09-27T00:00:00.000Z' }),
      c({ id: 'b', discovered_at: '2026-09-29T00:00:00.000Z' }),
      c({ id: 'c', discovered_at: '2026-09-28T00:00:00.000Z' }),
    ]
    assert.deepEqual(sortNewsCandidatesForQueue(rows).map(r => r.id), ['b', 'c', 'a'])
  })

  test('does not mutate the input array', () => {
    const rows = [c({ id: 'a', review_status: 'published' }), c({ id: 'b', review_status: 'pending' })]
    const copy = [...rows]
    sortNewsCandidatesForQueue(rows)
    assert.deepEqual(rows, copy)
  })
})

describe('matchesNewsQueueFilters', () => {
  const NOW_MS = new Date('2026-09-30T12:00:00.000Z').getTime()
  const candidate = (overrides: Partial<{ review_status: NewsCandidate['review_status']; intake_method: NewsCandidate['intake_method']; priority: NewsCandidate['priority']; discovered_at: string }> = {}) => ({
    review_status: 'pending' as const, intake_method: 'manual' as const, priority: 'normal' as const, discovered_at: '2026-09-30T06:00:00.000Z', ...overrides,
  })

  test('no params set — everything matches', () => {
    assert.equal(matchesNewsQueueFilters(candidate(), [], {}, NOW_MS), true)
  })

  test('status filter excludes a non-matching status', () => {
    assert.equal(matchesNewsQueueFilters(candidate({ review_status: 'approved' }), [], { status: 'pending' }, NOW_MS), false)
  })

  test('status filter includes a matching status', () => {
    assert.equal(matchesNewsQueueFilters(candidate({ review_status: 'pending' }), [], { status: 'pending' }, NOW_MS), true)
  })

  test('provenance filter matches intake_method', () => {
    assert.equal(matchesNewsQueueFilters(candidate({ intake_method: 'url_import' }), [], { provenance: 'manual' }, NOW_MS), false)
    assert.equal(matchesNewsQueueFilters(candidate({ intake_method: 'manual' }), [], { provenance: 'manual' }, NOW_MS), true)
  })

  test('priority filter matches priority', () => {
    assert.equal(matchesNewsQueueFilters(candidate({ priority: 'high' }), [], { priority: 'high' }, NOW_MS), true)
    assert.equal(matchesNewsQueueFilters(candidate({ priority: 'low' }), [], { priority: 'high' }, NOW_MS), false)
  })

  test('recent=1 excludes anything discovered more than 7 days ago', () => {
    const old = candidate({ discovered_at: new Date(NOW_MS - RECENT_QUEUE_WINDOW_MS - 1000).toISOString() })
    assert.equal(matchesNewsQueueFilters(old, [], { recent: '1' }, NOW_MS), false)
  })

  test('recent=1 includes anything discovered within the last 7 days', () => {
    const fresh = candidate({ discovered_at: new Date(NOW_MS - 1000).toISOString() })
    assert.equal(matchesNewsQueueFilters(fresh, [], { recent: '1' }, NOW_MS), true)
  })

  test('attention=1 excludes a row with no attention reasons', () => {
    assert.equal(matchesNewsQueueFilters(candidate(), [], { attention: '1' }, NOW_MS), false)
  })

  test('attention=1 includes a row with at least one attention reason', () => {
    assert.equal(matchesNewsQueueFilters(candidate(), ['no_destination'], { attention: '1' }, NOW_MS), true)
  })

  test('multiple active filters combine (AND, not OR)', () => {
    const c = candidate({ review_status: 'pending', priority: 'high' })
    assert.equal(matchesNewsQueueFilters(c, [], { status: 'pending', priority: 'high' }, NOW_MS), true)
    assert.equal(matchesNewsQueueFilters(c, [], { status: 'pending', priority: 'low' }, NOW_MS), false)
  })
})
