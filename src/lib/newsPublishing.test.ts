// Unit tests for src/lib/newsPublishing.ts — the pure publish/unpublish
// logic behind /admin/news's Publish and Unpublish actions.
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
  resolveCityNewsTarget,
  buildPublishUpsertRow,
  buildUnpublishDeleteFilter,
  buildPublishCandidatePatch,
  buildUnpublishCandidatePatch,
  revalidatePathsForCandidate,
} from './newsPublishing.ts'

const NOW = '2026-09-30T12:00:00.000Z'
const LATER = '2026-09-30T13:00:00.000Z'

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

describe('resolveCityNewsTarget', () => {
  test('national candidate resolves to the NATIONAL_SLUG sentinel', () => {
    const target = resolveCityNewsTarget(nationalCandidate())
    assert.deepEqual(target, { city_slug: 'national', city_name: 'UK National' })
  })

  test('city candidate resolves to its own slug/name', () => {
    const target = resolveCityNewsTarget(cityCandidate())
    assert.deepEqual(target, { city_slug: 'derby', city_name: 'Derby' })
  })

  test('malformed city candidate (missing slug/name) resolves to null', () => {
    assert.equal(resolveCityNewsTarget({ scope_type: 'city', city_slug: null, city_name: null }), null)
  })
})

describe('buildPublishUpsertRow', () => {
  test('national candidate produces a national city_news row, is_editorial true', () => {
    const row = buildPublishUpsertRow(nationalCandidate(), NOW)
    assert.deepEqual(row, {
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

  test('city candidate produces a city-scoped row', () => {
    const row = buildPublishUpsertRow(cityCandidate(), NOW)
    assert.equal(row?.city_slug, 'derby')
    assert.equal(row?.city_name, 'Derby')
    assert.equal(row?.is_editorial, true)
  })

  test('returns null when the candidate has no resolvable city', () => {
    const row = buildPublishUpsertRow(cityCandidate({ city_slug: null, city_name: null }), NOW)
    assert.equal(row, null)
  })
})

describe('buildUnpublishDeleteFilter', () => {
  test('matches the exact row buildPublishUpsertRow would have created', () => {
    const candidate = cityCandidate()
    const upsertRow = buildPublishUpsertRow(candidate, NOW)
    const deleteFilter = buildUnpublishDeleteFilter(candidate)
    assert.deepEqual(deleteFilter, {
      city_slug: upsertRow!.city_slug,
      url: upsertRow!.url,
      is_editorial: true,
    })
  })

  test('is_editorial: true is always present — this is the RSS-safety guard', () => {
    assert.equal(buildUnpublishDeleteFilter(nationalCandidate())?.is_editorial, true)
    assert.equal(buildUnpublishDeleteFilter(cityCandidate())?.is_editorial, true)
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
    assert.deepEqual(revalidatePathsForCandidate(nationalCandidate()), ['/'])
  })

  test('city candidate revalidates the homepage and its city page', () => {
    assert.deepEqual(revalidatePathsForCandidate(cityCandidate()), ['/', '/cities/Derby'])
  })
})

// ── Full-cycle simulation: publish -> unpublish -> publish again ──────────
// A minimal in-memory stand-in for the city_news table, applying the exact
// same upsert/delete semantics publishNewsCandidateAction /
// unpublishNewsCandidateAction use against Supabase (upsert on
// city_slug+url; delete filtered on city_slug+url+is_editorial). This is
// what actually proves requirements 2, 3, 7 and 8 end-to-end, not just that
// each builder function returns the right shape in isolation.
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

  deleteWhere(filter: { city_slug: string; url: string; is_editorial: boolean }) {
    const before = this.rows.length
    this.rows = this.rows.filter(
      r => !(r.city_slug === filter.city_slug && r.url === filter.url && r.is_editorial === filter.is_editorial),
    )
    return before - this.rows.length // rows actually deleted
  }

  find(city_slug: string, url: string) {
    return this.rows.find(r => r.city_slug === city_slug && r.url === url) ?? null
  }
}

describe('publish -> unpublish -> publish again (full cycle)', () => {
  test('the whole cycle behaves correctly against a simulated city_news table', () => {
    const table = new FakeCityNewsTable()
    const candidate = cityCandidate()

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
    const publishRow = buildPublishUpsertRow(candidate, NOW)!
    table.upsert(publishRow)
    candidateState = { ...candidateState, ...buildPublishCandidatePatch(NOW) }

    assert.equal(table.find('derby', candidate.url)?.is_editorial, true)
    assert.equal(candidateState.review_status, 'published')
    assert.equal(candidateState.published_to_city_news_at, NOW)
    assert.deepEqual(table.find('derby', rssRow.url), rssRow) // RSS row untouched

    // 2. Unpublish.
    assert.equal(canUnpublishCandidate(candidateState.review_status as never), true)
    const deleteFilter = buildUnpublishDeleteFilter(candidate)!
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
    const republishRow = buildPublishUpsertRow(candidate, republishTime)!
    table.upsert(republishRow)
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

    const deletedCount = table.deleteWhere(buildUnpublishDeleteFilter(candidate)!)

    assert.equal(deletedCount, 0)
    assert.deepEqual(table.find('derby', candidate.url), collidingRssRow)
  })
})
