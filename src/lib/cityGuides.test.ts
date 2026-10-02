// CITY_GUIDE_INTROS (src/lib/cityGuides.ts) feeds the "About {city}'s live
// scene" section on each city page — Birmingham city-page build-out
// (2 Oct 2026): this page is rendered by the exact same shared
// src/app/cities/[city]/page.tsx that already serves Manchester, so there
// is no separate Birmingham template to test — the one thing specific to
// Birmingham is its own entry in this shared content map, confirmed here.

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { CITY_GUIDE_INTROS } from './cityGuides.ts'
import { CITIES } from './cities.ts'

describe('CITY_GUIDE_INTROS', () => {
  test('Birmingham has a non-empty, genuine guide intro, same as Manchester', () => {
    assert.ok(CITY_GUIDE_INTROS.Birmingham, 'Birmingham should have a CITY_GUIDE_INTROS entry')
    assert.ok(CITY_GUIDE_INTROS.Birmingham.trim().length > 50)
    assert.ok(CITY_GUIDE_INTROS.Manchester, 'Manchester should have a CITY_GUIDE_INTROS entry')
    assert.ok(CITY_GUIDE_INTROS.Manchester.trim().length > 50)
  })

  test('every CITY_GUIDE_INTROS key matches a real city in the shared CITIES list (catches a stale/typo key)', () => {
    const cityNames = new Set(CITIES.map(c => c.name))
    for (const key of Object.keys(CITY_GUIDE_INTROS)) {
      assert.ok(cityNames.has(key), `"${key}" in CITY_GUIDE_INTROS is not a city in src/lib/cities.ts`)
    }
  })

  test('no entry is empty or whitespace-only', () => {
    for (const [city, intro] of Object.entries(CITY_GUIDE_INTROS)) {
      assert.ok(intro.trim().length > 0, `${city}'s intro should not be empty`)
    }
  })
})
