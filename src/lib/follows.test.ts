import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  followKey, parseFollowed, serializeFollowed, toggleFollowed, isFollowKind,
  buildFollowAlerts, MAX_SHOWS_PER_FOLLOW, MAX_SHOWS_PER_EMAIL, MAX_FOLLOWED,
  type FollowRow, type NewShow,
} from './follows.ts'

describe('browser follow list', () => {
  test('keys combine kind and slug', () => {
    assert.equal(followKey('artist', 'nickelback'), 'artist:nickelback')
    assert.equal(isFollowKind('venue'), true)
    assert.equal(isFollowKind('city'), false)
  })
  test('parse drops junk, duplicates and bad kinds; never throws', () => {
    assert.deepEqual(parseFollowed('not json'), [])
    assert.deepEqual(parseFollowed('{"a":1}'), [])
    assert.deepEqual(parseFollowed(JSON.stringify(['artist:a', 'artist:a', 'city:x', 'venue:o2-arena', 'venue:', 5, 'artist:UPPER'])), ['artist:a', 'venue:o2-arena'])
    assert.deepEqual(parseFollowed(null), [])
  })
  test('round-trips and caps the list', () => {
    assert.deepEqual(parseFollowed(serializeFollowed(['artist:a', 'venue:b'])), ['artist:a', 'venue:b'])
    const many = Array.from({ length: MAX_FOLLOWED + 20 }, (_, i) => `artist:a${i}`)
    assert.equal(parseFollowed(serializeFollowed(many)).length, MAX_FOLLOWED)
  })
  test('toggle adds to the front and removes', () => {
    assert.deepEqual(toggleFollowed(['venue:b'], 'artist:a'), ['artist:a', 'venue:b'])
    assert.deepEqual(toggleFollowed(['artist:a', 'venue:b'], 'artist:a'), ['venue:b'])
    assert.deepEqual(toggleFollowed(['venue:b'], 'nonsense'), ['venue:b'])
  })
})

const RUN = '2026-10-16T06:20:00Z'
function follow(over: Partial<FollowRow>): FollowRow {
  return { id: 'f1', email: 'a@x.com', kind: 'artist', targetId: 'art1', targetName: 'Nickelback', targetSlug: 'nickelback', floorISO: '2026-10-15T06:20:00Z', ...over }
}
function show(over: Partial<NewShow>): NewShow {
  return { id: 's1', slug: 'nickelback-o2', title: 'Nickelback', startISO: '2027-03-01T19:30:00Z', createdISO: '2026-10-16T02:00:00Z', venueId: 'ven1', venueName: 'The O2', city: 'London', artistIds: ['art1'], ...over }
}

describe('buildFollowAlerts', () => {
  test('a new show for a followed artist makes one batch', () => {
    const out = buildFollowAlerts([follow({})], [show({})], RUN)
    assert.equal(out.length, 1)
    assert.equal(out[0].email, 'a@x.com')
    assert.equal(out[0].items[0].shows[0].slug, 'nickelback-o2')
    assert.equal(out[0].totalShows, 1)
  })
  test('shows added before the follow, or after the run, are ignored', () => {
    assert.equal(buildFollowAlerts([follow({})], [show({ createdISO: '2026-10-14T00:00:00Z' })], RUN).length, 0)
    assert.equal(buildFollowAlerts([follow({})], [show({ createdISO: '2026-10-16T07:00:00Z' })], RUN).length, 0)
  })
  test('other artists and venues do not match', () => {
    assert.equal(buildFollowAlerts([follow({})], [show({ artistIds: ['other'] })], RUN).length, 0)
    assert.equal(buildFollowAlerts([follow({ kind: 'venue', targetId: 'ven9' })], [show({})], RUN).length, 0)
  })
  test('venue follows match on the venue', () => {
    const out = buildFollowAlerts([follow({ kind: 'venue', targetId: 'ven1', targetName: 'The O2', targetSlug: 'the-o2' })], [show({})], RUN)
    assert.equal(out[0].items[0].kind, 'venue')
  })
  test('a show matching an artist and its venue is listed once, under the artist', () => {
    const fs = [
      follow({ id: 'f2', kind: 'venue', targetId: 'ven1', targetName: 'The O2', targetSlug: 'the-o2' }),
      follow({ id: 'f1' }),
    ]
    const out = buildFollowAlerts(fs, [show({})], RUN)
    assert.equal(out[0].items.length, 1)
    assert.equal(out[0].items[0].kind, 'artist')
    assert.equal(out[0].totalShows, 1)
  })
  test('one batch per address, case-insensitive', () => {
    const fs = [follow({ id: 'f1', email: 'A@x.com' }), follow({ id: 'f2', email: 'a@x.com', kind: 'venue', targetId: 'ven1', targetName: 'The O2', targetSlug: 'the-o2' })]
    assert.equal(buildFollowAlerts(fs, [show({ id: 's2', artistIds: [] })], RUN).length, 1)
    assert.equal(buildFollowAlerts([follow({ email: 'a@x.com' }), follow({ id: 'f9', email: 'b@x.com' })], [show({})], RUN).length, 2)
  })
  test('per-follow cap leaves the rest as "more"', () => {
    const shows = Array.from({ length: MAX_SHOWS_PER_FOLLOW + 3 }, (_, i) => show({ id: `s${i}`, slug: `s${i}`, startISO: `2027-03-${String(i + 1).padStart(2, '0')}T19:30:00Z` }))
    const item = buildFollowAlerts([follow({})], shows, RUN)[0].items[0]
    assert.equal(item.shows.length, MAX_SHOWS_PER_FOLLOW)
    assert.equal(item.more, 3)
    assert.equal(item.shows[0].slug, 's0') // soonest first
  })
  test('per-email cap across follows', () => {
    const fs = Array.from({ length: 4 }, (_, i) => follow({ id: `f${i}`, targetId: `art${i}`, targetName: `Artist ${i}`, targetSlug: `artist-${i}` }))
    const shows = fs.flatMap((f, i) => Array.from({ length: MAX_SHOWS_PER_FOLLOW }, (_, j) => show({ id: `s${i}-${j}`, slug: `s${i}-${j}`, artistIds: [f.targetId] })))
    const out = buildFollowAlerts(fs, shows, RUN)[0]
    assert.equal(out.totalShows, MAX_SHOWS_PER_EMAIL)
  })
})
