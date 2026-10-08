import { describe, expect, test } from 'vitest'
import { getArtistSeoAlias } from './seoAliases'

describe('SEO aliases', () => {
  test('redirects the confirmed duplicate Ian Shaw URL', () => {
    expect(getArtistSeoAlias('ian-shaw-Z917rgR7')).toBe('ian-shaw-Z917CSo0')
  })

  test('leaves canonical artist URLs alone', () => {
    expect(getArtistSeoAlias('ian-shaw-Z917CSo0')).toBeNull()
  })

  test('redirects the confirmed duplicate Dele Sosimi URL', () => {
    expect(getArtistSeoAlias('dele-sosimi-Z9173d0V')).toBe('dele-sosimi-Z9173h0f')
  })

  test('redirects the confirmed duplicate Jazzy URL', () => {
    expect(getArtistSeoAlias('jazzy-Z917C4xf')).toBe('jazzy-Z917hiQ7')
  })
})
