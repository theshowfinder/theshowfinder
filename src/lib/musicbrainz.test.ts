import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { mbidFromLink, parseMusicBrainzArtist, buildMusicBrainzBio, titleCaseGenre } from './musicbrainz.ts'

const ID = '5b11f4ce-a62d-471e-81fc-a69a8278c7da'

describe('mbidFromLink', () => {
  test('bare id, url, and rubbish', () => {
    assert.equal(mbidFromLink(ID.toUpperCase()), ID)
    assert.equal(mbidFromLink(`https://musicbrainz.org/artist/${ID}`), ID)
    assert.equal(mbidFromLink('not-an-id'), null)
    assert.equal(mbidFromLink(undefined), null)
    assert.equal(mbidFromLink("x'; drop table artists"), null)
  })
})

const group = {
  type: 'Group',
  area: { name: 'United Kingdom' },
  'begin-area': { name: 'London' },
  'life-span': { begin: '2006-03', ended: false },
  genres: [{ name: 'hip hop', count: 3 }, { name: 'grime', count: 8 }, { name: 'pop', count: 1 }],
  relations: [
    { type: 'wikipedia', url: { resource: 'https://en.wikipedia.org/wiki/N-Dubz' } },
    { type: 'official homepage', url: { resource: 'https://www.ndubz.com' } },
    { type: 'social network', url: { resource: 'https://www.instagram.com/ndubz' } },
    { type: 'social network', url: { resource: 'http://insecure.example.com' } },
  ],
}

describe('parseMusicBrainzArtist', () => {
  test('reads place, year, top two genres and links', () => {
    const p = parseMusicBrainzArtist(group)
    assert.equal(p.place, 'London')
    assert.equal(p.formedYear, 2006)
    assert.deepEqual(p.genres, ['grime', 'hip hop'])
    assert.equal(p.wikipediaUrl, 'https://en.wikipedia.org/wiki/N-Dubz')
    assert.equal(p.website, 'https://www.ndubz.com/')
    assert.equal(p.social.instagram, 'https://www.instagram.com/ndubz')
  })
  test('survives garbage', () => {
    const p = parseMusicBrainzArtist(null)
    assert.deepEqual([p.type, p.place, p.formedYear, p.genres], [null, null, null, []])
  })
})

describe('buildMusicBrainzBio', () => {
  test('group sentence with genres, place and year', () => {
    assert.equal(buildMusicBrainzBio('N-Dubz', parseMusicBrainzArtist(group)), 'N-Dubz is a grime and hip hop group from London, formed in 2006.')
  })
  test('person: no birth year, correct article', () => {
    const p = parseMusicBrainzArtist({ type: 'Person', area: { name: 'United Kingdom' }, 'life-span': { begin: '1979-01-09' }, genres: [{ name: 'electronic', count: 2 }] })
    assert.equal(buildMusicBrainzBio('Will Young', p), 'Will Young is an electronic artist from United Kingdom.')
  })
  test('null when guessing: no genre/place, ended act, unknown type', () => {
    assert.equal(buildMusicBrainzBio('X', parseMusicBrainzArtist({ type: 'Group' })), null)
    assert.equal(buildMusicBrainzBio('X', parseMusicBrainzArtist({ ...group, 'life-span': { begin: '1970', ended: true } })), null)
    assert.equal(buildMusicBrainzBio('X', parseMusicBrainzArtist({ ...group, type: 'Character' })), null)
  })
  test('"a UK garage" not "an UK garage"; title-casing', () => {
    const p = parseMusicBrainzArtist({ type: 'Group', area: { name: 'London' }, genres: [{ name: 'uk garage', count: 1 }] })
    assert.match(buildMusicBrainzBio('X', p)!, /^X is a uk garage group/)
    assert.equal(titleCaseGenre('uk garage'), 'UK Garage')
    assert.equal(titleCaseGenre('hip hop'), 'Hip Hop')
  })
})
