// Server-side enrichment of ONE artist: genre, official links and (when
// Ticketmaster links a Wikipedia page) a short bio. Shared by the nightly
// enrich-artists job and the artist page itself (which enriches an artist the
// first time anyone opens it). Never overwrites a bio, genre or website that is
// already set.
import { createAdminClient } from '@/lib/supabase/admin'
import { parseAttractionProfile, wikiTitleFromUrl, cleanWikiExtract } from '@/lib/artistEnrich'

const TM_BASE = 'https://app.ticketmaster.com/discovery/v2'
const UA = 'TheShowFinder/1.0 (https://www.theshowfinder.com; hello@theshowfinder.com)'

export type EnrichableArtist = {
  id: string
  ticketmaster_id: string | null
  bio: string | null
  genre: string | null
  website: string | null
  enriched_at?: string | null
}

export type EnrichOutcome = 'enriched' | 'rate_limited' | 'skipped' | 'error' | 'missing_columns'

async function fetchWikiSummary(wikiUrl: string): Promise<{ text: string | null; url: string | null }> {
  const parsed = wikiTitleFromUrl(wikiUrl)
  if (!parsed) return { text: null, url: null }
  try {
    const res = await fetch(
      `https://${parsed.lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(parsed.title.replace(/ /g, '_'))}`,
      { headers: { 'User-Agent': UA, Accept: 'application/json' }, cache: 'no-store' },
    )
    if (!res.ok) return { text: null, url: null }
    const json = await res.json() as { extract?: unknown; type?: unknown; content_urls?: { desktop?: { page?: string } } }
    return { text: cleanWikiExtract(json.extract, json.type), url: json.content_urls?.desktop?.page ?? wikiUrl }
  } catch {
    return { text: null, url: null }
  }
}

export async function enrichArtist(
  db: ReturnType<typeof createAdminClient>,
  artist: EnrichableArtist,
  counters?: { withBio: number; withGenre: number },
): Promise<EnrichOutcome> {
  if (!artist.ticketmaster_id || artist.enriched_at) return 'skipped'
  try {
    const res = await fetch(
      `${TM_BASE}/attractions/${encodeURIComponent(artist.ticketmaster_id)}.json?apikey=${process.env.TICKETMASTER_API_KEY}&locale=*`,
      { cache: 'no-store' },
    )
    if (res.status === 429) return 'rate_limited'          // try again next time
    const profile = res.ok ? parseAttractionProfile(await res.json()) : null

    const update: Record<string, unknown> = { enriched_at: new Date().toISOString() }
    if (profile) {
      if (profile.genre && !artist.genre) { update.genre = profile.genre; if (counters) counters.withGenre++ }
      if (profile.website && !artist.website) update.website = profile.website
      if (Object.keys(profile.social).length) update.social_links = profile.social
      if (profile.wikipediaUrl) {
        update.wikipedia_url = profile.wikipediaUrl
        if (!artist.bio) {
          const wiki = await fetchWikiSummary(profile.wikipediaUrl)
          if (wiki.text) {
            update.bio = wiki.text
            update.bio_source = 'wikipedia'
            update.wikipedia_url = wiki.url ?? profile.wikipediaUrl
            if (counters) counters.withBio++
          }
        }
      }
    }
    const { error } = await db.from('artists').update(update).eq('id', artist.id)
    if (error) return /column .* does not exist/i.test(error.message) ? 'missing_columns' : 'error'
    return 'enriched'
  } catch {
    return 'error'
  }
}
