import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { getArtistSeoAlias, getEventSeoAlias } from './seoAliases.ts'

describe('SEO aliases', () => {
  test('redirects the confirmed duplicate Ian Shaw URL', () => {
    assert.equal(getArtistSeoAlias('ian-shaw-Z917rgR7'), 'ian-shaw-Z917CSo0')
  })

  test('leaves canonical artist URLs alone', () => {
    assert.equal(getArtistSeoAlias('ian-shaw-Z917CSo0'), null)
  })

  test('redirects the confirmed duplicate Dele Sosimi URL', () => {
    assert.equal(getArtistSeoAlias('dele-sosimi-Z9173d0V'), 'dele-sosimi-Z9173h0f')
  })

  test('redirects the confirmed duplicate Jazzy URL', () => {
    assert.equal(getArtistSeoAlias('jazzy-Z917C4xf'), 'jazzy-Z917hiQ7')
  })

  test('redirects the confirmed duplicate Anvil URL', () => {
    assert.equal(getArtistSeoAlias('anvil-Z917j-5f'), 'anvil-Z917fHc7')
  })

  test('redirects the confirmed duplicate Oliver event URL', () => {
    assert.equal(getEventSeoAlias('oliver-65wuVVPx'), 'oliver-65cVf-xv')
  })

  test('redirects the confirmed duplicate Luanna event URL', () => {
    assert.equal(getEventSeoAlias('luanna-the-big-party-matinee-_1cTkv7s'), 'luanna-the-big-party-matinee-_G1qjwz1')
  })

  test('redirects the confirmed duplicate Bear McCreary event URL', () => {
    assert.equal(getEventSeoAlias('bear-mccreary-GkdvKALl'), 'bear-mccreary-Gkesyv7j')
  })
})
