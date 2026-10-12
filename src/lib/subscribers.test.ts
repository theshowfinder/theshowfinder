import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { normalizeEmail, isValidEmail, resolveSubscriberCityTag, shouldBackfillCityTag, resolveSignupSource, resolveSignupInterest, isMissingColumnError } from './subscribers.ts'

describe('normalizeEmail', () => {
  test('trims surrounding whitespace', () => {
    assert.equal(normalizeEmail('  a@b.com  '), 'a@b.com')
  })

  test('lowercases the whole address', () => {
    assert.equal(normalizeEmail('Chris.Spence@Example.COM'), 'chris.spence@example.com')
  })
})

describe('isValidEmail', () => {
  test('accepts a normal address', () => {
    assert.equal(isValidEmail('chris@theshowfinder.com'), true)
  })

  test('accepts a plus-tagged address', () => {
    assert.equal(isValidEmail('chris+newsletter@theshowfinder.com'), true)
  })

  test('accepts a subdomain', () => {
    assert.equal(isValidEmail('chris@mail.theshowfinder.com'), true)
  })

  test('rejects an address with no @', () => {
    assert.equal(isValidEmail('chris.theshowfinder.com'), false)
  })

  test('rejects an address with no domain dot', () => {
    assert.equal(isValidEmail('chris@theshowfinder'), false)
  })

  test('rejects an address with a space', () => {
    assert.equal(isValidEmail('chris spence@theshowfinder.com'), false)
  })

  test('rejects an empty string', () => {
    assert.equal(isValidEmail(''), false)
  })

  test('rejects a run of two dots in the local part', () => {
    assert.equal(isValidEmail('chris..spence@theshowfinder.com'), false)
  })

  test('rejects a run of two dots in the domain', () => {
    assert.equal(isValidEmail('chris@theshowfinder..com'), false)
  })

  test('rejects a leading dot in the local part', () => {
    assert.equal(isValidEmail('.chris@theshowfinder.com'), false)
  })

  test('rejects a domain label starting with a hyphen', () => {
    assert.equal(isValidEmail('chris@-theshowfinder.com'), false)
  })

  test('rejects an address longer than 254 characters', () => {
    const longLocal = 'a'.repeat(250)
    assert.equal(isValidEmail(`${longLocal}@x.com`), false)
  })

  test('rejects a single-character top-level domain', () => {
    assert.equal(isValidEmail('chris@theshowfinder.c'), false)
  })
})

describe('resolveSubscriberCityTag (Manchester newsletter tagging)', () => {
  test('a Manchester city-page signup resolves to "Manchester"', () => {
    assert.equal(resolveSubscriberCityTag('Manchester'), 'Manchester')
  })

  test('the national homepage form (no city passed at all) resolves to null', () => {
    assert.equal(resolveSubscriberCityTag(undefined), null)
  })

  test('an empty string resolves to null, not an empty string', () => {
    assert.equal(resolveSubscriberCityTag(''), null)
  })

  test('a whitespace-only city resolves to null', () => {
    assert.equal(resolveSubscriberCityTag('   '), null)
  })

  test('surrounding whitespace is trimmed off a real city name', () => {
    assert.equal(resolveSubscriberCityTag('  Manchester  '), 'Manchester')
  })
})

describe('shouldBackfillCityTag', () => {
  test('a Manchester tag should be backfilled onto an untagged existing subscriber', () => {
    assert.equal(shouldBackfillCityTag('Manchester'), true)
  })

  test('no city tag at all — nothing to backfill', () => {
    assert.equal(shouldBackfillCityTag(null), false)
  })
})

describe('resolveSignupSource', () => {
  test('lowercases and keeps a simple page-type tag', () => {
    assert.equal(resolveSignupSource('Event'), 'event')
    assert.equal(resolveSignupSource('west-end:show'), 'west-end:show')
  })
  test('strips anything outside the whitelist', () => {
    assert.equal(resolveSignupSource('<script>x</script>'), 'scriptxscript')
    assert.equal(resolveSignupSource('a b/c?d'), 'abcd')
  })
  test('caps length', () => {
    assert.equal(resolveSignupSource('a'.repeat(200))?.length, 60)
  })
  test('empty / missing / non-string -> null', () => {
    assert.equal(resolveSignupSource(''), null)
    assert.equal(resolveSignupSource(undefined), null)
    assert.equal(resolveSignupSource('!!!'), null)
    assert.equal(resolveSignupSource(42 as unknown as string), null)
  })
})

describe('resolveSignupInterest', () => {
  test('keeps a normal name and collapses whitespace', () => {
    assert.equal(resolveSignupInterest('  Hamilton   at Victoria Palace '), 'Hamilton at Victoria Palace')
  })
  test('removes control characters', () => {
    assert.equal(resolveSignupInterest('Foo\u0000Bar\n'), 'Foo Bar')
  })
  test('caps length and maps empty to null', () => {
    assert.equal(resolveSignupInterest('x'.repeat(500))?.length, 120)
    assert.equal(resolveSignupInterest('   '), null)
    assert.equal(resolveSignupInterest(null), null)
  })
})

describe('isMissingColumnError', () => {
  test('recognises Postgres and PostgREST codes', () => {
    assert.equal(isMissingColumnError({ code: '42703' }), true)
    assert.equal(isMissingColumnError({ code: 'PGRST204' }), true)
  })
  test('recognises the message form', () => {
    assert.equal(isMissingColumnError({ message: 'column "source" of relation "subscribers" does not exist' }), true)
    assert.equal(isMissingColumnError({ message: "Could not find the 'source' column of 'subscribers' in the schema cache" }), true)
  })
  test('ignores unrelated errors', () => {
    assert.equal(isMissingColumnError({ code: '23505', message: 'duplicate key' }), false)
    assert.equal(isMissingColumnError(null), false)
  })
})
