import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { parseAttractionProfile, wikiTitleFromUrl, cleanWikiExtract } from '@/lib/artistEnrich'

// Fills in artist profile info (genre, official links, a short Wikipedia-sourced
// bio) a batch at a time, busiest artists first. Each run handles up to
// MAX_PER_RUN artists that have not been enriched yet; the bio only comes from
// the Wikipedia page Ticketmaster links for that artist. Never overwrites a
// bio, genre or website already set (e.g. by hand in the admin).
export const maxDuration = 300
export const dynamic     = 'force-dynamic'

const MAX_PER_RUN = 150
const TM_BASE     = 'https://app.ticketmaster.com/discovery/v2'
const UA          = 'TheShowFinder/1.0 (https://www.theshowfinder.com; hello@theshowfinder.com)'
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

type ArtistRow = {
  id: string; name: string; ticketmaster_id: string | null
  bio: string | null; genre: string | null; website: string | null
}

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

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const started = Date.now()
  const deadline = started + 240_000
  const db = createAdminClient()

  // Busiest artists first (those are the pages people land on).
  const { data: busiest, error: viewErr } = await db
    .from('artists_with_upcoming').select('id')
    .order('upcoming_count', { ascending: false })
    .limit(3000) as unknown as { data: { id: string }[] | null; error: { message: string } | null }
  if (viewErr) {
    return NextResponse.json({ success: false, error: `artists_with_upcoming: ${viewErr.message} (run migration 052)` }, { status: 500 })
  }

  const todo: ArtistRow[] = []
  const ids = (busiest ?? []).map(r => r.id)
  for (let i = 0; i < ids.length && todo.length < MAX_PER_RUN; i += 200) {
    const { data, error } = await db
      .from('artists')
      .select('id, name, ticketmaster_id, bio, genre, website')
      .in('id', ids.slice(i, i + 200))
      .is('enriched_at', null)
      .not('ticketmaster_id', 'is', null) as unknown as { data: ArtistRow[] | null; error: { message: string } | null }
    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    // keep the busiest-first order within the chunk
    const byId = new Map((data ?? []).map(a => [a.id, a]))
    for (const id of ids.slice(i, i + 200)) {
      const a = byId.get(id)
      if (a && todo.length < MAX_PER_RUN) todo.push(a)
    }
  }

  let enriched = 0, withBio = 0, withGenre = 0, failed = 0
  for (const artist of todo) {
    if (Date.now() > deadline) break
    try {
      const res = await fetch(
        `${TM_BASE}/attractions/${encodeURIComponent(artist.ticketmaster_id!)}.json?apikey=${process.env.TICKETMASTER_API_KEY}&locale=*`,
        { cache: 'no-store' },
      )
      if (res.status === 429) { await sleep(2000); failed++; continue }   // leave for the next run
      const profile = res.ok ? parseAttractionProfile(await res.json()) : null

      const update: Record<string, unknown> = { enriched_at: new Date().toISOString() }
      if (profile) {
        if (profile.genre && !artist.genre) { update.genre = profile.genre; withGenre++ }
        if (profile.website && !artist.website) update.website = profile.website
        if (Object.keys(profile.social).length) update.social_links = profile.social
        if (profile.wikipediaUrl) {
          update.wikipedia_url = profile.wikipediaUrl
          if (!artist.bio) {
            const wiki = await fetchWikiSummary(profile.wikipediaUrl)
            if (wiki.text) { update.bio = wiki.text; update.bio_source = 'wikipedia'; update.wikipedia_url = wiki.url ?? profile.wikipediaUrl; withBio++ }
          }
        }
      }
      const { error } = await db.from('artists').update(update).eq('id', artist.id)
      if (error) { failed++; if (/column .* does not exist/i.test(error.message)) return NextResponse.json({ success: false, error: `${error.message} (run migration 052)` }, { status: 500 }) }
      else enriched++
    } catch {
      failed++
    }
    await sleep(350)
  }

  return NextResponse.json({
    success: true, candidates: todo.length, enriched, withBio, withGenre, failed,
    seconds: Math.round((Date.now() - started) / 1000),
  })
}
