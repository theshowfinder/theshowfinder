import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { auditCityStatic } from './cityPageAudit.ts'
import { CITIES } from './cities.ts'

describe('city page audit (all 40 cities)', () => {
  test('there are exactly 40 city pages', () => assert.equal(CITIES.length, 40))

  test('every city has a unique city-specific title and description, hero image, local intro and nearby areas', () => {
    const rows = auditCityStatic(p => existsSync(join(process.cwd(), 'public', p)))
    const failing = rows.filter(r => r.failures.length).map(r => `${r.city}: ${r.failures.join('; ')}`)
    assert.deepEqual(failing, [])
  })

  // Template-level criteria shared by every city page. Reading the source is
  // the same approach publicEventStatusFilters.test.ts uses (no React renderer).
  const page = readFileSync(join(process.cwd(), 'src/app/cities/[city]/page.tsx'), 'utf-8')

  test('breadcrumbs: visible nav plus BreadcrumbList JSON-LD', () => {
    assert.ok(page.includes('aria-label="Breadcrumb"'))
    assert.ok(page.includes('buildBreadcrumbSchema'))
  })
  test('structured data: breadcrumb, collection page and item list', () => {
    assert.ok(page.includes('buildCityCollectionSchema'))
    assert.ok(page.includes('buildItemListSchema'))
  })
  test('internal links: this-week, this-weekend, venues and nearby towns', () => {
    assert.ok(page.includes('/this-week'))
    assert.ok(page.includes('/this-weekend'))
    assert.ok(page.includes('/venues/'))
    assert.ok(page.includes('nearbyEvents'))
  })
  test('counts come from the one canonical helper and the page revalidates', () => {
    assert.ok(page.includes('listedEventsCount'))
    assert.ok(/export const revalidate = \d+/.test(page))
    assert.ok(!/from\('events_with_venue'\)/.test(page))
  })
  test('event categories are shown (browse by type chips)', () => {
    assert.ok(page.includes('<CityBrowse'))
  })
})
