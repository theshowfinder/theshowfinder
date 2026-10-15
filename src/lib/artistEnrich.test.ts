import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { parseAttractionProfile, safeHttpsUrl, wikiTitleFromUrl, cleanWikiExtract } from './artistEnrich.ts'

describe('parseAttractionProfile', () => {
  test('reads genre, links and the wikipedia page', () => {
    const p = parseAttractionProfile({
      classifications: [{ genre: { name: 'Hip-Hop/Rap' }, subGenre: { name: 'Grime' } }],
      externalLinks: {
        homepage: [{ url: 'https://www.ndubz.com' }],
        wiki: [{ url: 'https://en.wikipedia.org/wiki/N-Dubz' }],
        spotify: [{ url: 'https://open.spotify.com/artist/abc' }],
        instagram: [{ url: 'https://www.instagram.com/ndubz' }],
      },
    })
    assert.equal(p.genre, 'Hip-Hop/Rap')
    assert.equal(p.website, 'https://www.ndubz.com/')
    assert.equal(p.wikipediaUrl, 'https://en.wikipedia.org/wiki/N-Dubz')
    assert.equal(p.social.spotify, 'https://open.spotify.com/artist/abc')
    assert.equal(p.social.instagram, 'https://www.instagram.com/ndubz')
  })
  test('placeholder genres fall back to sub-genre, then null', () => {
    assert.equal(parseAttractionProfile({ classifications: [{ genre: { name: 'Undefined' }, subGenre: { name: 'Pop' } }] }).genre, 'Pop')
    assert.equal(parseAttractionProfile({ classifications: [{ genre: { name: 'Other' } }] }).genre, null)
  })
  test('drops unsafe or non-https links and non-wikipedia "wiki" links', () => {
    const p = parseAttractionProfile({ externalLinks: {
      homepage: [{ url: 'javascript:alert(1)' }, { url: 'http://insecure.example.com' }],
      wiki: [{ url: 'https://evil.example.com/wiki/X' }],
      twitter: [{ url: 42 }],
    } })
    assert.equal(p.website, null)
    assert.equal(p.wikipediaUrl, null)
    assert.deepEqual(p.social, {})
  })
  test('survives garbage input', () => {
    assert.deepEqual(parseAttractionProfile(null), { genre: null, website: null, wikipediaUrl: null, social: {} })
    assert.equal(safeHttpsUrl('not a url'), null)
  })
})

describe('wikiTitleFromUrl', () => {
  test('decodes titles', () => {
    assert.deepEqual(wikiTitleFromUrl('https://en.wikipedia.org/wiki/Florence_%2B_the_Machine'), { lang: 'en', title: 'Florence + the Machine' })
    assert.equal(wikiTitleFromUrl('https://example.com/wiki/X'), null)
  })
})

describe('cleanWikiExtract', () => {
  const long = 'N-Dubz are a British hip hop trio formed in London in 2006. The group consists of Dappy, Tulisa and Fazer. They released three albums. Their first album reached number one in the UK charts and went platinum. ' + 'More text here. '.repeat(40)
  test('stops at a sentence boundary under the limit', () => {
    const out = cleanWikiExtract(long, 'standard')!
    assert.ok(out.length <= 480, String(out.length))
    assert.ok(out.endsWith('.'))
    assert.ok(out.startsWith('N-Dubz are a British hip hop trio'))
  })
  test('rejects disambiguation pages, empties and non-strings', () => {
    assert.equal(cleanWikiExtract(long, 'disambiguation'), null)
    assert.equal(cleanWikiExtract('Short.', 'standard'), null)
    assert.equal(cleanWikiExtract(undefined), null)
  })
  test('always keeps at least the first sentence', () => {
    const one = 'A '.repeat(300).trim() + '. Second sentence here that is long enough to matter.'
    assert.ok(cleanWikiExtract(one)!.length > 100)
  })
})
