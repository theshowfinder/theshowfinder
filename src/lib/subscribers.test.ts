import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { normalizeEmail, isValidEmail } from './subscribers.ts'

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
