import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  formatShareWhen, buildShareText, trackedShareUrl, whatsappHref, facebookHref, xHref, mailtoHref, buildArtistShareText,
} from './shareText.ts'

describe('formatShareWhen', () => {
  test('shows London time with BST in summer', () => {
    assert.equal(formatShareWhen('2026-10-17T18:30:00Z'), 'Sat 17 Oct, 19:30 BST')
  })
  test('shows GMT in winter', () => {
    assert.equal(formatShareWhen('2026-12-11T19:30:00Z'), 'Fri 11 Dec, 19:30 GMT')
  })
  test('midnight London shows the date only (time not known)', () => {
    assert.equal(formatShareWhen('2026-10-16T23:00:00Z'), 'Sat 17 Oct')
  })
  test('null for missing or invalid', () => {
    assert.equal(formatShareWhen(null), null)
    assert.equal(formatShareWhen('nope'), null)
  })
})

describe('buildShareText', () => {
  const base = { title: 'Nickelback', venueName: 'The O2', city: 'London', startISO: '2026-10-17T18:30:00Z' }
  test('on sale: invites a friend and ends with a colon for the link', () => {
    assert.equal(buildShareText({ ...base, status: 'on_sale' }), 'Fancy this? Nickelback, The O2, London, Sat 17 Oct, 19:30 BST. Find tickets:')
  })
  test('sold out points to resale', () => {
    assert.match(buildShareText({ ...base, status: 'sold_out' }), /Sold out .* resale/)
  })
  test('cancelled and postponed do not invite anyone', () => {
    assert.ok(!buildShareText({ ...base, status: 'cancelled' }).includes('Fancy'))
    assert.match(buildShareText({ ...base, status: 'postponed' }), /postponed/)
  })
  test('missing venue and time still reads cleanly', () => {
    assert.equal(buildShareText({ title: 'Comedy Night' }), 'Fancy this? Comedy Night. Find tickets:')
  })
})

describe('share URLs', () => {
  test('tracked url adds utm params with ? or &', () => {
    assert.equal(trackedShareUrl('https://x.test/events/a', 'whatsapp'), 'https://x.test/events/a?utm_source=share&utm_medium=whatsapp&utm_campaign=event_share')
    assert.ok(trackedShareUrl('https://x.test/a?b=1', 'copy').includes('?b=1&utm_source=share'))
  })
  test('channel hrefs are encoded', () => {
    assert.ok(whatsappHref('Hi & bye', 'https://x.test/a?b=1').startsWith('https://wa.me/?text=Hi%20%26%20bye%20https%3A%2F%2Fx.test'))
    assert.ok(facebookHref('https://x.test/a').includes('u=https%3A%2F%2Fx.test%2Fa'))
    assert.ok(xHref('t', 'https://x.test/a').includes('&url='))
    assert.ok(mailtoHref('S', 'Body', 'https://x.test/a').startsWith('mailto:?subject=S&body=Body%0A%0A'))
  })
})

describe('buildArtistShareText', () => {
  test('wording follows the number of dates', () => {
    assert.equal(buildArtistShareText('Nickelback', 5), 'Nickelback has 5 UK dates coming up. Find tickets:')
    assert.equal(buildArtistShareText('Nickelback', 1), 'Nickelback is playing the UK soon. Find tickets:')
    assert.equal(buildArtistShareText('Nickelback', 0), 'Have a look at Nickelback on TheShowFinder:')
  })
})

import { cardSafeText } from './shareText.ts'
describe('cardSafeText', () => {
  test('keeps normal titles, accents and punctuation', () => {
    assert.equal(cardSafeText("Florence + the Machine: Café Tour – 2027 £25"), "Florence + the Machine: Café Tour – 2027 £25")
  })
  test('drops emoji, zero-width and variation-selector characters', () => {
    assert.equal(cardSafeText('Lion King 🦁 ​ Live️'), 'Lion King Live')
  })
  test('curly quotes become plain quotes; empty/nullish becomes empty string', () => {
    assert.equal(cardSafeText('Don’t Stop'), "Don't Stop")
    assert.equal(cardSafeText(null), '')
    assert.equal(cardSafeText('日本語'), '')
  })
})
