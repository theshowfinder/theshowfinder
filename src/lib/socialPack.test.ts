import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildSocialPackHashtags,
  buildSocialPackLinks,
  buildFacebookCaption,
  buildInstagramCaption,
  buildTikTokCaption,
  buildSocialImageParams,
  buildSocialPackDraft,
  canAdvanceSocialPackStatus,
  isEligibleForAutoSocialPack,
  resolveNewsCandidateContext,
  buildEventContext,
} from './socialPack.ts'

describe('buildSocialPackHashtags', () => {
  test('always includes #TheShowFinder', () => {
    assert.ok(buildSocialPackHashtags([]).includes('#TheShowFinder'))
  })

  test('turns city-specific-link seeds into hashtags: a city-specific link', () => {
    const tags = buildSocialPackHashtags(['Manchester', 'Coldplay'])
    assert.deepEqual(tags, ['#TheShowFinder', '#Manchester', '#Coldplay'])
  })

  test('de-duplicates repeated seeds', () => {
    const tags = buildSocialPackHashtags(['Manchester', 'Manchester'])
    assert.deepEqual(tags, ['#TheShowFinder', '#Manchester'])
  })

  test('skips a seed with no alphanumeric content rather than emitting a bare #', () => {
    const tags = buildSocialPackHashtags(['', '!!!'])
    assert.deepEqual(tags, ['#TheShowFinder'])
  })
})

describe('buildSocialPackLinks — city-specific links with UTM parameters', () => {
  test('builds the destination URL from a relative path', () => {
    const links = buildSocialPackLinks('/cities/Manchester', 'news_candidate', 'abc-123')
    assert.equal(links.destinationUrl, 'https://www.theshowfinder.com/cities/Manchester')
  })

  test('leaves an already-absolute destination path untouched', () => {
    const links = buildSocialPackLinks('https://www.theshowfinder.com/events/x', 'event', 'id-1')
    assert.equal(links.destinationUrl, 'https://www.theshowfinder.com/events/x')
  })

  test('utm_campaign is scoped to the source so every platform groups together in GA4', () => {
    const links = buildSocialPackLinks('/cities/Manchester', 'news_candidate', 'abc-123')
    assert.equal(links.utmCampaign, 'social-news_candidate-abc-123')
  })

  test('each platform link carries its own utm_source but the shared campaign', () => {
    const links = buildSocialPackLinks('/cities/Manchester', 'news_candidate', 'abc-123')
    assert.ok(links.facebookLink.includes('utm_source=facebook'))
    assert.ok(links.instagramLink.includes('utm_source=instagram'))
    assert.ok(links.tiktokLink.includes('utm_source=tiktok'))
    assert.ok(links.facebookLink.includes('utm_campaign=social-news_candidate-abc-123'))
    assert.ok(links.instagramLink.includes('utm_campaign=social-news_candidate-abc-123'))
    assert.ok(links.tiktokLink.includes('utm_campaign=social-news_candidate-abc-123'))
  })
})

describe('platform caption rules', () => {
  const headline = 'Coldplay announce Manchester date'
  const context = 'New Music of the Spheres date added — Co-op Live, 14 June'

  test('Facebook caption includes the actual tracked link', () => {
    const caption = buildFacebookCaption(headline, context, 'https://www.theshowfinder.com/x?utm_source=facebook')
    assert.ok(caption.includes('https://www.theshowfinder.com/x?utm_source=facebook'))
  })

  test('Instagram caption never contains a raw URL — "link in bio" instead', () => {
    const caption = buildInstagramCaption(headline, context)
    assert.ok(!caption.includes('http'))
    assert.ok(caption.toLowerCase().includes('link in bio'))
  })

  test('TikTok caption never contains a raw URL either', () => {
    const caption = buildTikTokCaption(headline, context)
    assert.ok(!caption.includes('http'))
  })

  test('TikTok caption is capped to a short-form length', () => {
    const longHeadline = 'A'.repeat(200)
    const caption = buildTikTokCaption(longHeadline, context)
    assert.ok(caption.length <= 150)
  })
})

describe('buildSocialImageParams', () => {
  test('carries headline, city and date through for the branded graphic', () => {
    const params = buildSocialImageParams('Tonight in Manchester', 'Manchester', '14 June')
    assert.deepEqual(params, { headline: 'Tonight in Manchester', city: 'Manchester', dateLabel: '14 June' })
  })

  test('a national story with no single city — city is null, not a guess', () => {
    const params = buildSocialImageParams('Big UK tour announced', null, null)
    assert.equal(params.city, null)
  })
})

describe('buildSocialPackDraft — prevention of automatic posting', () => {
  const draft = buildSocialPackDraft({
    sourceType: 'news_candidate',
    sourceId: 'cand-1',
    cityName: 'Manchester',
    headline: 'Coldplay announce Manchester date',
    context: 'New date added — Co-op Live',
    destinationPath: '/cities/Manchester',
    hashtagSeed: ['Manchester', 'Coldplay'],
  })

  test('a freshly built draft always starts at status "draft" — never ready_for_review, approved, or posted', () => {
    assert.equal(draft.status, 'draft')
  })

  test('all three platform captions are present', () => {
    assert.ok(draft.facebook_text.length > 0)
    assert.ok(draft.instagram_text.length > 0)
    assert.ok(draft.tiktok_text.length > 0)
  })

  test('hashtags include the city and context seeds', () => {
    assert.ok(draft.hashtags.includes('#Manchester'))
    assert.ok(draft.hashtags.includes('#Coldplay'))
  })

  test('city_name on the record matches the input, for display/filtering', () => {
    assert.equal(draft.city_name, 'Manchester')
  })
})

describe('canAdvanceSocialPackStatus (Social Pack approval status)', () => {
  test('draft -> ready_for_review is allowed (one step forward)', () => {
    assert.equal(canAdvanceSocialPackStatus('draft', 'ready_for_review'), true)
  })

  test('ready_for_review -> approved is allowed', () => {
    assert.equal(canAdvanceSocialPackStatus('ready_for_review', 'approved'), true)
  })

  test('approved -> posted is allowed', () => {
    assert.equal(canAdvanceSocialPackStatus('approved', 'posted'), true)
  })

  test('draft -> approved is rejected — cannot skip a review stage', () => {
    assert.equal(canAdvanceSocialPackStatus('draft', 'approved'), false)
  })

  test('draft -> posted is rejected — cannot skip straight to posted', () => {
    assert.equal(canAdvanceSocialPackStatus('draft', 'posted'), false)
  })

  test('moving backward (e.g. approved -> draft, a correction) is always allowed', () => {
    assert.equal(canAdvanceSocialPackStatus('approved', 'draft'), true)
    assert.equal(canAdvanceSocialPackStatus('posted', 'ready_for_review'), true)
  })

  test('staying at the same status is rejected (not a real transition)', () => {
    assert.equal(canAdvanceSocialPackStatus('draft', 'draft'), false)
  })
})

describe('isEligibleForAutoSocialPack', () => {
  test('a candidate targeting Manchester is eligible', () => {
    assert.equal(isEligibleForAutoSocialPack(['Manchester']), true)
  })

  test('a candidate targeting no city at all (national-only) is not eligible', () => {
    assert.equal(isEligibleForAutoSocialPack([]), false)
  })

  test('a candidate targeting multiple cities including Manchester is still eligible', () => {
    assert.equal(isEligibleForAutoSocialPack(['Manchester', 'Leeds']), true)
  })
})

describe('resolveNewsCandidateContext', () => {
  test('prefers the candidate\'s own summary when present', () => {
    assert.equal(
      resolveNewsCandidateContext({ summary: 'New date just added at Co-op Live', headline: 'Coldplay announce Manchester date' }),
      'New date just added at Co-op Live',
    )
  })

  test('falls back to the headline when there is no summary', () => {
    assert.equal(
      resolveNewsCandidateContext({ summary: null, headline: 'Coldplay announce Manchester date' }),
      'Coldplay announce Manchester date',
    )
  })

  test('falls back to the headline when summary is blank/whitespace-only', () => {
    assert.equal(
      resolveNewsCandidateContext({ summary: '   ', headline: 'Coldplay announce Manchester date' }),
      'Coldplay announce Manchester date',
    )
  })
})

describe('buildEventContext', () => {
  test('combines title, venue and date into one readable line', () => {
    assert.equal(
      buildEventContext({ title: 'Coldplay', venueName: 'Co-op Live', startDateLabel: '14 June 2026' }),
      'Coldplay — Co-op Live, 14 June 2026',
    )
  })
})
