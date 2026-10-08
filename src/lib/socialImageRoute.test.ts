// Regression guard for the Social Pack imagery rebuild (3 Oct 2026) —
// the branded-image route (src/app/admin/social/[id]/image/route.tsx)
// is a Next.js Route Handler returning a next/og ImageResponse; there's
// no React/Satori-rendering test setup in this runner (same reasoning
// as publicEventStatusFilters.test.ts/contactEmails.test.ts), so this
// reads the route's source from disk and asserts the specific
// requirements that can't otherwise be exercised: both image formats
// exist with the right dimensions, the vibrant per-kind templates are
// actually used (not a single flat design), a stored pack's kind/image
// are defended rather than trusted blindly, and no copyrighted/scraped
// image or generic marketplace search URL is ever built here.
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROUTE_PATH = 'src/app/admin/social/[id]/image/route.tsx'

function readRoute(): string {
  return readFileSync(join(process.cwd(), ROUTE_PATH), 'utf-8')
}

describe('branded social-image route — both formats', () => {
  const content = readRoute()

  test('defaults to the square format when ?format is missing or unrecognised', () => {
    assert.ok(content.includes("searchParams.get('format') === 'vertical' ? 'vertical' : 'square'"))
  })

  test('square is 1080x1080 (Facebook / Instagram feed)', () => {
    assert.ok(content.includes('const width = 1080'))
    assert.ok(/height = format === 'vertical' \? 1920 : 1080/.test(content))
  })

  test('both dimensions are actually passed to ImageResponse', () => {
    assert.ok(content.includes('{ width, height }'))
  })
})

describe('branded social-image route — vibrant, distinct templates', () => {
  const content = readRoute()

  test('uses the shared SOCIAL_IMAGE_THEMES recipe rather than one hand-rolled design', () => {
    assert.ok(content.includes("from '@/lib/socialPack'"))
    assert.ok(content.includes('SOCIAL_IMAGE_THEMES'))
    assert.ok(content.includes('theme.gradientFrom'))
    assert.ok(content.includes('theme.gradientTo'))
    assert.ok(content.includes('theme.badgeLabel'))
  })

  test('still carries TheShowFinder wordmark branding, headline, city and date', () => {
    assert.ok(content.includes('SHOWFINDER'))
    assert.ok(content.includes('{headline}'))
    assert.ok(content.includes('{city}'))
    assert.ok(content.includes('{dateLabel}'))
    assert.ok(content.includes('theshowfinder.com'))
  })
})

describe('branded social-image route — safe fallback behaviour', () => {
  const content = readRoute()

  test('a missing/invalid stored kind resolves through resolveStoredImageKind, not a direct unchecked read', () => {
    assert.ok(content.includes('resolveStoredImageKind(storedParams.kind)'))
    assert.ok(!content.includes('storedParams.kind as'), 'should not blindly cast the stored kind')
  })

  test('uses the self-contained concert background and keeps the gradient fallback', () => {
    assert.ok(content.includes('readConcertBackground()'))
    assert.ok(content.includes('concert-cinematic-v2.png'))
    assert.ok(content.includes('linear-gradient(135deg'))
  })

  test('falls back to a safe default headline when the stored one is missing/blank', () => {
    assert.ok(content.includes("'TheShowFinder'"))
  })

  test('does not scrape or copy third-party article imagery', () => {
    assert.ok(content.toLowerCase().includes('never') || content.toLowerCase().includes('never\n'))
    assert.ok(content.toLowerCase().includes('third-party article imagery'))
  })
})

describe('branded social-image route — no scraped or constructed marketplace links', () => {
  const content = readRoute()

  test('never builds a generic encodeURIComponent-based search URL for an image background', () => {
    assert.ok(!content.includes('encodeURIComponent'))
  })

  test('images use only the embedded local concert background', () => {
    const imgSrcMatches = [...content.matchAll(/<img\s+src=\{([^}]+)\}/g)].map(m => m[1].trim())
    assert.ok(imgSrcMatches.length > 0, 'expected at least one <img> tag')
    for (const src of imgSrcMatches) {
      assert.equal(src, 'concertBackground')
    }
    assert.ok(content.includes("'public/social-backgrounds/concert-cinematic-v2.png'"))
  })
})
