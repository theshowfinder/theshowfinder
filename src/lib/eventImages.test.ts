import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { eventImageUrl, teamImageFor, teamFixtureImage, artistPhotoUrl } from './eventImages.ts'

const DERBY = '/event-fallbacks/teams/derby-county.jpg'

describe('club artwork', () => {
  test('every home fixture uses the club\'s own image, even when the feed supplied one', () => {
    assert.equal(eventImageUrl(null, 'sports', 'Derby County vs Stoke City'), DERBY)
    assert.equal(eventImageUrl('https://www.theshowfinder.com/og-image.png', 'concert', 'Derby County vs Watford'), DERBY)
    assert.equal(eventImageUrl('https://s1.ticketm.net/uk/dbimages/17124a.jpg', 'sports', 'Derby County V Millwall'), DERBY)
    assert.equal(eventImageUrl('https://x.test/a.jpg', 'sports', 'Burnley FC Women vs Everton Women'), '/event-fallbacks/teams/burnley.jpg')
    assert.equal(eventImageUrl(null, 'sports', 'Queens Park Rangers v Leeds United'), '/event-fallbacks/teams/queens-park-rangers.jpg')
    assert.equal(eventImageUrl(null, 'sports', 'QPR vs Millwall'), '/event-fallbacks/teams/queens-park-rangers.jpg')
    assert.equal(eventImageUrl(null, 'sports', 'West Ham United vs Arsenal'), '/event-fallbacks/teams/west-ham-united.jpg')
    assert.equal(eventImageUrl(null, 'sports', 'Tottenham Hotspur Women vs Chelsea'), '/event-fallbacks/teams/tottenham-hotspur.jpg')
  })
  test('the club artist page uses it, other artists keep their own photo', () => {
    assert.equal(artistPhotoUrl('Derby County FC', 'https://s1.ticketm.net/x.jpg'), DERBY)
    assert.equal(artistPhotoUrl('Derby County', null), DERBY)
    assert.equal(artistPhotoUrl('Wigan Athletic', null), '/event-fallbacks/teams/wigan-athletic.jpg')
    assert.equal(artistPhotoUrl('Westlife', 'https://s1.ticketm.net/w.jpg'), 'https://s1.ticketm.net/w.jpg')
    assert.equal(artistPhotoUrl('Westlife', null), null)
  })
  test('away fixtures, non-sport shows and other clubs are unaffected', () => {
    assert.equal(teamFixtureImage('Stoke City vs Derby County'), null)
    assert.equal(teamFixtureImage('Blackpool Tower Circus'), null)
    assert.equal(teamFixtureImage('Celtic Woman live'), null)
    assert.equal(teamFixtureImage('Derby Arena Gig'), null)
    assert.equal(teamImageFor('Blackpool Illuminations'), null)
    assert.equal(teamImageFor('Burnley Blues Band'), null)
    assert.equal(teamImageFor('Stoke City'), null)
  })
})
