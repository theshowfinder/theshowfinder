import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { socialSource, socialSignupSource, SOCIAL_PLATFORM_NAMES } from './socialSource.ts'

const q = (s: string) => new URLSearchParams(s)

describe('socialSource', () => {
  test('recognises the three launch platforms', () => {
    assert.equal(socialSource(q('utm_source=tiktok&utm_medium=social')), 'tiktok')
    assert.equal(socialSource(q('utm_source=instagram')), 'instagram')
    assert.equal(socialSource(q('utm_source=youtube')), 'youtube')
  })
  test('accepts common aliases and any case', () => {
    assert.equal(socialSource(q('utm_source=IG')), 'instagram')
    assert.equal(socialSource(q('utm_source=YouTube_Shorts')), 'youtube')
    assert.equal(socialSource(q('utm_source=fb')), 'facebook')
    assert.equal(socialSource(q('utm_source=twitter')), 'x')
  })
  test('null for non-social, share links, missing or empty', () => {
    assert.equal(socialSource(q('utm_source=share&utm_medium=whatsapp')), null)
    assert.equal(socialSource(q('utm_source=newsletter')), null)
    assert.equal(socialSource(q('')), null)
    assert.equal(socialSource(q('utm_source=')), null)
    assert.equal(socialSource(null), null)
  })
})

describe('socialSignupSource', () => {
  test('is prefixed and survives the subscriber source whitelist', () => {
    assert.equal(socialSignupSource('tiktok'), 'social-tiktok')
    assert.match(socialSignupSource('instagram'), /^[a-z0-9:_-]+$/)
  })
  test('has a display name for every platform', () => {
    assert.equal(SOCIAL_PLATFORM_NAMES.tiktok, 'TikTok')
  })
})
