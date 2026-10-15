// MusicBrainz (open music database, CC0 data) -> genre, links and a short factual
// line for an artist page. Pure module (no '@/' imports) so it runs under plain
// `node --test`. We only ever look an artist up by the MusicBrainz id that
// Ticketmaster itself lists for that attraction, never by guessing from the
// name, so a namesake can't get the wrong act's details.

import { safeHttpsUrl, type ArtistSocialLinks } from './artistEnrich.ts'

export { mbidFromLink } from './artistEnrich.ts'

export interface MusicBrainzProfile {
  type: string | null
  place: string | null
  formedYear: number | null
  ended: boolean
  genres: string[]
  wikipediaUrl: string | null
  website: string | null
  social: ArtistSocialLinks
}

type Rel = { type?: string; url?: { resource?: string } }

function hostOf(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, '') } catch { return '' }
}

export function parseMusicBrainzArtist(json: unknown): MusicBrainzProfile {
  const a = (json ?? {}) as {
    type?: string
    area?: { name?: string }
    ['begin-area']?: { name?: string }
    ['life-span']?: { begin?: string; ended?: boolean }
    genres?: Array<{ name?: string; count?: number }>
    relations?: Rel[]
  }
  const genres = (a.genres ?? [])
    .filter(g => typeof g.name === 'string' && g.name.trim())
    .sort((x, y) => (y.count ?? 0) - (x.count ?? 0))
    .slice(0, 2)
    .map(g => g.name!.trim().toLowerCase())

  const begin = a['life-span']?.begin
  const year = begin && /^\d{4}/.test(begin) ? Number(begin.slice(0, 4)) : null

  let wikipediaUrl: string | null = null
  let website: string | null = null
  const social: ArtistSocialLinks = {}
  for (const rel of a.relations ?? []) {
    const url = safeHttpsUrl(rel.url?.resource)
    if (!url) continue
    const host = hostOf(url)
    if (rel.type === 'wikipedia' && /^[a-z]+\.wikipedia\.org$/.test(host) && !wikipediaUrl) wikipediaUrl = url
    else if (rel.type === 'official homepage' && !website) website = url
    else if (host === 'instagram.com' && !social.instagram) social.instagram = url
    else if ((host === 'twitter.com' || host === 'x.com') && !social.twitter) social.twitter = url
    else if (host === 'facebook.com' && !social.facebook) social.facebook = url
    else if (host === 'youtube.com' && !social.youtube) social.youtube = url
    else if (host === 'open.spotify.com' && !social.spotify) social.spotify = url
  }

  return {
    type: a.type ?? null,
    place: a['begin-area']?.name?.trim() || a.area?.name?.trim() || null,
    formedYear: year,
    ended: a['life-span']?.ended === true,
    genres,
    wikipediaUrl,
    website,
    social,
  }
}

export function titleCaseGenre(genre: string): string {
  return genre.replace(/\b[a-z]/g, c => c.toUpperCase()).replace(/\bUk\b/g, 'UK')
}

function article(word: string): 'a' | 'an' {
  if (/^(uk|uni|use|eu|one)/i.test(word)) return 'a'
  return /^[aeiou]/i.test(word) ? 'an' : 'a'
}

const NOUNS: Record<string, string> = { Group: 'group', Person: 'artist', Orchestra: 'orchestra', Choir: 'choir' }

// A short factual sentence, or null when we would be guessing. Persons never get
// their birth year (MusicBrainz stores it as the life-span start); groups get the
// year formed. Ended acts are skipped so we never say "is" about someone who has died.
export function buildMusicBrainzBio(name: string, p: MusicBrainzProfile): string | null {
  const noun = p.type ? NOUNS[p.type] : undefined
  if (!noun || p.ended) return null
  if (!p.genres.length && !p.place) return null
  const genrePhrase = p.genres.length ? `${p.genres.join(' and ')} ` : ''
  const lead = `${genrePhrase}${noun}`
  const formed = p.type !== 'Person' && p.formedYear ? `, formed in ${p.formedYear}` : ''
  return `${name} is ${article(lead)} ${lead}${p.place ? ` from ${p.place}` : ''}${formed}.`
}
