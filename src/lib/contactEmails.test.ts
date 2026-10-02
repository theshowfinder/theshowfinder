// Regression guard for the retirement of advertise@theshowfinder.com
// (replaced everywhere with hello@theshowfinder.com). The project's test
// runner only globs src/lib/*.test.ts (see package.json's "test"
// script) and there's no React-rendering test setup for src/app pages,
// so this reads the two affected page source files directly from disk
// rather than importing/rendering them — the simplest way to get real
// regression coverage for page content within the existing test
// architecture, without adding new testing infrastructure.
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const CONTACT_PAGE_PATH   = join(process.cwd(), 'src/app/contact/page.tsx')
const ADVERTISE_PAGE_PATH = join(process.cwd(), 'src/app/advertise/page.tsx')

const RETIRED_ADDRESS = 'advertise@theshowfinder.com'
const CURRENT_ADDRESS = 'hello@theshowfinder.com'

describe('Contact page — advertise@theshowfinder.com retirement', () => {
  const content = readFileSync(CONTACT_PAGE_PATH, 'utf-8')

  test('never references the retired advertise@ address', () => {
    assert.ok(!content.includes(RETIRED_ADDRESS), 'contact page should not reference advertise@theshowfinder.com')
  })

  test('the "Business & advertising" mailto link points at hello@', () => {
    assert.ok(content.includes(`mailto:${CURRENT_ADDRESS}`), 'contact page should have a mailto: link to hello@theshowfinder.com')
  })

  test('the visible email text reads hello@theshowfinder.com', () => {
    // Appears twice on this page (general enquiries + business/advertising) —
    // both should read the current address, never the retired one.
    const occurrences = content.split(CURRENT_ADDRESS).length - 1
    assert.ok(occurrences >= 2, 'expected hello@theshowfinder.com to appear at least twice (visible text for two sections)')
  })
})

describe('Advertise page — advertise@theshowfinder.com retirement', () => {
  const content = readFileSync(ADVERTISE_PAGE_PATH, 'utf-8')

  test('never references the retired advertise@ address', () => {
    assert.ok(!content.includes(RETIRED_ADDRESS), 'advertise page should not reference advertise@theshowfinder.com')
  })

  test('the mailto link points at hello@', () => {
    assert.ok(content.includes(`mailto:${CURRENT_ADDRESS}`), 'advertise page should have a mailto: link to hello@theshowfinder.com')
  })

  test('the visible email text reads hello@theshowfinder.com', () => {
    // Appears twice in the source: once in the mailto: href, once as the
    // link's visible text — JSX renders the text node on its own
    // indented line, so this checks occurrence count rather than exact
    // ">address<" adjacency.
    const occurrences = content.split(CURRENT_ADDRESS).length - 1
    assert.ok(occurrences >= 2, 'expected hello@theshowfinder.com to appear at least twice (href + visible text)')
  })

  test('the page wording and URL are untouched by the email swap', () => {
    assert.ok(content.includes('Advertise with TheShowFinder'), 'page heading/title wording should be unchanged')
    assert.ok(content.includes("alternates:  { canonical: 'https://www.theshowfinder.com/advertise' }"), 'canonical URL should be unchanged')
  })
})
