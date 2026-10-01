import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildUtmUrl,
  buildNewsletterLink,
  buildSocialShareLink,
  buildTicketClickEvent,
  buildNewsClickEvent,
} from './analytics.ts'

// ── buildUtmUrl ────────────────────────────────────────────────────────

test('buildUtmUrl appends source/medium/campaign to a bare URL', () => {
  const result = buildUtmUrl('https://example.com/article', { source: 'newsletter', medium: 'email', campaign: 'newsletter-42' })
  const url = new URL(result)
  assert.equal(url.searchParams.get('utm_source'), 'newsletter')
  assert.equal(url.searchParams.get('utm_medium'), 'email')
  assert.equal(url.searchParams.get('utm_campaign'), 'newsletter-42')
})

test('buildUtmUrl includes utm_content only when provided', () => {
  const withContent = buildUtmUrl('https://example.com', { source: 'a', medium: 'b', campaign: 'c', content: 'headline-link' })
  assert.equal(new URL(withContent).searchParams.get('utm_content'), 'headline-link')

  const withoutContent = buildUtmUrl('https://example.com', { source: 'a', medium: 'b', campaign: 'c' })
  assert.equal(new URL(withoutContent).searchParams.has('utm_content'), false)
})

test('buildUtmUrl preserves an existing query string', () => {
  const result = buildUtmUrl('https://example.com/search?q=tickets', { source: 'a', medium: 'b', campaign: 'c' })
  const url = new URL(result)
  assert.equal(url.searchParams.get('q'), 'tickets')
  assert.equal(url.searchParams.get('utm_source'), 'a')
})

test('buildUtmUrl never overwrites a utm_ param the URL already carries', () => {
  const result = buildUtmUrl('https://example.com?utm_source=preexisting', { source: 'newsletter', medium: 'email', campaign: 'x' })
  const url = new URL(result)
  assert.equal(url.searchParams.get('utm_source'), 'preexisting')
  // Other params not already present still get added.
  assert.equal(url.searchParams.get('utm_medium'), 'email')
})

test('buildUtmUrl returns the input unchanged for an invalid/relative URL', () => {
  assert.equal(buildUtmUrl('/events/some-show', { source: 'a', medium: 'b', campaign: 'c' }), '/events/some-show')
  assert.equal(buildUtmUrl('', { source: 'a', medium: 'b', campaign: 'c' }), '')
  assert.equal(buildUtmUrl('not a url at all', { source: 'a', medium: 'b', campaign: 'c' }), 'not a url at all')
})

// ── buildNewsletterLink ────────────────────────────────────────────────

test('buildNewsletterLink tags a link with the newsletter id as campaign', () => {
  const result = buildNewsletterLink('https://theshowfinder.com/events/show', 'abc-123')
  const url = new URL(result)
  assert.equal(url.searchParams.get('utm_source'), 'newsletter')
  assert.equal(url.searchParams.get('utm_medium'), 'email')
  assert.equal(url.searchParams.get('utm_campaign'), 'newsletter-abc-123')
})

// ── buildSocialShareLink ───────────────────────────────────────────────

test('buildSocialShareLink tags a Facebook link with medium=social', () => {
  const result = buildSocialShareLink('https://theshowfinder.com/news/story', 'facebook', 'cand-1')
  const url = new URL(result)
  assert.equal(url.searchParams.get('utm_source'), 'facebook')
  assert.equal(url.searchParams.get('utm_medium'), 'social')
  assert.equal(url.searchParams.get('utm_campaign'), 'share-cand-1')
})

test('buildSocialShareLink tags Instagram and TikTok the same way as Facebook', () => {
  for (const platform of ['instagram', 'tiktok']) {
    const url = new URL(buildSocialShareLink('https://theshowfinder.com/news/story', platform, 'cand-1'))
    assert.equal(url.searchParams.get('utm_source'), platform)
    assert.equal(url.searchParams.get('utm_medium'), 'social')
  }
})

test('buildSocialShareLink treats the email platform as medium=email, not social', () => {
  const result = buildSocialShareLink('https://theshowfinder.com/news/story', 'email', 'cand-1')
  const url = new URL(result)
  assert.equal(url.searchParams.get('utm_source'), 'email')
  assert.equal(url.searchParams.get('utm_medium'), 'email')
  assert.equal(url.searchParams.get('utm_campaign'), 'share-cand-1')
})

// ── buildTicketClickEvent ──────────────────────────────────────────────

test('buildTicketClickEvent builds a GA4 payload with category/provider/section/context', () => {
  const event = buildTicketClickEvent({ provider: 'Ticketmaster', section: 'primary', context: 'some-event-slug' })
  assert.deepEqual(event, {
    event_category: 'ticket_click',
    provider: 'Ticketmaster',
    section: 'primary',
    context: 'some-event-slug',
  })
})

test('buildTicketClickEvent supports every documented section', () => {
  const sections = ['hero_cta', 'buy_direct', 'primary', 'more_options', 'also_available', 'secondary_market'] as const
  for (const section of sections) {
    const event = buildTicketClickEvent({ provider: 'Viagogo', section, context: 'x' })
    assert.equal(event.section, section)
  }
})

// ── buildNewsClickEvent ────────────────────────────────────────────────

test('buildNewsClickEvent builds a GA4 payload with category/destination/context', () => {
  const event = buildNewsClickEvent({ destination: 'https://source.example/story', context: 'homepage' })
  assert.deepEqual(event, {
    event_category: 'news_click',
    destination: 'https://source.example/story',
    context: 'homepage',
  })
})
