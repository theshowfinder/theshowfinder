// Ranking + helpers for artist search and the /artists directory. Pure module
// (no '@/' imports) so it runs under plain `node --test`.

export interface ArtistListRow {
  id: string
  name: string
  slug: string
  image_url: string | null
  genre?: string | null
  upcoming_count: number
  next_date: string | null
  /** Optional line shown instead of the default date count. */
  subtitle?: string
}

// Lowercase, strip accents and punctuation, collapse whitespace:
// "N-Dubz" and "n dubz" and "Beyoncé" / "beyonce" all compare equal-ish.
export function normalizeArtistText(text: string): string {
  return text
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

// Same text with spaces removed, so "ndubz" finds "N-Dubz".
function squash(text: string): string {
  return normalizeArtistText(text).replace(/ /g, '')
}

// Lower is better; null = not a match.
export function artistMatchScore(query: string, name: string): number | null {
  const q = normalizeArtistText(query)
  if (!q) return null
  const n = normalizeArtistText(name)
  if (n === q) return 0
  if (n.startsWith(q + ' ')) return 1
  if (n.startsWith(q)) return 2
  const words = n.split(' ')
  const qWords = q.split(' ')
  if (qWords.every(w => words.some(nw => nw.startsWith(w)))) return 3
  if (n.includes(q)) return 4
  const sq = squash(query)
  if (sq.length >= 3 && squash(name).includes(sq)) return 5
  return null
}

// Best matches first: closer name match, then more upcoming dates, then A-Z.
export function rankArtists<T extends { name: string; upcoming_count: number }>(query: string, rows: T[]): T[] {
  const scored: { row: T; score: number }[] = []
  for (const row of rows) {
    const score = artistMatchScore(query, row.name)
    if (score !== null) scored.push({ row, score })
  }
  scored.sort((a, b) =>
    a.score - b.score ||
    b.row.upcoming_count - a.row.upcoming_count ||
    a.row.name.localeCompare(b.row.name),
  )
  return scored.map(s => s.row)
}

export const DIRECTORY_LETTERS = ['#', ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')]

// Valid ?letter= value: a single A-Z or '#'. Anything else is ignored.
export function parseLetter(value: string | undefined | null): string | null {
  if (!value) return null
  const v = value.trim().toUpperCase()
  return v.length === 1 && DIRECTORY_LETTERS.includes(v) ? v : null
}

export function dateCountLabel(count: number, nextDate: string | null): string {
  const plural = `${count} UK date${count === 1 ? '' : 's'}`
  if (!nextDate) return plural
  const when = new Date(nextDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Europe/London' })
  return `${plural} · next ${when}`
}
