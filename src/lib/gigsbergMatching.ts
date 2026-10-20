import { createAdminClient } from '@/lib/supabase/admin'
import { fetchAllPages, fetchAllPagesParallel } from '@/lib/pagedFetch'
import {
  bucketEventsByDate,
  dateOnly,
  decideMatch,
  hasTitleEvidence,
  type CatalogueRow,
  type ShowfinderEvent,
} from '@/lib/gigsbergMatchScoring'

export interface GigsbergMatchResult {
  checked: number
  autoMatched: number
  review: number
  noMatch: number
  errors: number
  // true when the time budget ran out before every row was processed. Rows
  // not reached keep their previous status and are picked up by the next run.
  incomplete?: boolean
  timings?: { loadMs: number; matchMs: number; catalogueRows: number; events: number }
}

const MATCH_RETRY_AFTER_MS = 24 * 60 * 60 * 1000
const CATALOGUE_COLUMNS = 'id, name, event_date, venue, city, performer1, performer2, url, matched_event_id, match_checked_at'
// Supabase writes are network-bound; small concurrent batches finish a full
// catalogue quickly without overwhelming the database.
const WRITE_BATCH_SIZE = 50
// The routes that call this allow 300s. Stop cleanly well before that rather
// than letting the platform kill the request with a 504.
const DEFAULT_BUDGET_MS = 240_000
const ARTIST_LOOKUP_CHUNK = 200

type Db = ReturnType<typeof createAdminClient>
type PageResult<T> = { data: T[] | null; error: { message: string } | null }

async function loadCatalogue(db: Db, fullRescan: boolean): Promise<CatalogueRow[]> {
  const retryBefore = new Date(Date.now() - MATCH_RETRY_AFTER_MS).toISOString()
  // PostgREST caps every request at 1000 rows whatever .limit() says, so each
  // query is paged with range() and a stable order — the old .limit(50000)
  // silently saw only the first 1000 rows.
  const base = () => db.from('gigsberg_catalogue_events').select(CATALOGUE_COLUMNS).is('gone_at', null)
  const pageOf = (apply: (query: ReturnType<typeof base>) => ReturnType<typeof base>) =>
    fetchAllPages<CatalogueRow>((from, to) =>
      apply(base()).order('id', { ascending: true }).range(from, to) as unknown as PromiseLike<PageResult<CatalogueRow>>,
    )

  if (fullRescan) {
    // Unresolved rows first so a run that hits the time budget has still
    // handled the rows that matter most.
    const [unresolved, matched] = await Promise.all([
      pageOf(query => query.in('match_status', ['pending', 'review', 'no_match'])),
      pageOf(query => query.eq('match_status', 'auto_matched')),
    ])
    return [...unresolved, ...matched]
  }
  // Match new rows, plus unresolved rows not checked in the last day.
  // Already auto-matched or recently reviewed rows are stable and are not
  // loaded, scored, and written again on every run.
  const [pending, retry] = await Promise.all([
    pageOf(query => query.eq('match_status', 'pending')),
    pageOf(query => query.in('match_status', ['review', 'no_match']).or(`match_checked_at.is.null,match_checked_at.lt.${retryBefore}`)),
  ])
  return [...pending, ...retry]
}

// Events are loaded without their linked artists (a nested join over ~28,000
// events is what made the first version too slow). Linked artists are
// fetched later, only for the few events that could actually match.
async function loadUpcomingEvents(db: Db): Promise<ShowfinderEvent[]> {
  const now = new Date().toISOString()
  const { count, error: countError } = await db.from('events').select('id', { count: 'exact', head: true }).gte('start_date', now)
  if (countError) throw new Error(countError.message)
  const rows = await fetchAllPagesParallel<Omit<ShowfinderEvent, 'artists'>>(
    count ?? 0,
    (from, to) => db
      .from('events')
      .select('id, title, start_date, gigsberg_affiliate_url, venue:venues(name, city)')
      .gte('start_date', now)
      .order('id', { ascending: true })
      .range(from, to) as unknown as PromiseLike<PageResult<Omit<ShowfinderEvent, 'artists'>>>,
  )
  return rows.map(row => ({ ...row, artists: [] }))
}

async function attachLinkedArtists(db: Db, events: ShowfinderEvent[], loaded: Set<string>) {
  const ids = events.map(event => event.id).filter(id => !loaded.has(id))
  if (!ids.length) return
  const byEvent = new Map<string, ShowfinderEvent['artists']>()
  for (let index = 0; index < ids.length; index += ARTIST_LOOKUP_CHUNK) {
    const chunk = ids.slice(index, index + ARTIST_LOOKUP_CHUNK)
    const { data, error } = await db
      .from('event_artists')
      .select('event_id, artist:artists(name)')
      .in('event_id', chunk) as unknown as { data: { event_id: string; artist: { name: string } | null }[] | null; error: { message: string } | null }
    if (error) throw new Error(error.message)
    for (const row of data ?? []) {
      const list = byEvent.get(row.event_id) ?? []
      list.push({ artist: row.artist })
      byEvent.set(row.event_id, list)
    }
  }
  for (const event of events) {
    if (loaded.has(event.id)) continue
    event.artists = byEvent.get(event.id) ?? []
    loaded.add(event.id)
  }
}

/**
 * Match only new rows and unresolved rows that have not been checked in the
 * last day. Pass fullRescan when the matching rules themselves have changed.
 */
export async function matchGigsbergCatalogue(
  fullRescan = false,
  options: { budgetMs?: number } = {},
): Promise<GigsbergMatchResult> {
  const started = Date.now()
  const deadline = started + (options.budgetMs ?? DEFAULT_BUDGET_MS)
  const db = createAdminClient()
  const [catalogue, events] = await Promise.all([loadCatalogue(db, fullRescan), loadUpcomingEvents(db)])
  const eventsByDate = bucketEventsByDate(events)
  const loadMs = Date.now() - started
  console.log(`[gigsberg-match] loaded ${catalogue.length} catalogue rows and ${events.length} events in ${loadMs}ms`)

  const result: GigsbergMatchResult = { checked: 0, autoMatched: 0, review: 0, noMatch: 0, errors: 0 }
  const artistsLoaded = new Set<string>()

  async function processItem(item: CatalogueRow, candidates: ShowfinderEvent[]) {
    const decision = decideMatch(item, candidates)

    const { error } = await db.from('gigsberg_catalogue_events').update({
      matched_event_id: decision.event?.id ?? null,
      match_status: decision.status,
      match_confidence: decision.confidence,
      match_reason: decision.reason,
      match_checked_at: new Date().toISOString(),
    }).eq('id', item.id)
    if (error) return { errors: 1, autoMatched: 0, review: 0, noMatch: 0 }

    if (decision.event) {
      const { error: linkError } = await db.from('events').update({ gigsberg_affiliate_url: item.url }).eq('id', decision.event.id)
      if (linkError) return { errors: 1, autoMatched: 0, review: 0, noMatch: 0 }
      return { errors: 0, autoMatched: 1, review: 0, noMatch: 0 }
    }

    // If a previous automatic match is now rejected by the stricter
    // artist-first check, remove only the link created from this catalogue
    // record. Manually curated or differently sourced links are untouched.
    if (item.matched_event_id) {
      await db.from('events').update({ gigsberg_affiliate_url: null }).eq('id', item.matched_event_id).eq('gigsberg_affiliate_url', item.url)
    }
    return { errors: 0, autoMatched: 0, review: decision.status === 'review' ? 1 : 0, noMatch: decision.status === 'review' ? 0 : 1 }
  }

  for (let offset = 0; offset < catalogue.length; offset += WRITE_BATCH_SIZE) {
    if (Date.now() > deadline) {
      result.incomplete = true
      console.warn(`[gigsberg-match] time budget reached after ${result.checked}/${catalogue.length} rows; the rest will be picked up by the next run`)
      break
    }
    const batchItems = catalogue.slice(offset, offset + WRITE_BATCH_SIZE)
    // Only events whose title could match need their linked artists.
    const candidatesByItem = batchItems.map(item =>
      (eventsByDate.get(dateOnly(item.event_date)) ?? []).filter(event => hasTitleEvidence(item, event)),
    )
    await attachLinkedArtists(db, [...new Set(candidatesByItem.flat())], artistsLoaded)
    const batch = await Promise.all(batchItems.map((item, index) => processItem(item, candidatesByItem[index])))
    result.checked += batch.length
    for (const outcome of batch) {
      result.errors += outcome.errors
      result.autoMatched += outcome.autoMatched
      result.review += outcome.review
      result.noMatch += outcome.noMatch
    }
  }

  result.timings = { loadMs, matchMs: Date.now() - started - loadMs, catalogueRows: catalogue.length, events: events.length }
  console.log(`[gigsberg-match] done: ${JSON.stringify(result)}`)
  return result
}
