import { describe, expect, test } from 'vitest'
import { getArtistSeoAlias } from './seoAliases'

describe('SEO aliases', () => {
  test('redirects the confirmed duplicate Ian Shaw URL', () => {
    expect(getArtistSeoAlias('ian-shaw-Z917rgR7')).toBe('ian-shaw-Z917CSo0')
  })

  test('leaves canonical artist URLs alone', () => {
    expect(getArtistSeoAlias('ian-shaw-Z917CSo0')).toBeNull()
  })
})
