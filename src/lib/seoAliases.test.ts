import { describe, expect, test } from 'vitest'
import { getArtistSeoAlias, getEventSeoAlias } from './seoAliases'

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

  test('redirects the confirmed duplicate Anvil URL', () => {
    expect(getArtistSeoAlias('anvil-Z917j-5f')).toBe('anvil-Z917fHc7')
  })

  test('redirects the confirmed duplicate Oliver event URL', () => {
    expect(getEventSeoAlias('oliver-65wuVVPx')).toBe('oliver-65cVf-xv')
  })

  test('redirects the confirmed duplicate Christopher Hall event URL', () => {
    expect(getEventSeoAlias('christopher-hall-pizazz-bzCWBJBs')).toBe('christopher-hall-pizazz-dZZIuidJ')
  })

  test('redirects the confirmed duplicate Luanna event URL', () => {
    expect(getEventSeoAlias('luanna-the-big-party-matinee-_1cTkv7s')).toBe('luanna-the-big-party-matinee-_G1qjwz1')
  })

  test('redirects the confirmed duplicate Bear McCreary event URL', () => {
    expect(getEventSeoAlias('bear-mccreary-GkdvKALl')).toBe('bear-mccreary-Gkesyv7j')
  })
})
