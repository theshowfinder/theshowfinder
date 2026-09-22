import { createAdminClient } from '@/lib/supabase/admin'

type DbClient = ReturnType<typeof createAdminClient>

// ── Gigsberg Seller API types ────────────────────────────────────────────────

interface GigsbergListing {
  id: number
  event_id: number
  category_id: number
  block: string | null
  row: string | null
  price: number
  currency_id: number
  quantity: number
  tickets_sold: number
  active: boolean
}

interface GigsbergListingSearchResponse {
  items: GigsbergListing[]
  nextPage: string | null
}

interface GigsbergEvent {
  id: number
  name: string
  subTypeId: number
  date: string
  time: string
  performer1: string | null
  performer2: string | null
  venue: string
  tour: string | null
  city: string
  categories: unknown
}

// ── Config ──────────────────────────────────────────────────────────────────

const GIGSBERG_BASE   = 'https://api.gigsberg.com/v1'
const EVENT_CONCURRENCY = 10  // concurrent GET /event/{id} requests
const RATE_LIMIT_MS     = 150

function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms))
}

// ── Auth ────────────────────────────────────────────────────────────────────

async function authenticate(): Promise<string> {
  const userId = process.env.GIGSBERG_USER_ID
  const apiKey = process.env.GIGSBERG_API_KEY
  if (!userId || !apiKey) {
    throw new Error('Missing GIGSBERG_USER_ID or GIGSBERG_API_KEY environment variables')
  }

  const res = await fetch(`${GIGSBERG_BASE}/auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ userId, apiKey }).toString(),
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`Gigsberg auth failed: HTTP ${res.status}`)

  const json = await res.json() as { jwt?: string }
  if (!json.jwt) throw new Error('Gigsberg auth response missing jwt')
  return json.jwt
}

// ── Listings ────────────────────────────────────────────────────────────────

// nextPage is a full URL carrying the next after_id as a query param;
// we just read that param back out rather than assuming its shape.
function parseAfterId(nextPage: string): number | null {
  try {
    const v = new URL(nextPage).searchParams.get('after_id')
    return v !== null ? Number(v) : null
  } catch {
    return null
  }
}

async function fetchAllListings(jwt: string): Promise<GigsbergListing[]> {
  const all: GigsbergListing[] = []
  let afterId = 0

  for (;;) {
    const res = await fetch(`${GIGSBERG_BASE}/listing/search`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${jwt}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ after_id: afterId, per_page: 5000 }),
      cache: 'no-store',
    })
    if (!res.ok) throw new Error(`Gigsberg listing/search failed: HTTP ${res.status}`)

    const json = await res.json() as GigsbergListingSearchResponse
    all.push(...(json.items ?? []))

    if (!json.nextPage) break
    const nextAfterId = parseAfterId(json.nextPage)
    if (nextAfterId === null || nextAfterId === afterId) break  // guard against a malformed cursor looping forever
    afterId = nextAfterId
    await sleep(RATE_LIMIT_MS)
  }

  return all
}

// ── Event details ───────────────────────────────────────────────────────────

async function fetchGigsbergEvent(jwt: string, eventId: number): Promise<GigsbergEvent | null> {
  const res = await fetch(`${GIGSBERG_BASE}/event/${eventId}`, {
    headers: { 'Authorization': `Bearer ${jwt}` },
    cache: 'no-store',
  })
  if (!res.ok) {
    console.error(`[gigsberg] event/${eventId} failed: HTTP ${res.status}`)
    return null
  }
  return res.json() as Promise<GigsbergEvent>
}

async function fetchGigsbergEvents(jwt: string, eventIds: number[]): Promise<Map<number, GigsbergEvent>> {
  const events = new Map<number, GigsbergEvent>()
  for (let i = 0; i < eventIds.length; i += EVENT_CONCURRENCY) {
    const chunk = eventIds.slice(i, i + EVENT_CONCURRENCY)
    const results = await Promise.all(chunk.map(id => fetchGigsbergEvent(jwt, id)))
    results.forEach((ev, idx) => { if (ev) events.set(chunk[idx], ev) })
    if (i + EVENT_CONCURRENCY < eventIds.length) await sleep(RATE_LIMIT_MS)
  }
  return events
}

// Slug text is ignored by Gigsberg's public ticket pages — only the trailing
// show-{id} matters — so this generic form works for every event without
// needing the event's real slug.
function buildTicketUrl(eventId: number): string {
  return `https://gigsberg.com/tickets/tickets/tickets-tickets/show-${eventId}`
}

// ── Matching helpers ─────────────────────────────────────────────────────────

function normalizeText(s: string | null | undefined): string {
  return (s ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')  // strip diacritics
    .replace(/[^a-z0-9\s]/g, '')      // strip punctuation
    .replace(/\s+/g, ' ')
    .trim()
}

// Compares calendar date only — takes the literal YYYY-MM-DD prefix rather
// than parsing into a Date object, so no timezone conversion can shift the
// day. Both Gigsberg's `date` and our `start_date` are ISO-ish strings.
function dateOnly(value: string | null | undefined): string | null {
  if (!value) return null
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(value.trim())
  return m ? m[1] : null
}

interface EventCandidate {
  id: string
  slug: string
  artistNorms: Set<string>
}

interface EventJoinRow {
  id: string
  slug: string
  start_date: string
  venue: { name: string } | null
  artists: Array<{ artist: { name: string } | null }> | null
}

// Indexes our own upcoming events by `${dateOnly}|${venueNorm}` so each
// Gigsberg event only has to check a small bucket of candidates instead of
// scanning the whole table.
async function buildEventIndex(db: DbClient): Promise<Map<string, EventCandidate[]>> {
  const index = new Map<string, EventCandidate[]>()
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const PAGE = 1000
  let from = 0

  for (;;) {
    const { data, error } = await db
      .from('events')
      .select('id, slug, start_date, venue:venues(name), artists:event_artists(artist:artists(name))')
      .gte('start_date', cutoff)
      .range(from, from + PAGE - 1) as unknown as { data: EventJoinRow[] | null; error: { message: string } | null }

    if (error) throw new Error(`events fetch failed: ${error.message}`)
    const rows = data ?? []

    for (const row of rows) {
      const venueName = row.venue?.name
      const d = dateOnly(row.start_date)
      if (!venueName || !d) continue

      const artistNorms = new Set(
        (row.artists ?? [])
          .map(a => normalizeText(a.artist?.name))
          .filter(Boolean)
      )
      const key = `${d}|${normalizeText(venueName)}`
      const arr = index.get(key) ?? []
      arr.push({ id: row.id, slug: row.slug, artistNorms })
      index.set(key, arr)
    }

    if (rows.length < PAGE) break
    from += PAGE
  }

  return index
}

type MatchOutcome =
  | { kind: 'matched'; eventId: string; slug: string }
  | { kind: 'no_candidates' }
  | { kind: 'no_artist_match'; candidateCount: number }
  | { kind: 'multiple_matches'; candidateIds: string[] }

function matchGigsbergEvent(ev: GigsbergEvent, index: Map<string, EventCandidate[]>): MatchOutcome {
  const d = dateOnly(ev.date)
  if (!d) return { kind: 'no_candidates' }

  const key = `${d}|${normalizeText(ev.venue)}`
  const candidates = index.get(key) ?? []
  if (candidates.length === 0) return { kind: 'no_candidates' }

  const performerNorms = [ev.performer1, ev.performer2]
    .filter((p): p is string => Boolean(p))
    .map(normalizeText)

  const matched = candidates.filter(c =>
    performerNorms.some(p => c.artistNorms.has(p))
  )

  if (matched.length === 0) return { kind: 'no_artist_match', candidateCount: candidates.length }
  if (matched.length > 1) return { kind: 'multiple_matches', candidateIds: matched.map(m => m.id) }
  return { kind: 'matched', eventId: matched[0].id, slug: matched[0].slug }
}

// ── Sync logging (mirrors the sync_log/sync_state pattern used by the
//    Ticketmaster sync in src/lib/ticketmaster.ts, in dedicated tables since
//    a single-pass run doesn't fit sync_log's per-city shape) ────────────────

async function updateSyncState(db: DbClient, fields: Record<string, unknown>): Promise<void> {
  try {
    await db.from('gigsberg_sync_state').update(fields).eq('id', 1)
  } catch (err) {
    console.error('[gigsberg] sync_state update failed (non-fatal):', err)
  }
}

async function logRun(
  db: DbClient,
  run: {
    startedAt: string
    listingsFetched: number
    eventsMatched: number
    eventsUpdated: number
    eventsUnmatched: number
    eventsCleared: number
    status: 'ok' | 'error'
    error?: string
  },
): Promise<void> {
  try {
    await db.from('gigsberg_sync_log').insert({
      started_at:       run.startedAt,
      completed_at:     new Date().toISOString(),
      listings_fetched: run.listingsFetched,
      events_matched:   run.eventsMatched,
      events_updated:   run.eventsUpdated,
      events_unmatched: run.eventsUnmatched,
      events_cleared:   run.eventsCleared,
      status:           run.status,
      error:            run.error ?? null,
    })
  } catch (err) {
    console.error('[gigsberg] sync_log write failed (non-fatal):', err)
  }
}

// ── Public result type ───────────────────────────────────────────────────────

export interface GigsbergSyncResult {
  listingsFetched:  number
  sellableListings: number
  uniqueGigsbergEvents: number
  matched:          number
  updated:          number
  unmatched:        number
  cleared:          number
  unmatchedSample:  Array<{ gigsbergEventId: number; name: string; venue: string; date: string; reason: string }>
  // Counts by reason across ALL unmatched events, not just the capped sample —
  // lets the caller see e.g. "mostly past-dated listings" vs "mostly venue-name
  // mismatches" at a glance.
  unmatchedByReason: { no_candidates: number; no_artist_match: number; multiple_matches: number; fetch_failed: number }
  // How many unmatched events had a start_date already in the past — a big
  // share here means the Gigsberg account has stale/never-delisted inventory
  // for events that already happened, separate from any matching issue.
  unmatchedPastDated: number
  durationMs:       number
}

// ── Main entry point ─────────────────────────────────────────────────────────

export async function syncGigsbergTickets(): Promise<GigsbergSyncResult> {
  const t0 = Date.now()
  const startedAt = new Date().toISOString()
  const db = createAdminClient()

  await updateSyncState(db, { status: 'running', last_started_at: startedAt })

  try {
    console.log('[gigsberg] Authenticating…')
    const jwt = await authenticate()

    console.log('[gigsberg] Fetching listings…')
    const listings = await fetchAllListings(jwt)
    console.log(`[gigsberg] Fetched ${listings.length} listing(s)`)

    const sellable = listings.filter(l => l.active && l.quantity > l.tickets_sold)
    const sellableEventIds = [...new Set(sellable.map(l => l.event_id))]
    console.log(`[gigsberg] ${sellable.length} sellable listing(s) across ${sellableEventIds.length} unique event(s)`)

    console.log('[gigsberg] Fetching event details…')
    const gigsbergEvents = await fetchGigsbergEvents(jwt, sellableEventIds)

    console.log('[gigsberg] Building match index from our events…')
    const index = await buildEventIndex(db)

    let matched = 0, updated = 0, unmatched = 0, unmatchedPastDated = 0
    const unmatchedByReason = { no_candidates: 0, no_artist_match: 0, multiple_matches: 0, fetch_failed: 0 }
    // Stratified per reason (capped per bucket) rather than first-N overall,
    // so a run dominated by one reason doesn't crowd the others out of the sample.
    const sampleBuckets: Record<keyof typeof unmatchedByReason, GigsbergSyncResult['unmatchedSample']> = {
      no_candidates: [], no_artist_match: [], multiple_matches: [], fetch_failed: [],
    }
    const SAMPLE_PER_REASON = 8
    const matchedLinks: Array<{ eventId: string; gigsbergEventId: number; url: string }> = []
    const todayStr = dateOnly(new Date().toISOString())!

    for (const eventId of sellableEventIds) {
      const ev = gigsbergEvents.get(eventId)
      if (!ev) {
        unmatched++
        unmatchedByReason.fetch_failed++
        if (sampleBuckets.fetch_failed.length < SAMPLE_PER_REASON) {
          sampleBuckets.fetch_failed.push({ gigsbergEventId: eventId, name: '(fetch failed)', venue: '', date: '', reason: 'event detail fetch failed' })
        }
        continue
      }

      const outcome = matchGigsbergEvent(ev, index)
      if (outcome.kind === 'matched') {
        matched++
        matchedLinks.push({ eventId: outcome.eventId, gigsbergEventId: eventId, url: buildTicketUrl(eventId) })
      } else {
        unmatched++
        unmatchedByReason[outcome.kind]++
        const evDate = dateOnly(ev.date)
        if (evDate && evDate < todayStr) unmatchedPastDated++
        const bucket = sampleBuckets[outcome.kind]
        if (bucket.length < SAMPLE_PER_REASON) {
          const reason =
            outcome.kind === 'no_candidates'    ? 'no event at that venue on that date' :
            outcome.kind === 'no_artist_match'  ? `venue+date matched ${outcome.candidateCount} event(s), but no artist matched` :
            `matched ${outcome.candidateIds.length} events — ambiguous, skipped`
          bucket.push({ gigsbergEventId: eventId, name: ev.name, venue: ev.venue, date: ev.date, reason })
        }
      }
    }

    const unmatchedSample: GigsbergSyncResult['unmatchedSample'] = [
      ...sampleBuckets.no_artist_match,
      ...sampleBuckets.multiple_matches,
      ...sampleBuckets.fetch_failed,
      ...sampleBuckets.no_candidates,
    ]

    // ── Apply confirmed matches ────────────────────────────────────────────
    console.log(`[gigsberg] Applying ${matchedLinks.length} confirmed match(es)…`)
    for (const link of matchedLinks) {
      const { error: evErr } = await db
        .from('events')
        .update({ own_ticket_url: link.url })
        .eq('id', link.eventId)
      if (evErr) {
        console.error(`[gigsberg] failed to set own_ticket_url on event ${link.eventId}: ${evErr.message}`)
        continue
      }
      updated++

      const { error: linkErr } = await db
        .from('gigsberg_event_links')
        .upsert({
          event_id:          link.eventId,
          gigsberg_event_id: String(link.gigsbergEventId),
          ticket_url:        link.url,
          updated_at:        new Date().toISOString(),
        }, { onConflict: 'event_id' })
      if (linkErr) {
        console.error(`[gigsberg] failed to upsert gigsberg_event_links for event ${link.eventId}: ${linkErr.message}`)
      }
    }

    // ── Clear own_ticket_url for links whose listing is no longer sellable ─
    console.log('[gigsberg] Checking previously-linked events for delisted/sold-out listings…')
    const sellableIdStrings = new Set(sellableEventIds.map(String))
    const { data: existingLinks, error: linksErr } = await db
      .from('gigsberg_event_links')
      .select('event_id, gigsberg_event_id')

    let cleared = 0
    if (linksErr) {
      console.error(`[gigsberg] failed to read gigsberg_event_links: ${linksErr.message}`)
    } else {
      for (const row of (existingLinks ?? []) as Array<{ event_id: string; gigsberg_event_id: string }>) {
        if (sellableIdStrings.has(row.gigsberg_event_id)) continue  // still sellable — leave it set

        const { error: clearErr } = await db
          .from('events')
          .update({ own_ticket_url: null })
          .eq('id', row.event_id)
        if (clearErr) {
          console.error(`[gigsberg] failed to clear own_ticket_url on event ${row.event_id}: ${clearErr.message}`)
          continue
        }
        await db.from('gigsberg_event_links').delete().eq('event_id', row.event_id)
        cleared++
      }
    }

    const durationMs = Date.now() - t0
    console.log(`[gigsberg] ── Sync complete in ${(durationMs / 1000).toFixed(1)}s ──`)
    console.log(`[gigsberg]    listings=${listings.length} sellable=${sellable.length} matched=${matched} updated=${updated} unmatched=${unmatched} cleared=${cleared}`)

    await logRun(db, {
      startedAt,
      listingsFetched:  listings.length,
      eventsMatched:    matched,
      eventsUpdated:    updated,
      eventsUnmatched:  unmatched,
      eventsCleared:    cleared,
      status:           'ok',
    })
    await updateSyncState(db, {
      status:                'idle',
      last_completed_at:     new Date().toISOString(),
      total_listings_synced: listings.length,
    })

    return {
      listingsFetched:      listings.length,
      sellableListings:     sellable.length,
      uniqueGigsbergEvents: sellableEventIds.length,
      matched,
      updated,
      unmatched,
      cleared,
      unmatchedSample,
      unmatchedByReason,
      unmatchedPastDated,
      durationMs,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[gigsberg] Fatal error:', message)
    await logRun(db, {
      startedAt,
      listingsFetched:  0,
      eventsMatched:    0,
      eventsUpdated:    0,
      eventsUnmatched:  0,
      eventsCleared:    0,
      status:           'error',
      error:            message,
    })
    await updateSyncState(db, { status: 'error', last_completed_at: new Date().toISOString() })
    throw err
  }
}
