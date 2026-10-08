/**
 * Explicit SEO aliases for duplicate records identified in Search Console.
 * Keep this list deliberately small: similarly named artists/events are not
 * automatically interchangeable.
 */
export const ARTIST_SEO_ALIASES: Record<string, string> = {
  'ian-shaw-Z917rgR7': 'ian-shaw-Z917CSo0',
  'dele-sosimi-Z9173d0V': 'dele-sosimi-Z9173h0f',
  'jazzy-Z917C4xf': 'jazzy-Z917hiQ7',
  'anvil-Z917j-5f': 'anvil-Z917fHc7',
}

export function getArtistSeoAlias(slug: string): string | null {
  return ARTIST_SEO_ALIASES[slug] ?? null
}
