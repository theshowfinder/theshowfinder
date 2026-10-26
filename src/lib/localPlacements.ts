// Paid local business placements (migration 091). Featured businesses appear in a
// "Before the show" box on every show page in their city; standard ones only in the
// city's local guide. Pure helpers here, so the rotation rules are testable.

export interface Placement {
  id: string
  city: string
  name: string
  category: string
  description: string | null
  website_url: string | null
  logo_url: string | null
  address: string | null
  postcode: string | null
  package: 'standard' | 'featured'
}

export const PLACEMENT_COLUMNS = 'id, city, name, category, description, website_url, logo_url, address, postcode, package'

/** How many featured businesses one show page shows. */
export const PER_PAGE = 3

const CATEGORY_LABEL: Record<string, string> = {
  restaurant: 'Restaurant', bar: 'Bar', cafe: 'Café', hotel: 'Hotel', transport: 'Transport',
  parking: 'Parking', beauty: 'Beauty', shop: 'Shop', attraction: 'Things to do', other: 'Local business',
}
export const categoryLabel = (category: string) => CATEGORY_LABEL[category] ?? 'Local business'

function hash(value: string): number {
  let h = 2166136261
  for (let i = 0; i < value.length; i++) { h ^= value.charCodeAt(i); h = Math.imul(h, 16777619) }
  return h >>> 0
}

/**
 * Picks up to `max` featured businesses for one show page. Each page gets a stable starting
 * point from its own id, so with more featured businesses than slots they all get an even
 * share of pages, and a page never reshuffles between visits.
 */
export function pickForPage(featured: readonly Placement[], pageKey: string, max = PER_PAGE): Placement[] {
  const list = [...featured].sort((a, b) => a.id.localeCompare(b.id))
  if (list.length <= max) return list
  const start = hash(pageKey) % list.length
  return Array.from({ length: max }, (_, i) => list[(start + i) % list.length])
}

/** A website link we can safely show (http/https only). */
export function safeWebsite(url: string | null): string | null {
  if (!url) return null
  try {
    const u = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`)
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : null
  } catch { return null }
}
