import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { tallyCityArtists, pickSimilar, cityShowsLabel } from './relatedArtists.ts'

describe('tallyCityArtists', () => {
  const links = [
    { artist_id: 'a', event_id: 'e1' }, { artist_id: 'a', event_id: 'e2' }, { artist_id: 'a', event_id: 'e2' },
    { artist_id: 'b', event_id: 'e3' }, { artist_id: 'c', event_id: 'e4' }, { artist_id: 'c', event_id: 'e5' }, { artist_id: 'c', event_id: 'e6' },
  ]
  test('counts distinct shows, busiest first, skipping excluded artists', () => {
    assert.deepEqual(tallyCityArtists(links, ['a']), [{ artistId: 'c', shows: 3 }, { artistId: 'b', shows: 1 }])
    assert.deepEqual(tallyCityArtists(links, []).map(r => [r.artistId, r.shows]), [['c', 3], ['a', 2], ['b', 1]])
  })
  test('empty input', () => assert.deepEqual(tallyCityArtists([], []), []))
})

describe('pickSimilar', () => {
  const g = [{ id: '1' }, { id: '2' }]
  const p = [{ id: '2' }, { id: '3' }, { id: '4' }, { id: '5' }]
  test('same-genre first, topped up with popular, no duplicates or excluded', () => {
    assert.deepEqual(pickSimilar(g, p, ['3'], 4).map(r => r.id), ['1', '2', '4', '5'])
  })
  test('respects the limit', () => assert.equal(pickSimilar(g, p, [], 2).length, 2))
})

describe('cityShowsLabel', () => {
  test('pluralises', () => {
    assert.equal(cityShowsLabel(1, 'Leeds'), '1 show in Leeds')
    assert.equal(cityShowsLabel(3, 'Leeds'), '3 shows in Leeds')
  })
})
