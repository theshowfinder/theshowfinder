import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { buildRssFeed, escapeXml } from './rss.ts'

const NOW = new Date('2026-10-17T12:00:00Z')
const base = {
  title: 'Manchester & more', link: 'https://www.theshowfinder.com/cities/Manchester',
  description: 'Shows <this> week', selfUrl: 'https://www.theshowfinder.com/feeds/cities/Manchester.xml',
}

describe('rss', () => {
  test('escapes XML special characters and strips control characters', () => {
    assert.equal(escapeXml(`A&B <c> "d" 'e'\u0001`), 'A&amp;B &lt;c&gt; &quot;d&quot; &apos;e&apos;')
  })

  test('builds a valid-looking RSS 2.0 document with escaped items', () => {
    const xml = buildRssFeed({
      ...base,
      items: [{ title: 'Band & Co at O2', link: 'https://x.test/e/1?a=1&b=2', guid: 'event:1', description: 'Thu 22 Oct', pubDate: NOW }],
    }, NOW)
    assert.match(xml, /^<\?xml version="1.0" encoding="UTF-8"\?>/)
    assert.match(xml, /<title>Manchester &amp; more<\/title>/)
    assert.match(xml, /<description>Shows &lt;this&gt; week<\/description>/)
    assert.match(xml, /<item>[\s\S]*<title>Band &amp; Co at O2<\/title>/)
    assert.match(xml, /<link>https:\/\/x\.test\/e\/1\?a=1&amp;b=2<\/link>/)
    assert.match(xml, /<guid isPermaLink="false">event:1<\/guid>/)
    assert.match(xml, /<pubDate>Sat, 17 Oct 2026 12:00:00 GMT<\/pubDate>/)
    assert.match(xml, /<atom:link href="https:\/\/www\.theshowfinder\.com\/feeds\/cities\/Manchester\.xml" rel="self"/)
    assert.equal((xml.match(/<item>/g) ?? []).length, 1)
  })

  test('an empty feed is still a well-formed channel', () => {
    const xml = buildRssFeed({ ...base, items: [] }, NOW)
    assert.match(xml, /<channel>[\s\S]*<\/channel>/)
    assert.doesNotMatch(xml, /<item>/)
  })
})
