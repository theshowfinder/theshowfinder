// "Saved shows" kept in the visitor's browser (no account needed). Only event
// slugs are stored; the /saved page looks the details up. Pure module (no '@/'
// imports) so it runs under `node --test`.

export const SAVED_STORAGE_KEY = 'tsf_saved_v1'
export const MAX_SAVED = 200

// Slugs are letters, digits, hyphens and underscores. Mixed case matters: event
// slugs end in a Ticketmaster-style id (e.g. "mogwai-Gkdm1EmH"), so a
// lowercase-only check silently rejected almost every real event.
const SLUG_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,159}$/

export function isValidSlug(value: unknown): value is string {
  return typeof value === 'string' && SLUG_RE.test(value)
}

// Never throws: anything unreadable is treated as "nothing saved".
export function parseSaved(raw: string | null | undefined): string[] {
  if (!raw) return []
  let data: unknown
  try { data = JSON.parse(raw) } catch { return [] }
  if (!Array.isArray(data)) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const item of data) {
    if (isValidSlug(item) && !seen.has(item)) {
      seen.add(item)
      out.push(item)
    }
    if (out.length >= MAX_SAVED) break
  }
  return out
}

export function serializeSaved(slugs: string[]): string {
  return JSON.stringify(slugs.filter(isValidSlug).slice(0, MAX_SAVED))
}

// Adds to the front (newest first) or removes if already saved.
export function toggleSaved(slugs: string[], slug: string): string[] {
  if (!isValidSlug(slug)) return slugs
  if (slugs.includes(slug)) return slugs.filter(s => s !== slug)
  return [slug, ...slugs].slice(0, MAX_SAVED)
}

export function removeSaved(slugs: string[], slug: string): string[] {
  return slugs.filter(s => s !== slug)
}
