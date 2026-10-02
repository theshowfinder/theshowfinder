// cityEventCount.ts underlies the city navigation card's count
// (CitiesGrid.tsx) and each city page's hero stat line (src/app/cities/
// [city]/page.tsx) — both of which take a raw Supabase `count:'exact',
// head:true` query result and used to read only `.count`, never
// `.error`, which is what let a transient query failure render
// identically to "this city has no events" (the intermittent "Coming
// soon" bug reported for London, which plainly has upcoming events).
// These tests exercise the pure resolution/normalization logic directly
// — there is no live Supabase client in this `node --test` runner (same
// reasoning as eventPools.test.ts), so a city-with-events/zero-event/
// error scenario is exercised by constructing the raw `{ count, error }`
// shape Supabase itself would return in each case.

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { resolveCityEventCount, normalizeCityFilterValue, cityNamesMatch } from './cityEventCount.ts'

describe('resolveCityEventCount', () => {
  test('a city with events — a positive count resolves ok with that count', () => {
    const outcome = resolveCityEventCount({ count: 37, error: null })
    assert.deepEqual(outcome, { ok: true, count: 37 })
  })

  test('a genuine zero-event city — null count, no error, resolves ok with 0', () => {
    const outcome = resolveCityEventCount({ count: null, error: null })
    assert.deepEqual(outcome, { ok: true, count: 0 })
  })

  test('a genuine zero-event city — count omitted entirely (no error key) resolves ok with 0', () => {
    const outcome = resolveCityEventCount({ count: null })
    assert.deepEqual(outcome, { ok: true, count: 0 })
  })

  test('a count/query error — null count WITH an error does not resolve as zero', () => {
    const outcome = resolveCityEventCount({ count: null, error: { message: 'canceling statement due to statement timeout' } })
    assert.deepEqual(outcome, { ok: false })
    // The specific regression this guards: before the fix, this exact
    // shape silently became `{ count: 0 }`, which is what rendered as
    // "Coming soon" for a city (London) that has upcoming events — a
    // transient failure must never be indistinguishable from a real zero.
    assert.notDeepEqual(outcome, { ok: true, count: 0 })
  })

  test('an error present alongside a non-null count still resolves as an error', () => {
    // Defensive: Supabase/PostgREST don't populate both in practice, but
    // the error must win if they ever did — a count can't be trusted
    // alongside a reported query error.
    const outcome = resolveCityEventCount({ count: 12, error: { message: 'unexpected' } })
    assert.deepEqual(outcome, { ok: false })
  })
})

describe('normalizeCityFilterValue', () => {
  test('leaves an already-clean name untouched', () => {
    assert.equal(normalizeCityFilterValue('London'), 'London')
  })

  test('trims leading and trailing whitespace', () => {
    assert.equal(normalizeCityFilterValue('  London  '), 'London')
  })

  test('collapses repeated internal whitespace (e.g. "Milton  Keynes")', () => {
    assert.equal(normalizeCityFilterValue('Milton  Keynes'), 'Milton Keynes')
  })

  test('does not change case — .ilike() is already case-insensitive at the database level', () => {
    assert.equal(normalizeCityFilterValue('LONDON'), 'LONDON')
  })
})

describe('cityNamesMatch — case and whitespace city matching', () => {
  test('identical names match', () => {
    assert.equal(cityNamesMatch('London', 'London'), true)
  })

  test('differing case matches (mirrors .ilike() case-insensitivity)', () => {
    assert.equal(cityNamesMatch('london', 'LONDON'), true)
    assert.equal(cityNamesMatch('Manchester', 'mancHESTer'), true)
  })

  test('stray leading/trailing whitespace matches', () => {
    assert.equal(cityNamesMatch(' London', 'London '), true)
  })

  test('doubled internal whitespace matches', () => {
    assert.equal(cityNamesMatch('Milton  Keynes', 'Milton Keynes'), true)
  })

  test('a genuinely different city name does not match', () => {
    assert.equal(cityNamesMatch('London', 'Londonderry'), false)
  })

  test('a genuinely different city name does not match even as a substring', () => {
    assert.equal(cityNamesMatch('Hull', 'Kingston upon Hull'), false)
  })

  // Birmingham city-page build-out (2 Oct 2026): Birmingham named
  // explicitly, matching the same case/whitespace coverage every other
  // city page's count query relies on.
  test('Birmingham case and whitespace variants match', () => {
    assert.equal(cityNamesMatch('Birmingham', 'birmingham'), true)
    assert.equal(cityNamesMatch('BIRMINGHAM', 'Birmingham'), true)
    assert.equal(cityNamesMatch(' Birmingham ', 'Birmingham'), true)
    assert.equal(cityNamesMatch('Birmingham', 'Birmingham, UK'), false)
  })

  test('no two cities in the shared 36-city list collide once normalized', async () => {
    const { CITIES } = await import('./cities.ts')
    for (let i = 0; i < CITIES.length; i++) {
      for (let j = i + 1; j < CITIES.length; j++) {
        assert.equal(
          cityNamesMatch(CITIES[i].name, CITIES[j].name),
          false,
          `${CITIES[i].name} and ${CITIES[j].name} should not collide after case/whitespace normalization`
        )
      }
    }
  })
})

describe('future-date filtering (the shared nowISO / start_date >= now boundary)', () => {
  // The count queries' own future-date guard is `.gte('start_date', nowISO)`
  // — a plain ISO-string comparison. This isn't a new pure function, but
  // the boundary semantics the fix depends on (a query result for a city
  // scoped to upcoming events only) are documented and pinned here so a
  // future change to how "upcoming" is computed doesn't silently drift
  // from what resolveCityEventCount assumes it's being handed.
  test('an event starting exactly "now" is included (>=, not >)', () => {
    const nowISO = '2026-10-02T12:00:00.000Z'
    const eventStart = '2026-10-02T12:00:00.000Z'
    assert.ok(eventStart >= nowISO)
  })

  test('an event one second in the past is excluded', () => {
    const nowISO = '2026-10-02T12:00:00.000Z'
    const eventStart = '2026-10-02T11:59:59.000Z'
    assert.ok(!(eventStart >= nowISO))
  })

  test('an event one second in the future is included', () => {
    const nowISO = '2026-10-02T12:00:00.000Z'
    const eventStart = '2026-10-02T12:00:01.000Z'
    assert.ok(eventStart >= nowISO)
  })
})
