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
  resolveCityNewsTargets,
  buildPublishUpsertRows,
  buildUnpublishDeleteFilter,
  buildPublishCandidatePatch,
  buildUnpublishCandidatePatch,
  revalidatePathsForCandidate,
  normalizeUrl,
  describeDuplicateUrl,
} from './newsPublishing.ts'

const NOW = '2026-09-30T12:00:00.000Z'
const LATER = '2026-09-30T13:00:00.000Z'

// A "national manual candidate" — every candidate in this system is
// manually created (RSS writes straight to city_news, never to
// news_candidates — see src/lib/cityNews.ts), so this doubles as
// requirement 6's "national manual candidate" test fixture.
function nationalCandidate(overrides: Record<string, unknown> = {}) {
  return {
    scope_type: 'national' as const,
    city_slug: null,
    city_name: null,
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

describe('resolveCityNewsTargets — national manual candidate', () => {
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
    assert.deepEqual(resolveCityNewsTargets({ scope_type: 'city', city_slug: null, city_name: null }), [])
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
      published_at: '2026-09-29T09:00:00.000Z',
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
  test('national candidate revalidates only the homepage', () => {
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
