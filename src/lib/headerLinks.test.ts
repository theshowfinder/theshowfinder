import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { NAV_LINKS, PRIMARY_CTA, isAccountAuthHref } from './headerLinks.ts'

describe('isAccountAuthHref', () => {
  test('flags /login', () => {
    assert.equal(isAccountAuthHref('/login'), true)
  })

  test('flags /signup', () => {
    assert.equal(isAccountAuthHref('/signup'), true)
  })

  test('flags /login and /signup with a trailing slash', () => {
    assert.equal(isAccountAuthHref('/login/'), true)
    assert.equal(isAccountAuthHref('/signup/'), true)
  })

  test('flags /login with a query string or hash', () => {
    assert.equal(isAccountAuthHref('/login?next=/events'), true)
    assert.equal(isAccountAuthHref('/signup#top'), true)
  })

  test('does not flag an ordinary public route', () => {
    assert.equal(isAccountAuthHref('/on-sale-this-week'), false)
    assert.equal(isAccountAuthHref('/events?category=concert'), false)
  })

  test('does not flag the newsletter CTA target', () => {
    assert.equal(isAccountAuthHref('/#newsletter'), false)
  })

  test('does not flag the admin login, which is a different, private route', () => {
    assert.equal(isAccountAuthHref('/admin'), false)
    assert.equal(isAccountAuthHref('/admin/login'), false)
  })
})

describe('NAV_LINKS', () => {
  test('contains the expected public site sections', () => {
    const labels = NAV_LINKS.map(l => l.label)
    assert.deepEqual(labels, ['News', 'On Sale', 'Concerts', 'Theatre', 'Comedy', 'Sports', 'Family'])
  })

  // Regression guard for this change: public account registration
  // ("Sign up free" / "Sign in") used to live in Header.tsx's own JSX
  // alongside this list. Nothing in NAV_LINKS should ever point at the
  // (unused, unlinked) visitor account system.
  test('no nav link points at the account auth system', () => {
    for (const link of NAV_LINKS) {
      assert.equal(isAccountAuthHref(link.href), false, `"${link.label}" unexpectedly points at account auth (${link.href})`)
    }
  })
})

describe('PRIMARY_CTA', () => {
  test('reads as a ticket-alerts / newsletter CTA, not an account CTA', () => {
    assert.match(PRIMARY_CTA.label, /newsletter|ticket alert/i)
  })

  test('does not point at the account auth system', () => {
    assert.equal(isAccountAuthHref(PRIMARY_CTA.href), false)
  })

  test('points at the newsletter signup section', () => {
    assert.equal(PRIMARY_CTA.href, '/#newsletter')
  })
})
