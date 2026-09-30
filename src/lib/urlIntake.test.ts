import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { isPrivateOrReservedIp, extractArticleMetadata } from './urlIntake.ts'

describe('isPrivateOrReservedIp (SSRF guard — requirement: reject localhost/private-network/unsafe destinations)', () => {
  const unsafe = [
    '127.0.0.1',       // loopback
    '127.1.2.3',
    '10.0.0.5',        // private
    '10.255.255.255',
    '172.16.0.1',      // private (172.16.0.0/12)
    '172.31.255.255',
    '192.168.1.1',     // private
    '169.254.169.254', // link-local — cloud metadata endpoint, the classic SSRF target
    '0.0.0.0',
    '100.64.0.1',      // carrier-grade NAT
    '198.18.0.1',      // benchmarking range
    '224.0.0.1',       // multicast
    '255.255.255.255',
    '::1',             // IPv6 loopback
    '::',              // IPv6 unspecified
    'fe80::1',         // IPv6 link-local
    'fc00::1',         // IPv6 unique local
    'fd12:3456::1',
    'ff02::1',         // IPv6 multicast
    '::ffff:127.0.0.1', // IPv4-mapped IPv6 loopback
    '::ffff:10.0.0.1',
  ]
  for (const ip of unsafe) {
    test(`rejects ${ip}`, () => {
      assert.equal(isPrivateOrReservedIp(ip), true)
    })
  }

  const safe = [
    '8.8.8.8',
    '1.1.1.1',
    '93.184.216.34', // example.com-ish public IP
    '172.15.255.255', // just outside the 172.16/12 private range
    '172.32.0.1',      // just outside the 172.16/12 private range
    '2606:4700:4700::1111', // public IPv6 (Cloudflare)
  ]
  for (const ip of safe) {
    test(`allows ${ip}`, () => {
      assert.equal(isPrivateOrReservedIp(ip), false)
    })
  }
})

describe('extractArticleMetadata (requirement: extract title/description/headline/source/date/text/url)', () => {
  test('full page: JSON-LD NewsArticle + og tags + <article> body', () => {
    const html = `<!doctype html><html><head>
      <title>Fallback Title</title>
      <meta property="og:title" content="Oasis add second Wembley date" />
      <meta property="og:description" content="The band have added a second night." />
      <meta property="article:published_time" content="2026-09-30T08:00:00.000Z" />
      <script type="application/ld+json">{"@type":"NewsArticle","headline":"Oasis add second Wembley date - official","datePublished":"2026-09-30T08:00:00.000Z"}</script>
      </head><body><nav>Home | News</nav>
      <article><h1>Oasis add second Wembley date</h1><p>The band have confirmed a second show at Wembley Stadium next summer, following overwhelming demand for the first date.</p><p>Tickets for the new show go on general sale next Friday at 10am via all major retailers.</p></article>
      <footer>Copyright 2026</footer>
      </body></html>`
    const result = extractArticleMetadata(html, 'https://www.nme.com/news/oasis-wembley')
    assert.equal(result.headline, 'Oasis add second Wembley date - official') // JSON-LD wins over og:title/h1
    assert.equal(result.description, 'The band have added a second night.')
    assert.equal(result.sourceDomain, 'nme.com') // www. stripped
    assert.equal(result.publishedAt, '2026-09-30T08:00:00.000Z')
    assert.equal(result.originalUrl, 'https://www.nme.com/news/oasis-wembley')
    assert.ok(result.articleText && result.articleText.includes('Wembley Stadium'))
    assert.ok(!result.articleText!.includes('Copyright')) // footer excluded
    assert.ok(!result.articleText!.includes('Home | News')) // nav excluded
  })

  test('bare-bones page: only <title>, no JSON-LD/og/article tag', () => {
    const html = `<!doctype html><html><head><title>Some Headline - Example News</title></head>
      <body><p>This is the first real paragraph of the story, long enough to be picked up by the paragraph-based fallback extractor used when there is no article tag.</p>
      <p>Short.</p></body></html>`
    const result = extractArticleMetadata(html, 'https://example.com/story')
    assert.equal(result.title, 'Some Headline - Example News')
    assert.equal(result.headline, 'Some Headline - Example News') // falls back to title when no JSON-LD/h1
    assert.equal(result.description, null)
    assert.equal(result.publishedAt, null)
    assert.equal(result.sourceDomain, 'example.com')
    assert.ok(result.articleText && result.articleText.includes('first real paragraph'))
    assert.ok(!result.articleText!.includes('Short.')) // under the 40-char boilerplate-skip threshold
  })

  test('empty/minimal page: everything gracefully null, never throws', () => {
    const html = `<!doctype html><html><head></head><body></body></html>`
    const result = extractArticleMetadata(html, 'https://example.com/empty')
    assert.equal(result.title, null)
    assert.equal(result.description, null)
    assert.equal(result.headline, null)
    assert.equal(result.publishedAt, null)
    assert.equal(result.articleText, null)
    assert.equal(result.sourceDomain, 'example.com')
    assert.equal(result.originalUrl, 'https://example.com/empty')
  })

  test('malformed JSON-LD block does not throw and is simply ignored', () => {
    const html = `<!doctype html><html><head>
      <script type="application/ld+json">{not valid json at all</script>
      <meta property="og:title" content="Still works via og:title" />
      </head><body></body></html>`
    const result = extractArticleMetadata(html, 'https://example.com/malformed')
    assert.equal(result.headline, 'Still works via og:title')
  })
})
