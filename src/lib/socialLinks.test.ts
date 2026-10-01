import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { SOCIAL_LINKS, isValidSocialLink } from './socialLinks.ts'

describe('SOCIAL_LINKS', () => {
  test('has exactly one entry per platform: Instagram, TikTok, Facebook', () => {
    const platforms = SOCIAL_LINKS.map(l => l.platform).sort()
    assert.deepEqual(platforms, ['Facebook', 'Instagram', 'TikTok'])
  })

  test('Instagram points to the exact confirmed account URL', () => {
    const link = SOCIAL_LINKS.find(l => l.platform === 'Instagram')
    assert.equal(link?.href, 'https://www.instagram.com/theshow_finder/')
  })

  test('TikTok points to the exact confirmed account URL', () => {
    const link = SOCIAL_LINKS.find(l => l.platform === 'TikTok')
    assert.equal(link?.href, 'https://www.tiktok.com/@theshowfinder')
  })

  test('Facebook points to the exact confirmed account URL', () => {
    const link = SOCIAL_LINKS.find(l => l.platform === 'Facebook')
    assert.equal(link?.href, 'https://www.facebook.com/profile.php?id=61592305512592')
  })

  test('every link has a non-empty, platform-specific label for screen readers', () => {
    for (const link of SOCIAL_LINKS) {
      assert.ok(link.label.trim().length > 0, `${link.platform} is missing a label`)
      assert.ok(link.label.includes(link.platform), `${link.platform}'s label doesn't name the platform`)
    }
  })

  test('every link is a valid https URL with a label — isValidSocialLink passes all of them', () => {
    for (const link of SOCIAL_LINKS) {
      assert.equal(isValidSocialLink(link), true, `${link.platform} failed validation`)
    }
  })

  test('has no duplicate platforms', () => {
    const platforms = SOCIAL_LINKS.map(l => l.platform)
    assert.equal(platforms.length, new Set(platforms).size)
  })
})

describe('isValidSocialLink', () => {
  test('rejects a link with an empty label', () => {
    assert.equal(isValidSocialLink({ platform: 'Instagram', label: '', href: 'https://instagram.com/x' }), false)
  })

  test('rejects a link with a whitespace-only label', () => {
    assert.equal(isValidSocialLink({ platform: 'Instagram', label: '   ', href: 'https://instagram.com/x' }), false)
  })

  test('rejects a non-https URL (e.g. plain http)', () => {
    assert.equal(isValidSocialLink({ platform: 'Instagram', label: 'Follow us', href: 'http://instagram.com/x' }), false)
  })

  test('rejects a malformed URL', () => {
    assert.equal(isValidSocialLink({ platform: 'Instagram', label: 'Follow us', href: 'not a url' }), false)
  })

  test('rejects a relative path', () => {
    assert.equal(isValidSocialLink({ platform: 'Instagram', label: 'Follow us', href: '/instagram' }), false)
  })

  test('accepts a well-formed https link with a label', () => {
    assert.equal(isValidSocialLink({ platform: 'Instagram', label: 'Follow us on Instagram', href: 'https://instagram.com/x' }), true)
  })
})
