// Server side of festival line-ups (see festivalLineup.ts for the rules):
// read each festival's official line-up page, ask the model for the act names,
// keep only names found word for word on the page, then link each act to the
// festival's ticket listings. Runs daily from /api/cron/festival-lineups.

import { createHash } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { DEFAULT_AI_MODEL } from '@/lib/newsAiSuggestions'
import { htmlToText, buildLineupPrompt, parseLineupReply, actNameKeys, titleMatches, type LineupAct } from '@/lib/festivalLineup'
import { isListingAddon } from '@/lib/listingAddons'
import { slugify } from '@/lib/feedImportRules'

type Db = ReturnType<typeof createAdminClient>

interface SourceRow {
  id: string
  name: string
  title_pattern: string
  lineup_url: string
  last_hash: string | null
  last_found: number | null
}

export interface LineupRunResult {
  source: string
  status: 'unchanged' | 'updated' | 'error'
  acts?: number
  listings?: number
  newLinks?: number
  removedLinks?: number
  createdArtists?: number
  dropped?: string[]
  error?: string
}

const FETCH_TIMEOUT_MS = 20_000
const AI_TIMEOUT_MS = 45_000
const LIVE = ['upcoming', 'on_sale', 'sold_out']

async function fetchPage(url: string): Promise<string> {
  const controller = new AbortController()
  const t = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; TheShowFinder/1.0; +https://www.theshowfinder.com/about)', accept: 'text/html' },
    })
    if (!res.ok) throw new Error(`line-up page returned HTTP ${res.status}`)
    return await res.text()
  } finally {
    clearTimeout(t)
  }
}

async function askModel(festival: string, pageText: string): Promise<string | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set')
  const controller = new AbortController()
  const t = setTimeout(() => controller.abort(), AI_TIMEOUT_MS)
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: controller.signal,
      headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || DEFAULT_AI_MODEL,
        max_tokens: 8000,
        messages: [{ role: 'user', content: buildLineupPrompt(festival, pageText) }],
      }),
    })
    if (!res.ok) throw new Error(`AI request failed (HTTP ${res.status})`)
    const data = (await res.json()) as { content?: { type: string; text?: string }[] }
    return data.content?.find(b => b.type === 'text')?.text ?? null
  } finally {
    clearTimeout(t)
  }
}

function escapeIlike(value: string): string {
  return value.replace(/[\\%_]/g, m => `\\${m}`)
}

// Our existing artist for this act, or a new one. Matching is by name: case,
// accents, punctuation and a leading "The" are ignored. A Ticketmaster artist
// wins over a hand-made one when both exist.
async function resolveArtist(db: Db, act: LineupAct): Promise<{ id: string; created: boolean } | null> {
  const keys = new Set(actNameKeys(act.name))
  const bare = act.name.replace(/^the\s+/i, '')
  const variants = [...new Set([act.name, bare, `The ${bare}`])]
  const { data } = await db
    .from('artists')
    .select('id, name, ticketmaster_id, created_at')
    .or(variants.map(v => `name.ilike.${escapeIlike(v).replace(/[,()]/g, m => `\\${m}`)}`).join(','))
    .limit(20)
  const matches = ((data ?? []) as { id: string; name: string; ticketmaster_id: string | null; created_at: string }[])
    .filter(a => actNameKeys(a.name).some(k => keys.has(k)))
    .sort((a, b) => (a.ticketmaster_id ? 0 : 1) - (b.ticketmaster_id ? 0 : 1) || a.created_at.localeCompare(b.created_at))
  if (matches[0]) return { id: matches[0].id, created: false }

  const slug = `${slugify(act.name) || 'artist'}-${createHash('sha1').update(act.name.toLowerCase()).digest('hex').slice(0, 8)}`
  const { data: inserted, error } = await db.from('artists').insert({ name: act.name, slug }).select('id').single()
  if (!error && inserted) return { id: inserted.id as string, created: true }
  const { data: bySlug } = await db.from('artists').select('id').eq('slug', slug).maybeSingle()
  if (bySlug) return { id: bySlug.id as string, created: false }
  console.error(`[festival-lineups] could not create artist "${act.name}": ${error?.message}`)
  return null
}

async function runSource(db: Db, src: SourceRow, force: boolean): Promise<LineupRunResult> {
  const now = new Date().toISOString()
  const html = await fetchPage(src.lineup_url)
  const text = htmlToText(html)
  const hash = createHash('sha256').update(text).digest('hex')
  if (!force && hash === src.last_hash) {
    await db.from('festival_lineup_sources').update({ last_checked_at: now }).eq('id', src.id)
    return { source: src.name, status: 'unchanged' }
  }

  const { acts, dropped } = parseLineupReply(await askModel(src.name, text), text)
  if (acts.length === 0) throw new Error('no acts found on the line-up page')
  // A page that suddenly lists far fewer acts is more likely broken than a mass cancellation: link new acts, remove nothing.
  const allowRemovals = !src.last_found || acts.length >= src.last_found * 0.6

  const { data: evData, error: evError } = await db
    .from('events')
    .select('id, title')
    .ilike('title', src.title_pattern)
    .gte('start_date', now)
    .in('status', LIVE)
    .limit(200)
  if (evError) throw new Error(evError.message)
  const matching = ((evData ?? []) as { id: string; title: string }[])
    .filter(e => titleMatches(src.title_pattern, e.title) && !isListingAddon(e.title))
  // Festivals also sell day, kids' and early-entry tickets as separate listings. When there is a
  // weekend ticket, link acts to that only, so an artist page shows "Download 2027 - Weekend Arena",
  // not a kids' ticket as well.
  const weekend = matching.filter(e => /weekend/i.test(e.title))
  const listings = weekend.length > 0 ? weekend : matching
  if (listings.length === 0) throw new Error(`no upcoming ticket listings match "${src.title_pattern}"`)
  const eventIds = listings.map(e => e.id)

  const { data: existingData } = await db.from('event_artists').select('event_id, artist_id, source').in('event_id', eventIds)
  const existing = (existingData ?? []) as { event_id: string; artist_id: string; source: string | null }[]
  const have = new Set(existing.map(l => `${l.event_id}:${l.artist_id}`))

  let createdArtists = 0
  const artistIds: string[] = []
  for (const act of acts) {
    const a = await resolveArtist(db, act)
    if (!a) continue
    if (a.created) createdArtists++
    artistIds.push(a.id)
  }

  const rows = []
  for (const eventId of eventIds) {
    for (let i = 0; i < artistIds.length; i++) {
      if (have.has(`${eventId}:${artistIds[i]}`)) continue
      rows.push({ event_id: eventId, artist_id: artistIds[i], is_headliner: false, order: 100 + i, source: 'lineup', created_at: now })
    }
  }
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await db.from('event_artists').upsert(rows.slice(i, i + 500), { onConflict: 'event_id,artist_id', ignoreDuplicates: true })
    if (error) throw new Error(`linking acts failed: ${error.message}`)
  }

  // Acts taken off the line-up page lose their festival link (only links this job made).
  let removedLinks = 0
  if (allowRemovals) {
    const keep = new Set(artistIds)
    const stale = existing.filter(l => l.source === 'lineup' && !keep.has(l.artist_id))
    for (const l of stale) {
      const { error } = await db.from('event_artists').delete().eq('event_id', l.event_id).eq('artist_id', l.artist_id).eq('source', 'lineup')
      if (!error) removedLinks++
    }
  }

  await db.from('festival_lineup_sources').update({
    last_checked_at: now, last_changed_at: now, last_hash: hash, last_found: acts.length, last_linked: artistIds.length, last_error: null,
  }).eq('id', src.id)

  return { source: src.name, status: 'updated', acts: acts.length, listings: listings.length, newLinks: rows.length, removedLinks, createdArtists, dropped: dropped.slice(0, 20) }
}

export async function runFestivalLineups(opts: { force?: boolean; sourceId?: string; deadlineMs?: number } = {}): Promise<LineupRunResult[]> {
  const db = createAdminClient()
  const started = Date.now()
  let q = db
    .from('festival_lineup_sources')
    .select('id, name, title_pattern, lineup_url, last_hash, last_found')
    .eq('active', true)
    .order('last_checked_at', { ascending: true, nullsFirst: true })
  if (opts.sourceId) q = q.eq('id', opts.sourceId)
  const { data, error } = await q
  if (error) throw new Error(`festival_lineup_sources: ${error.message} (has migration 122 been run?)`)

  const results: LineupRunResult[] = []
  for (const src of (data ?? []) as SourceRow[]) {
    if (Date.now() - started > (opts.deadlineMs ?? 45_000)) break // the rest go first next run
    try {
      results.push(await runSource(db, src, !!opts.force))
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error(`[festival-lineups] ${src.name}: ${message}`)
      await db.from('festival_lineup_sources').update({ last_checked_at: new Date().toISOString(), last_error: message.slice(0, 500) }).eq('id', src.id)
      results.push({ source: src.name, status: 'error', error: message })
    }
  }
  return results
}
