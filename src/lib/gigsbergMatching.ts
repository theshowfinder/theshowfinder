import { createAdminClient } from '@/lib/supabase/admin'
import { fetchAllPages } from '@/lib/pagedFetch'
import {
  bucketEventsByDate,
  dateOnly,
  decideMatch,
  type CatalogueRow,
  type ShowfinderEvent,
} from '@/lib/gigsbergMatchScoring'

export interface GigsbergMatchResult {
  checked: number
  autoMatched: number
  review: number
  noMatch: number
  errors: number
}

const MATCH_RETRY_AFTER_MS = 24 * 60 * 60 * 1000
const CATALOGUE_COLUMNS = 'id, name, event_date, venue, city, performer1, performer2, url, matched_event_id, match_checked_at'
// Events carry a nested artists join, so keep pages smaller than the 1000-row
// ceiling to stay well inside the database statement timeout.
const EVENT_PAGE_SIZE = 500
// Supabase writes are network-bound; small concurrent batches finish a full
// catalogue in seconds without overwhelming the database.
const WRITE_BATCH_SIZE = 50

type Db = ReturnType<typeof createAdminClient>
type PageResult<T> = { data: T[] | null; error: { message: string } | null }

async function loadCatalogue(db: Db, fullRescan: boolean): Promise<CatalogueRow[]> {
  const retryBefore = new Date(Date.now() - MATCH_RETRY_AFTER_MS).toISOString()
  // PostgREST caps every request at 1000 rows whatever .limit() says, so each
  // query is paged with range() and a stable order — the old .limit(50000)
  // silently saw only the first 1000 rows.
  const pageOf = (apply: (query: ReturnType<typeof base>) => ReturnType<typeof base>) =>
    fetchAllPages<CatalogueRow>((from, to) =>
      apply(base()).order('id', { ascending: true }).range(from, to) as unknown as PromiseLike<PageResult<CatalogueRow>>,
    )
  function base() {
    return db.from('gigsberg_catalogue_events').select(CATALOGUE_COLUMNS)
  }

  if (fullRescan) {
    return pageOf(query => query.in('match_status', ['pending', 'review', 'no_match', 'auto_matched']))
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

async function loadUpcomingEvents(db: Db): Promise<ShowfinderEvent[]> {
  const now = new Date().toISOString()
  return fetchAllPages<ShowfinderEvent>(
    (from, to) => db
      .from('events')
      .select('id, title, start_date, gigsberg_affiliate_url, venue:venues(name, city), artists:event_artists(artist:artists(name))')
      .gte('start_date', now)
      .order('id', { ascending: true })
      .range(from, to) as unknown as PromiseLike<PageResult<ShowfinderEvent>>,
    EVENT_PAGE_SIZE,
  )
}

/**
 * Match only new rows and unresolved rows that have not been checked in the
 * last day. Pass fullRescan when the matching rules themselves have changed.
 */
export async function matchGigsbergCatalogue(fullRescan = false): Promise<GigsbergMatchResult> {
  const db = createAdminClient()
  const [catalogue, events] = await Promise.all([loadCatalogue(db, fullRescan), loadUpcomingEvents(db)])
  const eventsByDate = bucketEventsByDate(events)

  const result: GigsbergMatchResult = { checked: 0, autoMatched: 0, review: 0, noMatch: 0, errors: 0 }

  async function processItem(item: CatalogueRow) {
    const decision = decideMatch(item, eventsByDate.get(dateOnly(item.event_date)) ?? [])

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
    const batch = await Promise.all(catalogue.slice(offset, offset + WRITE_BATCH_SIZE).map(processItem))
    result.checked += batch.length
    for (const outcome of batch) {
      result.errors += outcome.errors
      result.autoMatched += outcome.autoMatched
      result.review += outcome.review
      result.noMatch += outcome.noMatch
    }
  }

  return result
}
