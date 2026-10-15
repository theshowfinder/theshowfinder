// Turns Ticketmaster attraction data + a Wikipedia summary into the genre,
// links and short bio shown on an artist page. Pure module (no '@/' imports)
// so it runs under plain `node --test`. A bio is only ever taken from the
// Wikipedia page Ticketmaster itself links for that attraction, so we never
// guess a page from the name and attach the wrong person's biography.

export interface ArtistSocialLinks {
  spotify?: string
  youtube?: string
  instagram?: string
  twitter?: string
  facebook?: string
}

export interface AttractionProfile {
  genre: string | null
  website: string | null
  wikipediaUrl: string | null
  social: ArtistSocialLinks
}

type LinkList = Array<{ url?: unknown }> | undefined

// Only plain https URLs are kept (no javascript:, no data:, no http).
export function safeHttpsUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null
  try {
    const u = new URL(value.trim())
    return u.protocol === 'https:' && u.hostname.includes('.') ? u.toString() : null
  } catch {
    return null
  }
}

function firstUrl(list: LinkList): string | null {
  for (const item of list ?? []) {
    const url = safeHttpsUrl(item?.url)
    if (url) return url
  }
  return null
}

// Ticketmaster uses these as "no genre" placeholders.
const GENRE_PLACEHOLDERS = new Set(['undefined', 'other', 'miscellaneous', 'music', 'unknown'])

export function parseAttractionProfile(attraction: unknown): AttractionProfile {
  const a = (attraction ?? {}) as {
    classifications?: Array<{ genre?: { name?: string }; subGenre?: { name?: string } }>
    externalLinks?: Record<string, LinkList>
  }
  const cls = a.classifications?.[0]
  const pick = (n: string | undefined) => (n && !GENRE_PLACEHOLDERS.has(n.trim().toLowerCase()) ? n.trim() : null)
  const genre = pick(cls?.genre?.name) ?? pick(cls?.subGenre?.name)

  const links = a.externalLinks ?? {}
  const social: ArtistSocialLinks = {}
  const spotify = firstUrl(links.spotify);     if (spotify)   social.spotify = spotify
  const youtube = firstUrl(links.youtube);     if (youtube)   social.youtube = youtube
  const instagram = firstUrl(links.instagram); if (instagram) social.instagram = instagram
  const twitter = firstUrl(links.twitter);     if (twitter)   social.twitter = twitter
  const facebook = firstUrl(links.facebook);   if (facebook)  social.facebook = facebook

  const wiki = firstUrl(links.wiki)
  return {
    genre,
    website: firstUrl(links.homepage),
    wikipediaUrl: wiki && /^https:\/\/([a-z]+\.)?wikipedia\.org\/wiki\//.test(wiki) ? wiki : null,
    social,
  }
}

// https://en.wikipedia.org/wiki/N-Dubz -> "N-Dubz" (decoded, underscores to spaces).
export function wikiTitleFromUrl(url: string): { lang: string; title: string } | null {
  const m = url.match(/^https:\/\/([a-z]+)\.wikipedia\.org\/wiki\/([^?#]+)/)
  if (!m) return null
  try {
    return { lang: m[1], title: decodeURIComponent(m[2]).replace(/_/g, ' ') }
  } catch {
    return null
  }
}

// Short, sentence-aligned bio from a Wikipedia summary extract: at most
// `maxChars`, at least the first sentence. Returns null when there is no usable
// text (empty, or a disambiguation page).
export function cleanWikiExtract(extract: unknown, type?: unknown, maxChars = 480): string | null {
  if (typeof extract !== 'string') return null
  if (type !== undefined && type !== 'standard') return null
  const text = extract.replace(/\s+/g, ' ').trim()
  if (text.length < 40) return null
  const sentences = text.split(/(?<=[.!?])\s+(?=[A-Z"'(])/)
  let out = ''
  for (const s of sentences) {
    if (out && (out + ' ' + s).length > maxChars) break
    out = out ? `${out} ${s}` : s
  }
  if (out.length > maxChars + 120) out = out.slice(0, maxChars).replace(/\s+\S*$/, '') + '…'
  return out
}
