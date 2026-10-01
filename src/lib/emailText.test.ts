import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { isTokenCleanlyTerminated, buildWelcomeEmailText } from './emailText.ts'

describe('isTokenCleanlyTerminated', () => {
  test('passes when the token is followed by a space', () => {
    assert.equal(isTokenCleanlyTerminated('We sent this to chris@hotmail.com because you signed up', 'chris@hotmail.com'), true)
  })

  test('passes when the token is at the very end of the string', () => {
    assert.equal(isTokenCleanlyTerminated('Your address is chris@hotmail.com', 'chris@hotmail.com'), true)
  })

  test('passes when the token is on its own line', () => {
    assert.equal(isTokenCleanlyTerminated('Address:\nchris@hotmail.com\nThanks', 'chris@hotmail.com'), true)
  })

  test('passes when the token is followed by a space then punctuation', () => {
    assert.equal(isTokenCleanlyTerminated('Sent to chris@hotmail.com, thanks', 'chris@hotmail.com'), true)
  })

  // Regression test for the exact bug reported: the email glued
  // directly to the next word with no separator ("...combecause").
  test('fails when a word is glued directly onto the token with no separator', () => {
    assert.equal(isTokenCleanlyTerminated('We sent this to chris@hotmail.combecause you signed up', 'chris@hotmail.com'), false)
  })

  test('fails when the token is immediately followed by a period with no space', () => {
    assert.equal(isTokenCleanlyTerminated('You signed up with chris@hotmail.com.', 'chris@hotmail.com'), false)
  })

  test('fails when a URL token is glued directly onto the next word', () => {
    assert.equal(isTokenCleanlyTerminated('Browse events: https://www.theshowfinder.comtoday', 'https://www.theshowfinder.com'), false)
  })

  test('checks every occurrence of the token independently', () => {
    const text = 'First mention: a@b.com is fine. Second mention: a@b.comtrailing is not.'
    assert.equal(isTokenCleanlyTerminated(text, 'a@b.com'), false)
  })

  test('returns false when the token never appears at all', () => {
    assert.equal(isTokenCleanlyTerminated('No addresses here.', 'chris@hotmail.com'), false)
  })
})

describe('buildWelcomeEmailText', () => {
  test('includes the subscriber email on its own line', () => {
    const text = buildWelcomeEmailText('chris@hotmail.com')
    assert.ok(text.includes('\nchris@hotmail.com\n'))
  })

  test('includes a correctly formed, email-specific unsubscribe link', () => {
    const text = buildWelcomeEmailText('chris@hotmail.com')
    assert.ok(text.includes('https://www.theshowfinder.com/unsubscribe?email=chris%40hotmail.com'))
  })

  test('URL-encodes an email address with special characters in the unsubscribe link', () => {
    const text = buildWelcomeEmailText('chris+newsletter@hotmail.com')
    assert.ok(text.includes('email=chris%2Bnewsletter%40hotmail.com'))
  })

  test('the subscriber email is never glued to surrounding text, for a realistic address', () => {
    const email = 'chris@hotmail.com'
    assert.equal(isTokenCleanlyTerminated(buildWelcomeEmailText(email), email), true)
  })

  test('the subscriber email is never glued to surrounding text, even with a plus tag', () => {
    const email = 'chris+test@hotmail.com'
    assert.equal(isTokenCleanlyTerminated(buildWelcomeEmailText(email), email), true)
  })

  test('the browse-events URL is never glued to surrounding text', () => {
    const text = buildWelcomeEmailText('chris@hotmail.com')
    assert.equal(isTokenCleanlyTerminated(text, 'https://www.theshowfinder.com'), true)
  })
})
