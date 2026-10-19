import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { ENRICH_UA, fetchWikiSummary } from '@/lib/artistEnrichRun'
import { parseMusicBrainzArtist, buildMusicBrainzBio, titleCaseGenre } from '@/lib/musicbrainz'
import type { ArtistSocialLinks } from '@/lib/artistEnrich'
import { withJobRun } from '@/lib/jobRuns'

// Second enrichment pass using MusicBrainz (open data, no key). Looks an artist
// up ONLY by the MusicBrainz id Ticketmaster listed for it (captured by
// enrich-artists), then fills genre, website, social links and, when there is
// still no bio, a short factual line (or the Wikipedia summary MusicBrainz links).
// Never overwrites existing values. MusicBrainz allows ~1 request/second, so a
// run handles a few hundred artists. Add ?limit=N to change the batch size.
export const maxDuration = 300
export const dynamic     = 'force-dynamic'

const DEFAULT_PER_RUN = 180
const GAP_MS          = 1100
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

type Row = {
  id: string; name: string; musicbrainz_id: string
  bio: string | null; genre: string | null; website: string | null
  wikipedia_url: string | null; social_links: ArtistSocialLinks | null
}

async function handleGet(request: Request) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const started = Date.now()
  const deadline = started + 250_000
  const requested = Number(new URL(request.url).searchParams.get('limit'))
  const maxPerRun = Number.isFinite(requested) && requested > 0 ? Math.min(requested, 220) : DEFAULT_PER_RUN
  const db = createAdminClient()

  const { data: busiest, error: viewErr } = await db
    .from('artists_with_upcoming').select('id')
    .order('upcoming_count', { ascending: false })
    .limit(6000) as unknown as { data: { id: string }[] | null; error: { message: string } | null }
  if (viewErr) return NextResponse.json({ success: false, error: viewErr.message }, { status: 500 })

  const todo: Row[] = []
  const ids = (busiest ?? []).map(r => r.id)
  for (let i = 0; i < ids.length && todo.length < maxPerRun; i += 200) {
    const { data, error } = await db
      .from('artists')
      .select('id, name, musicbrainz_id, bio, genre, website, wikipedia_url, social_links')
      .in('id', ids.slice(i, i + 200))
      .is('musicbrainz_checked_at', null)
      .not('musicbrainz_id', 'is', null) as unknown as { data: Row[] | null; error: { message: string } | null }
    if (error) {
      return NextResponse.json({ success: false, error: `${error.message} (run migration 053)` }, { status: 500 })
    }
    const byId = new Map((data ?? []).map(a => [a.id, a]))
    for (const id of ids.slice(i, i + 200)) {
      const a = byId.get(id)
      if (a && todo.length < maxPerRun) todo.push(a)
    }
  }

  const tally = { looked_up: 0, not_found: 0, errors: 0, withGenre: 0, withBio: 0, throttled: 0 }
  for (const a of todo) {
    if (Date.now() > deadline) break
    try {
      const res = await fetch(
        `https://musicbrainz.org/ws/2/artist/${a.musicbrainz_id}?inc=genres+url-rels&fmt=json`,
        { headers: { 'User-Agent': ENRICH_UA, Accept: 'application/json' }, cache: 'no-store' },
      )
      if (res.status === 503 || res.status === 429) { tally.throttled++; await sleep(5000); continue } // retry next run
      const checked = new Date().toISOString()
      if (res.status === 404) {
        tally.not_found++
        await db.from('artists').update({ musicbrainz_checked_at: checked }).eq('id', a.id)
      } else if (!res.ok) {
        tally.errors++
      } else {
        const p = parseMusicBrainzArtist(await res.json())
        const update: Record<string, unknown> = { musicbrainz_checked_at: checked }
        if (!a.genre && p.genres[0]) { update.genre = titleCaseGenre(p.genres[0]); tally.withGenre++ }
        if (!a.website && p.website) update.website = p.website
        const mergedSocial = { ...p.social, ...(a.social_links ?? {}) }   // existing links win
        if (Object.keys(mergedSocial).length) update.social_links = mergedSocial
        if (!a.wikipedia_url && p.wikipediaUrl) update.wikipedia_url = p.wikipediaUrl
        if (!a.bio) {
          let bio: string | null = null
          let source = 'musicbrainz'
          if (p.wikipediaUrl) {
            const wiki = await fetchWikiSummary(p.wikipediaUrl)
            if (wiki.text) { bio = wiki.text; source = 'wikipedia'; update.wikipedia_url = wiki.url ?? p.wikipediaUrl }
          }
          if (!bio) bio = buildMusicBrainzBio(a.name, p)
          if (bio) { update.bio = bio; update.bio_source = source; tally.withBio++ }
        }
        const { error } = await db.from('artists').update(update).eq('id', a.id)
        if (error) tally.errors++; else tally.looked_up++
      }
    } catch {
      tally.errors++
    }
    await sleep(GAP_MS)
  }

  return NextResponse.json({
    success: true, candidates: todo.length, ...tally,
    note: todo.length >= maxPerRun ? 'Batch limit reached: run again (or wait for tomorrow) to continue.' : undefined,
    seconds: Math.round((Date.now() - started) / 1000),
  })
}

export const GET = withJobRun('enrich-musicbrainz', handleGet)
