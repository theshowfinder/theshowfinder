import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { normalizeArtistText, artistMatchScore, rankArtists, parseLetter, dateCountLabel } from './artistSearch.ts'

describe('artistMatchScore', () => {
  test('exact beats prefix beats word-prefix beats contains', () => {
    assert.equal(artistMatchScore('Will Young', 'Will Young'), 0)
    assert.equal(artistMatchScore('will', 'Will Young'), 1)
    assert.equal(artistMatchScore('wil', 'Will Young'), 2)
    assert.equal(artistMatchScore('young', 'Will Young'), 3)
    assert.equal(artistMatchScore('ill you', 'Will Young'), 4)
    assert.equal(artistMatchScore('zzz', 'Will Young'), null)
  })
  test('ignores punctuation, case, accents and spacing', () => {
    assert.equal(artistMatchScore('n dubz', 'N-Dubz'), 0)
    assert.equal(artistMatchScore('ndubz', 'N-Dubz'), 5)
    assert.equal(artistMatchScore('beyonce', 'Beyoncé'), 0)
    assert.equal(normalizeArtistText('Florence + The Machine'), 'florence the machine')
  })
  test('empty query matches nothing', () => {
    assert.equal(artistMatchScore('  ', 'Anyone'), null)
  })
})

describe('rankArtists', () => {
  const rows = [
    { name: 'Will Young Tribute', upcoming_count: 9 },
    { name: 'Will Young', upcoming_count: 3 },
    { name: 'Young Will', upcoming_count: 20 },
    { name: 'Nobody', upcoming_count: 99 },
  ]
  test('exact name first even with fewer dates; non-matches dropped', () => {
    const out = rankArtists('will young', rows).map(r => r.name)
    assert.deepEqual(out, ['Will Young', 'Will Young Tribute', 'Young Will'])
  })
  test('ties broken by upcoming dates then name', () => {
    const out = rankArtists('the', [
      { name: 'The B', upcoming_count: 1 }, { name: 'The A', upcoming_count: 1 }, { name: 'The C', upcoming_count: 5 },
    ]).map(r => r.name)
    assert.deepEqual(out, ['The C', 'The A', 'The B'])
  })
})

describe('parseLetter / dateCountLabel', () => {
  test('parseLetter', () => {
    assert.equal(parseLetter('b'), 'B')
    assert.equal(parseLetter('#'), '#')
    assert.equal(parseLetter('ab'), null)
    assert.equal(parseLetter("'; drop"), null)
    assert.equal(parseLetter(undefined), null)
  })
  test('dateCountLabel', () => {
    assert.equal(dateCountLabel(1, null), '1 UK date')
    assert.match(dateCountLabel(12, '2027-03-04T19:00:00Z'), /^12 UK dates · next 4 Mar$/)
  })
})
