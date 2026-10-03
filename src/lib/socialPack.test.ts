import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildSocialPackHashtags,
  buildSocialPackLinks,
  buildFacebookCaption,
  buildInstagramCaption,
  buildTikTokCaption,
  buildSocialImageParams,
  resolveStoredVenueVerified,
  buildSocialPackDraft,
  buildCityPostDraft,
  canAdvanceSocialPackStatus,
  canSkipSocialPack,
  canUnskipSocialPack,
  isEligibleForAutoSocialPack,
  resolveNewsCandidateContext,
  buildEventContext,
  SOCIAL_IMAGE_THEMES,
  isSocialImageKind,
  resolveStoredImageKind,
  resolveSocialImageKindFromStoryType,
  resolveSocialImageKindFromEventStatus,
  isApprovedImageSource,
  resolveApprovedImageUrl,
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

  test('an optional campaignSuffix distinguishes per-city campaigns for the same source', () => {
    const manchester = buildSocialPackLinks('/cities/Manchester', 'news_candidate', 'abc-123', 'Manchester')
    const leeds = buildSocialPackLinks('/cities/Leeds', 'news_candidate', 'abc-123', 'Leeds')
    assert.equal(manchester.utmCampaign, 'social-news_candidate-abc-123-manchester')
    assert.equal(leeds.utmCampaign, 'social-news_candidate-abc-123-leeds')
    assert.notEqual(manchester.utmCampaign, leeds.utmCampaign)
  })

  test('campaignSuffix is slugified (lowercase, non-alphanumeric collapsed) for a multi-word or punctuated city name', () => {
    const links = buildSocialPackLinks('/cities/Stoke-on-Trent', 'news_candidate', 'abc-123', 'Stoke-on-Trent')
    assert.equal(links.utmCampaign, 'social-news_candidate-abc-123-stoke-on-trent')
  })

  test('omitting campaignSuffix keeps the exact original campaign format — backward compatible with existing packs', () => {
    const links = buildSocialPackLinks('/cities/Manchester', 'news_candidate', 'abc-123')
    assert.equal(links.utmCampaign, 'social-news_candidate-abc-123')
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
  test('carries headline, city, date, kind and venueVerified through for the branded graphic', () => {
    const params = buildSocialImageParams('Tonight in Manchester', 'Manchester', '14 June', 'tonight', null, true)
    assert.deepEqual(params, { headline: 'Tonight in Manchester', city: 'Manchester', dateLabel: '14 June', kind: 'tonight', imageUrl: null, venueVerified: true })
  })

  test('a national story with no single city — city is null, not a guess', () => {
    const params = buildSocialImageParams('Big UK tour announced', null, null, 'tour_announcement', null, true)
    assert.equal(params.city, null)
  })

  test('an approved Ticketmaster image URL is carried through', () => {
    const params = buildSocialImageParams('Coldplay', 'Manchester', '14 June', 'onsale', 'https://media.ticketmaster.com/coldplay.jpg', true)
    assert.equal(params.imageUrl, 'https://media.ticketmaster.com/coldplay.jpg')
  })

  test('fallback behaviour: an unapproved image URL is dropped to null, never stored', () => {
    const params = buildSocialImageParams('Coldplay', 'Manchester', '14 June', 'onsale', 'https://some-press-site.example.com/coldplay.jpg', true)
    assert.equal(params.imageUrl, null)
  })

  test('venueVerified is carried through as given: true when confirmed against a real event', () => {
    const params = buildSocialImageParams('Coldplay', 'Manchester', '14 June', 'onsale', null, true)
    assert.equal(params.venueVerified, true)
  })

  test('venueVerified is carried through as given: false when the venue/date could not be confirmed', () => {
    const params = buildSocialImageParams('Coldplay', 'Manchester', null, 'city_event', null, false)
    assert.equal(params.venueVerified, false)
  })
})

describe('buildSocialImageParams — city names and dates pass through unchanged', () => {
  test('a city name with punctuation (e.g. a hyphenated city) is carried through exactly, not reformatted', () => {
    const params = buildSocialImageParams('Robbie Williams', 'Stoke-on-Trent', '12 July 2026', 'onsale', null, true)
    assert.equal(params.city, 'Stoke-on-Trent')
  })

  test('a date label is carried through exactly as given, not re-parsed or reformatted here', () => {
    const params = buildSocialImageParams('Robbie Williams', 'Manchester', 'Friday 12 July 2026', 'onsale', null, true)
    assert.equal(params.dateLabel, 'Friday 12 July 2026')
  })

  test('a null date label (no date available) stays null, not an empty string or a guess', () => {
    const params = buildSocialImageParams('Robbie Williams', 'Manchester', null, 'onsale', null, true)
    assert.equal(params.dateLabel, null)
  })
})

describe('resolveStoredVenueVerified — defensive re-read of a stored image_params.venueVerified', () => {
  test('passes through a stored true', () => {
    assert.equal(resolveStoredVenueVerified(true), true)
  })

  test('passes through a stored false', () => {
    assert.equal(resolveStoredVenueVerified(false), false)
  })

  test('defaults to true when missing (a pack saved before this field existed — "never checked" is not "failed")', () => {
    assert.equal(resolveStoredVenueVerified(undefined), true)
    assert.equal(resolveStoredVenueVerified(null), true)
  })

  test('defaults to true for any non-boolean stored value', () => {
    assert.equal(resolveStoredVenueVerified('false'), true)
    assert.equal(resolveStoredVenueVerified(0), true)
  })
})

describe('SOCIAL_IMAGE_THEMES — vibrant, distinct templates', () => {
  const kinds = ['tour_announcement', 'onsale', 'presale', 'city_event', 'tonight'] as const

  test('all five requested templates exist (tour announcements, onsales, presales, city events, tonight)', () => {
    for (const kind of kinds) {
      assert.ok(SOCIAL_IMAGE_THEMES[kind], `missing theme for ${kind}`)
    }
  })

  test('every template has a non-empty badge label and two distinct gradient colours', () => {
    for (const kind of kinds) {
      const theme = SOCIAL_IMAGE_THEMES[kind]
      assert.ok(theme.badgeLabel.length > 0)
      assert.notEqual(theme.gradientFrom, theme.gradientTo, `${kind} gradient should have two distinct stops, not a flat colour`)
    }
  })

  test('no two templates share the same gradient — each kind is visually distinct, not a relabelled copy', () => {
    const seen = new Set<string>()
    for (const kind of kinds) {
      const key = `${SOCIAL_IMAGE_THEMES[kind].gradientFrom}-${SOCIAL_IMAGE_THEMES[kind].gradientTo}`
      assert.ok(!seen.has(key), `duplicate gradient for ${kind}`)
      seen.add(key)
    }
  })
})

describe('isSocialImageKind / resolveStoredImageKind — backward compatibility', () => {
  test('accepts every real kind', () => {
    for (const kind of ['tour_announcement', 'onsale', 'presale', 'city_event', 'tonight']) {
      assert.equal(isSocialImageKind(kind), true)
    }
  })

  test('rejects an unrecognised string, a non-string, null and undefined', () => {
    assert.equal(isSocialImageKind('made_up_kind'), false)
    assert.equal(isSocialImageKind(42), false)
    assert.equal(isSocialImageKind(null), false)
    assert.equal(isSocialImageKind(undefined), false)
  })

  test('fallback behaviour: a pack prepared before this template system existed (no stored kind) resolves to the generic city template, not an error', () => {
    assert.equal(resolveStoredImageKind(undefined), 'city_event')
    assert.equal(resolveStoredImageKind(null), 'city_event')
    assert.equal(resolveStoredImageKind('nonsense'), 'city_event')
  })

  test('a validly stored kind is returned unchanged', () => {
    assert.equal(resolveStoredImageKind('tonight'), 'tonight')
  })
})

describe('resolveSocialImageKindFromStoryType', () => {
  test('presale -> presale', () => {
    assert.equal(resolveSocialImageKindFromStoryType('presale'), 'presale')
  })

  test('tour_announcement -> tour_announcement', () => {
    assert.equal(resolveSocialImageKindFromStoryType('tour_announcement'), 'tour_announcement')
  })

  test('new_dates -> tour_announcement (an announcement-shaped story)', () => {
    assert.equal(resolveSocialImageKindFromStoryType('new_dates'), 'tour_announcement')
  })

  test('venue_news -> city_event (no sharper template fits)', () => {
    assert.equal(resolveSocialImageKindFromStoryType('venue_news'), 'city_event')
  })

  test('general_entertainment -> city_event', () => {
    assert.equal(resolveSocialImageKindFromStoryType('general_entertainment'), 'city_event')
  })
})

describe('resolveSocialImageKindFromEventStatus', () => {
  test('on_sale -> onsale', () => {
    assert.equal(resolveSocialImageKindFromEventStatus('on_sale'), 'onsale')
  })

  test('upcoming -> tour_announcement (announcing a future show)', () => {
    assert.equal(resolveSocialImageKindFromEventStatus('upcoming'), 'tour_announcement')
  })

  test('sold_out -> city_event, never claims tickets are on sale for a sold-out show', () => {
    assert.equal(resolveSocialImageKindFromEventStatus('sold_out'), 'city_event')
  })

  test('cancelled -> city_event, neutral wording for a cancelled show', () => {
    assert.equal(resolveSocialImageKindFromEventStatus('cancelled'), 'city_event')
  })

  test('postponed -> city_event, neutral wording for a postponed show', () => {
    assert.equal(resolveSocialImageKindFromEventStatus('postponed'), 'city_event')
  })
})

describe('isApprovedImageSource — the only images the branded graphic may use', () => {
  test('approves the known Ticketmaster/Live Nation/Universe hosts', () => {
    assert.equal(isApprovedImageSource('https://s1.ticketm.net/dam/a/123.jpg'), true)
    assert.equal(isApprovedImageSource('https://resizing.ticketmaster.com/foo.jpg'), true)
    assert.equal(isApprovedImageSource('https://media.ticketmaster.com/foo.jpg'), true)
    assert.equal(isApprovedImageSource('https://images.universe.com/foo.jpg'), true)
  })

  test('approves any subdomain of the wildcard-matched hosts', () => {
    assert.equal(isApprovedImageSource('https://app.ticketmaster.com/foo.jpg'), true)
    assert.equal(isApprovedImageSource('https://ticketmaster.com/foo.jpg'), true)
    assert.equal(isApprovedImageSource('https://cdn.livenation.com/foo.jpg'), true)
  })

  test('fallback behaviour: rejects an unrelated or scraped third-party host', () => {
    assert.equal(isApprovedImageSource('https://some-press-site.example.com/photo.jpg'), false)
    assert.equal(isApprovedImageSource('https://notticketmaster.com/foo.jpg'), false)
  })

  test('rejects a non-https URL even on an otherwise-approved host', () => {
    assert.equal(isApprovedImageSource('http://media.ticketmaster.com/foo.jpg'), false)
  })

  test('fallback behaviour: rejects a malformed URL, null, undefined and an empty string rather than throwing', () => {
    assert.equal(isApprovedImageSource('not a url'), false)
    assert.equal(isApprovedImageSource(null), false)
    assert.equal(isApprovedImageSource(undefined), false)
    assert.equal(isApprovedImageSource(''), false)
  })
})

describe('resolveApprovedImageUrl — defensive re-read of a stored image_params.imageUrl', () => {
  test('passes through an approved, valid string', () => {
    assert.equal(resolveApprovedImageUrl('https://media.ticketmaster.com/foo.jpg'), 'https://media.ticketmaster.com/foo.jpg')
  })

  test('fallback behaviour: rejects a non-approved URL, a non-string, and null/undefined — safe fallback, never throws', () => {
    assert.equal(resolveApprovedImageUrl('https://example.com/foo.jpg'), null)
    assert.equal(resolveApprovedImageUrl(42), null)
    assert.equal(resolveApprovedImageUrl(null), null)
    assert.equal(resolveApprovedImageUrl(undefined), null)
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
    kind: 'tour_announcement',
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

  test('the branded-image recipe carries the resolved template kind through', () => {
    assert.equal(draft.image_params.kind, 'tour_announcement')
  })

  test('a news-sourced draft never carries a photo, even if one were somehow passed in — isApprovedImageSource still gates it', () => {
    const withBogusImage = buildSocialPackDraft({
      sourceType: 'news_candidate',
      sourceId: 'cand-2',
      cityName: 'Manchester',
      headline: 'Coldplay announce Manchester date',
      context: 'New date added — Co-op Live',
      destinationPath: '/cities/Manchester',
      hashtagSeed: ['Manchester', 'Coldplay'],
      kind: 'tour_announcement',
      imageUrl: 'https://some-press-site.example.com/photo.jpg',
    })
    assert.equal(withBogusImage.image_params.imageUrl, null)
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

describe('buildCityPostDraft — per-city Social Pack from a published city news story', () => {
  const verified = {
    eventSlug: 'coldplay-manchester-14-june-2026',
    venueName: 'Co-op Live',
    dateLabel: '14 June 2026',
    imageUrl: 'https://media.ticketmaster.com/coldplay.jpg',
  }

  test('a verified match points the destination at the specific event page, not the city page', () => {
    const draft = buildCityPostDraft({
      candidateId: 'cand-1',
      headline: 'Coldplay announce Manchester date',
      fallbackContext: 'Coldplay announce Manchester date',
      cityName: 'Manchester',
      kind: 'tour_announcement',
      verified,
    })
    assert.equal(draft.destination_url, 'https://www.theshowfinder.com/events/coldplay-manchester-14-june-2026')
  })

  test('a verified match builds its context from the real venue and date, not the fallback', () => {
    const draft = buildCityPostDraft({
      candidateId: 'cand-1',
      headline: 'Coldplay announce Manchester date',
      fallbackContext: 'Coldplay announce Manchester date',
      cityName: 'Manchester',
      kind: 'tour_announcement',
      verified,
    })
    assert.equal(draft.context, 'Coldplay announce Manchester date — Co-op Live, 14 June 2026')
  })

  test('a verified match is flagged venueVerified: true and carries the approved image through', () => {
    const draft = buildCityPostDraft({
      candidateId: 'cand-1',
      headline: 'Coldplay announce Manchester date',
      fallbackContext: 'Coldplay announce Manchester date',
      cityName: 'Manchester',
      kind: 'tour_announcement',
      verified,
    })
    assert.equal(draft.image_params.venueVerified, true)
    assert.equal(draft.image_params.imageUrl, 'https://media.ticketmaster.com/coldplay.jpg')
    assert.equal(draft.image_params.dateLabel, '14 June 2026')
  })

  test('no verified match (null) falls back to the city page as destination, never a guessed event', () => {
    const draft = buildCityPostDraft({
      candidateId: 'cand-2',
      headline: 'Coldplay announce UK tour',
      fallbackContext: 'Coldplay announce UK tour',
      cityName: 'Leeds',
      kind: 'tour_announcement',
      verified: null,
    })
    assert.equal(draft.destination_url, 'https://www.theshowfinder.com/cities/Leeds')
  })

  test('no verified match uses the fallback context verbatim, not a half-filled template', () => {
    const draft = buildCityPostDraft({
      candidateId: 'cand-2',
      headline: 'Coldplay announce UK tour',
      fallbackContext: 'New UK tour just announced',
      cityName: 'Leeds',
      kind: 'tour_announcement',
      verified: null,
    })
    assert.equal(draft.context, 'New UK tour just announced')
  })

  test('no verified match is flagged venueVerified: false and never carries a photo', () => {
    const draft = buildCityPostDraft({
      candidateId: 'cand-2',
      headline: 'Coldplay announce UK tour',
      fallbackContext: 'New UK tour just announced',
      cityName: 'Leeds',
      kind: 'tour_announcement',
      verified: null,
    })
    assert.equal(draft.image_params.venueVerified, false)
    assert.equal(draft.image_params.imageUrl, null)
    assert.equal(draft.image_params.dateLabel, null)
  })

  test('hashtags are scoped to this city only — a Leeds pack never carries a different city\'s tag', () => {
    const draft = buildCityPostDraft({
      candidateId: 'cand-2',
      headline: 'Coldplay announce UK tour',
      fallbackContext: 'New UK tour just announced',
      cityName: 'Leeds',
      kind: 'tour_announcement',
      verified: null,
    })
    assert.ok(draft.hashtags.includes('#Leeds'))
    assert.ok(!draft.hashtags.includes('#Manchester'))
  })

  test('city_name on the record matches the input city, for display/filtering', () => {
    const draft = buildCityPostDraft({
      candidateId: 'cand-1',
      headline: 'Coldplay announce Manchester date',
      fallbackContext: 'Coldplay announce Manchester date',
      cityName: 'Manchester',
      kind: 'tour_announcement',
      verified,
    })
    assert.equal(draft.city_name, 'Manchester')
  })

  test('two cities for the same story get distinct tracked links (campaignSuffix = city name)', () => {
    const manchester = buildCityPostDraft({
      candidateId: 'cand-3',
      headline: 'Coldplay announce UK tour',
      fallbackContext: 'New UK tour just announced',
      cityName: 'Manchester',
      kind: 'tour_announcement',
      verified: null,
    })
    const leeds = buildCityPostDraft({
      candidateId: 'cand-3',
      headline: 'Coldplay announce UK tour',
      fallbackContext: 'New UK tour just announced',
      cityName: 'Leeds',
      kind: 'tour_announcement',
      verified: null,
    })
    assert.notEqual(manchester.utm_campaign, leeds.utm_campaign)
    assert.ok(manchester.utm_campaign.includes('manchester'))
    assert.ok(leeds.utm_campaign.includes('leeds'))
  })

  test('every city pack still starts at status "draft" — manual review, never auto-posted', () => {
    const draft = buildCityPostDraft({
      candidateId: 'cand-2',
      headline: 'Coldplay announce UK tour',
      fallbackContext: 'New UK tour just announced',
      cityName: 'Leeds',
      kind: 'tour_announcement',
      verified: null,
    })
    assert.equal(draft.status, 'draft')
  })

  test('all three platform drafts (Facebook, Instagram, TikTok) are generated for each city pack', () => {
    const draft = buildCityPostDraft({
      candidateId: 'cand-1',
      headline: 'Coldplay announce Manchester date',
      fallbackContext: 'Coldplay announce Manchester date',
      cityName: 'Manchester',
      kind: 'tour_announcement',
      verified,
    })
    assert.ok(draft.facebook_text.length > 0)
    assert.ok(draft.instagram_text.length > 0)
    assert.ok(draft.tiktok_text.length > 0)
  })
})

describe('canSkipSocialPack / canUnskipSocialPack — skip without deleting the row', () => {
  test('a draft, ready_for_review or approved pack can be skipped', () => {
    assert.equal(canSkipSocialPack('draft'), true)
    assert.equal(canSkipSocialPack('ready_for_review'), true)
    assert.equal(canSkipSocialPack('approved'), true)
  })

  test('an already-posted pack cannot be skipped', () => {
    assert.equal(canSkipSocialPack('posted'), false)
  })

  test('an already-skipped pack cannot be skipped again — use Unskip instead', () => {
    assert.equal(canSkipSocialPack('skipped'), false)
  })

  test('only a skipped pack can be unskipped', () => {
    assert.equal(canUnskipSocialPack('skipped'), true)
    assert.equal(canUnskipSocialPack('draft'), false)
    assert.equal(canUnskipSocialPack('ready_for_review'), false)
    assert.equal(canUnskipSocialPack('approved'), false)
    assert.equal(canUnskipSocialPack('posted'), false)
  })
})

describe('canAdvanceSocialPackStatus — unaffected by the new "skipped" status', () => {
  test('"skipped" is never reachable or leaveable via the forward/back status ladder', () => {
    assert.equal(canAdvanceSocialPackStatus('draft', 'skipped'), false)
    assert.equal(canAdvanceSocialPackStatus('skipped', 'draft'), false)
    assert.equal(canAdvanceSocialPackStatus('skipped', 'skipped'), false)
  })
})
