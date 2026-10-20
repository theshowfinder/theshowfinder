// Unit tests for src/lib/newsFiltering.ts — the pure RSS filtering/ranking
// logic extracted from src/lib/cityNews.ts (Phase 4: "Fresh News &
// Editorial Operations"). These exercise the real, shipped functions
// (imported below) against known-good and known-bad headlines drawn
// directly from the production contamination bugs documented in this
// file's comments (University of Kentucky's "UKNow", Wyoming tourism,
// Colorado/Oklahoma "derby" events, etc.) — so a future change that
// reintroduces one of those leaks fails a test instead of shipping silently.
//
// Run with: node --test src/lib/newsFiltering.test.ts (or `npm test`).
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  MAX_NEWS_AGE_MS,
  isFalsePositive,
  isFreshEnough,
  filterAndRankNewsItems,
  mergeNationalFeedResults,
  type NewsItem,
} from './newsFiltering.ts'

const NOW = new Date('2026-10-01T12:00:00.000Z').getTime()

function item(overrides: Partial<NewsItem> = {}): NewsItem {
  return {
    headline: 'Oasis announce Derby arena tour date',
    url: 'https://example.com/story',
    source: 'Example News',
    publishedAt: '2026-09-30T09:00:00.000Z', // 1 day before NOW — fresh
    ...overrides,
  }
}

describe('isFreshEnough', () => {
  test('null publishedAt is never fresh — no benefit of the doubt', () => {
    assert.equal(isFreshEnough(null, NOW), false)
  })

  test('unparseable publishedAt is never fresh', () => {
    assert.equal(isFreshEnough('not a date', NOW), false)
  })

  test('within MAX_NEWS_AGE_MS is fresh', () => {
    assert.equal(isFreshEnough(new Date(NOW - 1000).toISOString(), NOW), true)
  })

  test('exactly at the boundary is fresh (<=, not <)', () => {
    assert.equal(isFreshEnough(new Date(NOW - MAX_NEWS_AGE_MS).toISOString(), NOW), true)
  })

  test('older than MAX_NEWS_AGE_MS (4 days) is stale', () => {
    assert.equal(isFreshEnough(new Date(NOW - MAX_NEWS_AGE_MS - 1).toISOString(), NOW), false)
  })

  test('a custom maxAgeMs overrides the default', () => {
    const oneDay = 24 * 60 * 60 * 1000
    assert.equal(isFreshEnough(new Date(NOW - 2 * oneDay).toISOString(), NOW, oneDay), false)
  })
})

describe('isFalsePositive — real contamination bugs this must keep catching', () => {
  test('a genuine Derby, UK entertainment headline is NOT a false positive', () => {
    assert.equal(isFalsePositive(item({ headline: 'Derby arena announces autumn concert series' })), false)
  })

  test('"AC MILAN vs. INTER: AN UNMISSABLE DERBY" — football fixture leak', () => {
    assert.equal(isFalsePositive(item({ headline: 'AC MILAN vs. INTER: AN UNMISSABLE DERBY' })), true)
  })

  test('soap box / demolition / pinewood derby — US event-type leak, not the city', () => {
    assert.equal(isFalsePositive(item({ headline: 'Local kids win annual soap box derby race' })), true)
    assert.equal(isFalsePositive(item({ headline: 'Demolition derby returns to the county fair' })), true)
  })

  test('horse racing leak (Kentucky Derby, Epsom Derby, etc.)', () => {
    assert.equal(isFalsePositive(item({ headline: 'Kentucky Derby favourite withdrawn after injury' })), true)
  })

  test('University of Kentucky "UKNow" leak into the national "UK" feed', () => {
    assert.equal(isFalsePositive(item({
      headline: 'UKNow: Wildcats celebrate commencement at Rupp Arena',
      source: 'UKNow',
      url: 'https://uknow.uky.edu/campus-news/commencement',
    })), true)
  })

  test('.edu host is always a false positive, regardless of headline wording', () => {
    assert.equal(isFalsePositive(item({ url: 'https://news.someuniversity.edu/story' })), true)
  })

  test('.gov host is always a false positive (but .gov.uk is not blocked by this check alone)', () => {
    assert.equal(isFalsePositive(item({ url: 'https://somecity.gov/press-release' })), true)
    assert.equal(isFalsePositive(item({ url: 'https://www.gov.uk/government/news/some-announcement', headline: 'Derby arena concert tickets on sale' })), false)
  })

  test('US/Canadian "City, ST" dateline leak (e.g. Derby, KS)', () => {
    assert.equal(isFalsePositive(item({ headline: 'Derby, KS concert venue reopens after renovation' })), true)
  })

  test('full US state name leak (Colorado/Oklahoma derby events)', () => {
    assert.equal(isFalsePositive(item({ headline: 'Derby Oklahoma hosts its annual festival weekend' })), true)
  })

  test('Wyoming tour-company tourism-piece leak', () => {
    assert.equal(isFalsePositive(item({ headline: 'British tour company praises Cheyenne stop', source: 'Cowboy State Daily' })), true)
  })

  test('a headline with no entertainment-relevance term at all is dropped (positive backstop)', () => {
    assert.equal(isFalsePositive(item({ headline: 'British Jews back calls to ban Australian academic Randa Abdel-Fattah' })), true)
  })
})

describe('filterAndRankNewsItems (single-feed city path)', () => {
  test('drops items with no headline or no url', () => {
    const items = [item({ headline: '' }), item({ url: '' }), item()]
    const result = filterAndRankNewsItems(items, NOW)
    assert.equal(result.length, 1)
  })

  test('drops false positives and stale items, keeps the rest', () => {
    const items = [
      item({ headline: 'Derby arena announces new tour', url: 'https://a.com/1' }),
      item({ headline: 'Kentucky Derby favourite scratched', url: 'https://a.com/2' }), // false positive
      item({ headline: 'Derby arena old story', url: 'https://a.com/3', publishedAt: new Date(NOW - MAX_NEWS_AGE_MS - 1).toISOString() }), // stale
    ]
    const result = filterAndRankNewsItems(items, NOW)
    assert.deepEqual(result.map(i => i.url), ['https://a.com/1'])
  })

  test('sorts newest first and caps at the given limit (default 8)', () => {
    const items = Array.from({ length: 10 }, (_, i) => item({
      url: `https://a.com/${i}`,
      publishedAt: new Date(NOW - i * 60_000).toISOString(), // i=0 is newest
    }))
    const result = filterAndRankNewsItems(items, NOW)
    assert.equal(result.length, 8)
    assert.equal(result[0].url, 'https://a.com/0')
    assert.equal(result[7].url, 'https://a.com/7')
  })

  test('respects a custom limit', () => {
    const items = Array.from({ length: 5 }, (_, i) => item({ url: `https://a.com/${i}` }))
    assert.equal(filterAndRankNewsItems(items, NOW, 3).length, 3)
  })

  test('does not mutate the input array', () => {
    const items = [item({ url: 'https://a.com/1' }), item({ url: 'https://a.com/2' })]
    const copy = [...items]
    filterAndRankNewsItems(items, NOW)
    assert.deepEqual(items, copy)
  })

  test('dedupes an in-feed duplicate url, keeping the first occurrence (requirement 2: duplicate prevention)', () => {
    const items = [
      item({ headline: 'Derby arena announces new tour', url: 'https://a.com/1', publishedAt: new Date(NOW - 1000).toISOString() }),
      item({ headline: 'Derby arena announces new tour (syndicated)', url: 'https://a.com/1', publishedAt: new Date(NOW - 2000).toISOString() }),
      item({ headline: 'Derby arena second story', url: 'https://a.com/2' }),
    ]
    const result = filterAndRankNewsItems(items, NOW)
    assert.equal(result.filter(i => i.url === 'https://a.com/1').length, 1)
    assert.equal(result.find(i => i.url === 'https://a.com/1')?.headline, 'Derby arena announces new tour')
  })
})

describe('mergeNationalFeedResults (multi-outlet national feed path)', () => {
  test('flattens results from every outlet', () => {
    const perFeed: NewsItem[][] = [
      [item({ url: 'https://bbc.co.uk/1' })],
      [item({ url: 'https://nme.com/1' })],
    ]
    const result = mergeNationalFeedResults(perFeed, NOW)
    assert.equal(result.length, 2)
  })

  test('a failed outlet contributing an empty array never breaks the merge', () => {
    const perFeed: NewsItem[][] = [
      [item({ url: 'https://bbc.co.uk/1' })],
      [], // this outlet's fetch failed — fetchNamedFeed already degrades to []
      [item({ url: 'https://nme.com/1' })],
    ]
    const result = mergeNationalFeedResults(perFeed, NOW)
    assert.equal(result.length, 2)
  })

  test('dedupes the rare story two outlets both ran (same url)', () => {
    const shared = item({ url: 'https://shared-story.com/1', headline: 'Oasis announce reunion tour dates' })
    const perFeed: NewsItem[][] = [[shared], [{ ...shared }]]
    const result = mergeNationalFeedResults(perFeed, NOW)
    assert.equal(result.length, 1)
  })

  test('applies the same false-positive and freshness filters as the city path', () => {
    const perFeed: NewsItem[][] = [[
      item({ url: 'https://a.com/1', headline: 'Kentucky Derby favourite scratched' }), // false positive
      item({ url: 'https://a.com/2', publishedAt: new Date(NOW - MAX_NEWS_AGE_MS - 1).toISOString() }), // stale
      item({ url: 'https://a.com/3' }), // kept
    ]]
    const result = mergeNationalFeedResults(perFeed, NOW)
    assert.deepEqual(result.map(i => i.url), ['https://a.com/3'])
  })

  test('sorts newest first and caps at the given limit (default 8)', () => {
    const perFeed: NewsItem[][] = [Array.from({ length: 10 }, (_, i) => item({
      url: `https://a.com/${i}`,
      publishedAt: new Date(NOW - i * 60_000).toISOString(),
    }))]
    const result = mergeNationalFeedResults(perFeed, NOW)
    assert.equal(result.length, 8)
    assert.equal(result[0].url, 'https://a.com/0')
  })
})

describe('isNonUkNews: US, gaming and anime stories never reach a UK city page', async () => {
  const { isNonUkNews, dropNonUkNews, isFalsePositive } = await import('./newsFiltering.ts')
  const derbyJunk = [
    ["The latest game event to fall afoul of US visa rules is a live concert for horse girl", 'Rock Paper Shotgun'],
    ["Cygames cancels Umamusume Pretty Derby concerts in Los Angeles over U.S. entry visa issues", 'GosuGamers'],
    ["Umamusume: Pretty Derby's first US concert in doubt thanks to Trump immigration policy", 'Shacknews'],
    ["U2 return to NFL stage for Thanksgiving Eve halftime show on Netflix", 'The Independent'],
    ["Jay-Z to headline 2027 Super Bowl halftime show: report", 'The Independent'],
  ] as const

  test('the real Derby and national junk is all dropped', () => {
    for (const [headline, source] of derbyJunk) {
      assert.equal(isNonUkNews({ headline, source }), true, headline)
      assert.equal(isFalsePositive({ headline, source, url: 'https://example.com/x' }), true, headline)
    }
  })

  test('genuine UK stories survive, including ones that mention America alongside the UK', () => {
    for (const headline of [
      "Derby Concert Band opens ticket sales for upcoming festive and spring performances",
      "Sam Fender teases huge 2027 UK and Ireland stadium tour including Wembley",
      "FLO Announces 2027 'Therapy at the Club' North America, UK & EU Tour",
      "Toto announce UK tour to celebrate band's 50th anniversary",
    ]) assert.equal(isNonUkNews({ headline, source: 'The Independent' }), false, headline)
  })

  test('dropNonUkNews keeps editorial rows whatever they say', () => {
    const rows = [
      { headline: 'Cygames cancels Pretty Derby concerts', source: 'GosuGamers', is_editorial: false },
      { headline: 'Our own piece mentioning the NFL', source: 'TheShowFinder', is_editorial: true },
    ]
    assert.equal(dropNonUkNews(rows).length, 1)
  })
})
