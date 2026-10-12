import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { escapeHtml, renderEmbedHtml, parseEmbedTarget, parseEmbedTheme } from './embedWidget.ts'

describe('embedWidget', () => {
  test('escapes HTML in titles and venues', () => {
    const html = renderEmbedHtml({
      heading: 'Gigs <b>',
      rows: [{ title: '<script>alert(1)</script>', startDate: '2026-11-01T19:30:00Z', where: 'O2 & Co', url: 'https://www.theshowfinder.com/events/x?a=1&b="2"' }],
      moreUrl: 'https://www.theshowfinder.com/artists/x', moreLabel: 'All dates',
    })
    assert.ok(!html.includes('<script>'))
    assert.ok(html.includes('&lt;script&gt;'))
    assert.ok(html.includes('O2 &amp; Co'))
    assert.ok(html.includes('&quot;2&quot;'))
  })
  test('empty state and credit link', () => {
    const html = renderEmbedHtml({ heading: 'X', rows: [], moreUrl: 'https://www.theshowfinder.com/', moreLabel: 'More' })
    assert.ok(html.includes('No upcoming shows'))
    assert.ok(html.includes('Powered by'))
    assert.ok(html.includes('noindex'))
  })
  test('dates use London time', () => {
    const html = renderEmbedHtml({ heading: 'X', rows: [{ title: 'T', startDate: '2026-10-17T23:30:00Z', where: null, url: 'https://x.test' }], moreUrl: 'https://x.test', moreLabel: 'm' })
    assert.match(html, /Sun,? 18 Oct 2026/)
  })
  test('escapeHtml', () => {
    assert.equal(escapeHtml(`<a href="x">'&`), '&lt;a href=&quot;x&quot;&gt;&#39;&amp;')
  })
  test('parseEmbedTarget accepts pasted URLs and paths', () => {
    assert.deepEqual(parseEmbedTarget('https://www.theshowfinder.com/artists/mr-polska-abc/'), { type: 'artist', slug: 'mr-polska-abc' })
    assert.deepEqual(parseEmbedTarget('/venues/the-o2-london'), { type: 'venue', slug: 'the-o2-london' })
    assert.deepEqual(parseEmbedTarget('https://www.theshowfinder.com/cities/Manchester'), { type: 'city', slug: 'Manchester' })
    assert.equal(parseEmbedTarget('https://www.theshowfinder.com/events/foo'), null)
  })
  test('parseEmbedTheme defaults to light', () => {
    assert.equal(parseEmbedTheme('dark'), 'dark')
    assert.equal(parseEmbedTheme('purple'), 'light')
    assert.equal(parseEmbedTheme(null), 'light')
  })
})
