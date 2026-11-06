// Regression guard for the branded social-image route (src/app/admin/social/[id]/image/route.tsx). There is no
// Satori rendering in this test runner, so this reads the route's source and asserts what can't otherwise be exercised:
// both formats and their sizes, the per-kind themes, the brand frame (logo, web address, Facebook wording), and that
// the only photo it can use is an approved one (resolveApprovedImageUrl), never a scraped or constructed URL.
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { splitSocialHeadline } from './socialPack.ts'

const ROUTE_PATH = 'src/app/admin/social/[id]/image/route.tsx'
const readRoute = () => readFileSync(join(process.cwd(), ROUTE_PATH), 'utf-8')

describe('branded social-image route — formats', () => {
  const content = readRoute()
  test('defaults to square when ?format is missing or unrecognised', () => {
    assert.ok(content.includes("searchParams.get('format') === 'vertical' ? 'vertical' : 'square'"))
  })
  test('square 1080x1080, vertical 1080x1920, both passed to ImageResponse', () => {
    assert.ok(content.includes('const width = 1080'))
    assert.ok(/height = format === 'vertical' \? 1920 : 1080/.test(content))
    assert.ok(content.includes('{ width, height, fonts }'))
  })
})

describe('branded social-image route — brand frame and themes', () => {
  const content = readRoute()
  test('uses the shared per-kind themes (sticker colours and label)', () => {
    assert.ok(content.includes("from '@/lib/socialPack'"))
    assert.ok(content.includes('theme.badgeBg'))
    assert.ok(content.includes('theme.badgeFg'))
    assert.ok(content.includes('theme.badgeLabel'))
    assert.ok(content.includes('theme.gradientFrom'))
  })
  test('logo, web address, city/date chips and the Facebook wording', () => {
    assert.ok(content.includes('SHOWFINDER'))
    assert.ok(content.includes('THESHOWFINDER.COM'))
    assert.ok(content.includes('[city, dateLabel]'))
    assert.ok(content.includes("'SEARCH THESHOWFINDER'"))
    assert.ok(content.includes("'LINK IN BIO ›'"))
  })
  test('falls back to a safe default headline', () => {
    assert.ok(content.includes("'TheShowFinder'"))
  })
})

describe('branded social-image route — approved photos only', () => {
  const content = readRoute()
  test('the stored kind and image are defended, not trusted', () => {
    assert.ok(content.includes('resolveStoredImageKind(storedParams.kind)'))
    assert.ok(content.includes('resolveApprovedImageUrl(storedParams.imageUrl)'))
    assert.ok(!content.includes('storedParams.kind as'))
    assert.ok(!content.includes('storedParams.imageUrl as'))
  })
  test('falls back to the local concert background', () => {
    assert.ok(content.includes("'public/social-backgrounds/concert-cinematic-v2.png'"))
    assert.ok(content.includes('photo ?? concertBackground'))
  })
  test('never builds a search URL or uses any other image source', () => {
    assert.ok(!content.includes('encodeURIComponent'))
    const srcs = [...content.matchAll(/<img\s+src=\{([^}]+)\}/g)].map(m => m[1].trim())
    assert.deepEqual(srcs, ['background'])
    assert.ok(content.toLowerCase().includes('never scrapes or copies third-party article imagery'))
  })
})

describe('splitSocialHeadline', () => {
  test('act name and the news', () => {
    assert.deepEqual(splitSocialHeadline('CHVRCHES adds 2 new UK dates: tickets on sale now'), { title: 'CHVRCHES', detail: '2 new UK dates · Tickets on sale now' })
    assert.deepEqual(splitSocialHeadline('S Club announces UK arena tour: presale opens Wed 4 Nov'), { title: 'S Club', detail: 'UK arena tour · Presale opens Wed 4 Nov' })
  })
  test('no recognisable verb: the whole headline', () => {
    assert.deepEqual(splitSocialHeadline('Isle of Wight Festival on sale + 5 more on sale this week'), { title: 'Isle of Wight Festival on sale + 5 more on sale this week', detail: null })
  })
})
