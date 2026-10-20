import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { eventImageUrl, teamImageFor, artistPhotoUrl } from './eventImages.ts'

const DERBY = '/event-fallbacks/teams/derby-county.jpg'

describe('club artwork', () => {
  test('every Derby County match uses our own image, even when the feed supplied one', () => {
    assert.equal(eventImageUrl(null, 'sports', 'Derby County vs Stoke City'), DERBY)
    assert.equal(eventImageUrl('https://www.theshowfinder.com/og-image.png', 'concert', 'Derby County vs Watford'), DERBY)
    assert.equal(eventImageUrl('https://s1.ticketm.net/uk/dbimages/17124a.jpg', 'sports', 'Derby County vs Millwall'), DERBY)
  })
  test('the club artist page uses it, other artists keep their own photo', () => {
    assert.equal(artistPhotoUrl('Derby County FC', 'https://s1.ticketm.net/x.jpg'), DERBY)
    assert.equal(artistPhotoUrl('Derby County', null), DERBY)
    assert.equal(artistPhotoUrl('Westlife', 'https://s1.ticketm.net/w.jpg'), 'https://s1.ticketm.net/w.jpg')
    assert.equal(artistPhotoUrl('Westlife', null), null)
  })
  test('other clubs, away fixtures and non-sport titles are unaffected', () => {
    assert.equal(teamImageFor('Stoke City vs Derby County'), null)
    assert.equal(teamImageFor('Derby Arena Gig'), null)
  })
})
