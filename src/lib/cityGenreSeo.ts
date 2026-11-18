// Music genre pages within concerts: /cities/Manchester/rock-gigs, /cities/London/jazz, /cities/Leeds/metal-gigs.
// People search by genre ("metal gigs manchester", "jazz london", "folk music leeds"). A listing's genre
// comes from its artists (Ticketmaster classification, then MusicBrainz), so roughly half of concerts have
// one; a page only goes to search engines once it has MIN_INDEXABLE shows, the same rule as type pages.
// Each genre is a CityType (category 'concert') so the type-page wording, FAQs and layout all apply.
// Pure module (no '@/' imports) for node --test.
import type { CityType } from './cityTypeSeo.ts'

export interface CityGenre extends CityType { genres: string[] }

export const CITY_GENRES: CityGenre[] = [
  { slug: 'rock-gigs',          genres: ['Rock', 'Yacht Rock'],     label: 'Rock Gigs',                plural: 'rock gigs',                  singular: 'rock gig',       emoji: '🎸' },
  { slug: 'pop-concerts',       genres: ['Pop'],                    label: 'Pop Concerts',             plural: 'pop concerts',               singular: 'pop concert',    emoji: '🎤' },
  { slug: 'indie-gigs',         genres: ['Alternative'],            label: 'Indie & Alternative Gigs', plural: 'indie and alternative gigs', singular: 'indie gig',      emoji: '🎧' },
  { slug: 'dance-music',        genres: ['Dance/Electronic', 'Dance'], label: 'Dance & Electronic',    plural: 'dance and electronic events', singular: 'dance event',  emoji: '🪩' },
  { slug: 'metal-gigs',         genres: ['Metal', 'Metalcore'],     label: 'Metal Gigs',               plural: 'metal gigs',                 singular: 'metal gig',      emoji: '🤘' },
  { slug: 'folk-music',         genres: ['Folk'],                   label: 'Folk Music',               plural: 'folk gigs',                  singular: 'folk gig',       emoji: '🪕' },
  { slug: 'hip-hop-gigs',       genres: ['Hip-Hop/Rap'],            label: 'Hip-Hop & Rap Gigs',       plural: 'hip-hop and rap gigs',       singular: 'hip-hop gig',    emoji: '🎙️' },
  { slug: 'rnb-soul',           genres: ['R&B'],                    label: 'R&B & Soul',               plural: 'R&B and soul gigs',          singular: 'R&B gig',        emoji: '💜' },
  { slug: 'country-music',      genres: ['Country'],                label: 'Country Music',            plural: 'country gigs',               singular: 'country gig',    emoji: '🤠' },
  { slug: 'jazz',               genres: ['Jazz', 'Blues'],          label: 'Jazz & Blues',             plural: 'jazz and blues gigs',        singular: 'jazz gig',       emoji: '🎷' },
  { slug: 'classical-concerts', genres: ['Classical'],              label: 'Classical Concerts',       plural: 'classical concerts',         singular: 'concert',        emoji: '🎻' },
  { slug: 'reggae-gigs',        genres: ['Reggae'],                 label: 'Reggae Gigs',              plural: 'reggae gigs',                singular: 'reggae gig',     emoji: '🇯🇲' },
].map(g => ({ ...g, category: 'concert' }))

export function genreBySlug(slug: string): CityGenre | undefined {
  return CITY_GENRES.find(g => g.slug === slug.toLowerCase())
}

/** The genre page an artist genre belongs to ("Hip-Hop/Rap" → hip-hop-gigs), if any. */
export function genreForArtistGenre(genre: string | null | undefined): CityGenre | undefined {
  if (!genre) return undefined
  const g = genre.trim().toLowerCase()
  return CITY_GENRES.find(x => x.genres.some(n => n.toLowerCase() === g))
}
