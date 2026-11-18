import test from 'node:test'
import assert from 'node:assert/strict'
import { CITY_GENRES, genreBySlug, genreForArtistGenre } from './cityGenreSeo.ts'
import { CITY_TYPES, cityTypeTitle } from './cityTypeSeo.ts'

test('genre slugs are unique and never clash with type pages', () => {
  const slugs = CITY_GENRES.map(g => g.slug)
  assert.equal(new Set(slugs).size, slugs.length)
  for (const s of slugs) assert.equal(CITY_TYPES.some(t => t.slug === s), false)
  assert.ok(CITY_GENRES.every(g => g.category === 'concert'))
})

test('artist genres map to pages', () => {
  assert.equal(genreForArtistGenre('Hip-Hop/Rap')?.slug, 'hip-hop-gigs')
  assert.equal(genreForArtistGenre('blues')?.slug, 'jazz')
  assert.equal(genreForArtistGenre('Hockey'), undefined)
  assert.equal(genreForArtistGenre(null), undefined)
  assert.equal(cityTypeTitle('Leeds', genreBySlug('metal-gigs')!), 'Metal Gigs in Leeds: Dates & Tickets')
})
