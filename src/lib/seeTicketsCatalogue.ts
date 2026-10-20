import { createAdminClient } from '@/lib/supabase/admin'
import { gunzipSync } from 'node:zlib'
import { parseSeeTicketsCsv, type SeeTicketsRow } from './seeTicketsCsv'

const UK_COUNTRIES = new Set(['uk', 'gb', 'gbr', 'great britain', 'united kingdom', 'england', 'scotland', 'wales', 'northern ireland'])

export type SeeTicketsSyncResult = {
  fetched: number
  eligible: number
  inserted: number
  updated: number
  skipped: number
  errors: number
  durationMs: number
  datePopulated: number
  sampleDates: string[]
  sampleKeys: string[]
  sweep?: SeeTicketsSweepReport
}

/** What the sweep part of the sync did (mode live) or would do (mode dry). Mode off adds nothing. */
export type SeeTicketsSweepReport = {
  mode: 'off' | 'dry' | 'live'
  stamped: number              // unchanged feed rows marked as seen this run (dry: how many would be)
  reappeared: number           // rows that had been flagged gone and are back in the feed
  absentFromFeed: number       // future catalogue rows not in today's feed
  removalCandidates: number    // absent rows that were also missing last time (or would be)
  removed: number
  sampleAbsent: string[]
  detail?: string
}

type SweepMode = 'off' | 'dry' | 'live'
const REMOVAL_GRACE_MS = 30 * 3_600_000   // a row must have gone unseen for roughly two daily runs
const MIN_FEED_SHARE = 0.7                // a feed smaller than 70% of what we hold is treated as broken

function inWindow(eventDate: string | null, from: Date, to: Date) {
  if (!eventDate) return false
  const date = new Date(`${eventDate}T23:59:59Z`)
  return !Number.isNaN(date.getTime()) && date >= from && date <= to
}

function rowChanged(next: SeeTicketsRow, existing: SeeTicketsRow) {
  return JSON.stringify(next) !== JSON.stringify(existing)
}

function dateAfterMonths(months: number) {
  const date = new Date()
  date.setMonth(date.getMonth() + months)
  return date
}

export async function syncSeeTicketsCatalogue(from = new Date(), to = dateAfterMonths(24)): Promise<SeeTicketsSyncResult> {
  const started = Date.now()
  const feedUrl = process.env.SEE_TICKETS_FEED_URL
  if (!feedUrl) throw new Error('Missing SEE_TICKETS_FEED_URL')
  const response = await fetch(feedUrl, { cache: 'no-store' })
  if (!response.ok) throw new Error(`See Tickets feed returned ${response.status}`)
  const bytes = Buffer.from(await response.arrayBuffer())
  const body = bytes[0] === 0x1f && bytes[1] === 0x8b
    ? gunzipSync(bytes).toString('utf8')
    : bytes.toString('utf8')
  const rows = parseSeeTicketsCsv(body)
  const eligibleRows = rows.filter(row => {
    const country = (row.country ?? '').toLowerCase()
    return (!country || UK_COUNTRIES.has(country)) && inWindow(row.event_date, from, to)
  })
  const db = createAdminClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const loose = db as unknown as { from: (table: string) => any }
  const { data: sweepRow } = await loose.from('see_tickets_sweep_state').select('mode, max_removals_per_run, stamping_since').eq('id', 1).maybeSingle()
  const sweepState = sweepRow as { mode?: SweepMode; max_removals_per_run?: number; stamping_since?: string | null } | null
  const mode: SweepMode = sweepState?.mode ?? 'dry'
  const report: SeeTicketsSweepReport = { mode, stamped: 0, reappeared: 0, absentFromFeed: 0, removalCandidates: 0, removed: 0, sampleAbsent: [] }
  const goneIds = new Set<string>()
  const toStamp: string[] = []
  const ids = eligibleRows.map(row => row.id)
  const existingById = new Map<string, SeeTicketsRow>()
  for (let index = 0; index < ids.length; index += 500) {
    const { data, error } = await db.from('see_tickets_catalogue_events').select('id, merchant_product_id, name, event_date, venue, city, country, primary_artist, second_artist, genre, url, availability_status, available_from, valid_from, valid_to, min_price, max_price, raw, gone_at').in('id', ids.slice(index, index + 500))
    if (error) throw new Error(`Could not read the See Tickets catalogue: ${error.message}`)
    for (const raw of (data ?? []) as unknown as Array<SeeTicketsRow & { gone_at?: string | null }>) {
      // gone_at is read only to notice a row that has come back; it must not take part in the change comparison.
      const { gone_at, ...row } = raw
      if (gone_at) goneIds.add(row.id)
      existingById.set(row.id, row)
    }
  }
  let inserted = 0; let updated = 0; let skipped = 0; let errors = 0
  for (let index = 0; index < eligibleRows.length; index += 25) {
    const batch = eligibleRows.slice(index, index + 25)
    const changed = batch.filter(row => !existingById.has(row.id) || goneIds.has(row.id) || rowChanged(row, existingById.get(row.id)!))
    skipped += batch.length - changed.length
    if (mode !== 'off') {
      const changedIds = new Set(changed.map(row => row.id))
      for (const row of batch) if (!changedIds.has(row.id)) toStamp.push(row.id)
      report.reappeared += changed.filter(row => goneIds.has(row.id)).length
    }
    if (!changed.length) continue
    // Keep writes small and do not ask PostgREST to return every written row.
    // The feed can contain very large raw payloads, and returning them makes a
    // bulk upsert much more likely to hit the database statement timeout.
    const { error } = await db.from('see_tickets_catalogue_events').upsert(changed.map(row => ({ ...row, last_seen_at: new Date().toISOString(), ...(goneIds.has(row.id) ? { gone_at: null } : {}) })), { onConflict: 'id', ignoreDuplicates: false })
    if (error) { errors += changed.length; console.error(`[see-tickets] catalogue batch failed: ${error.message}`); continue }
    inserted += changed.filter(row => !existingById.has(row.id)).length
    updated += changed.filter(row => existingById.has(row.id)).length
  }
  if (mode !== 'off') {
    try {
      await sweepFeedRows(loose, { mode, state: sweepState, eligibleIds: new Set(ids), toStamp, errors, report })
    } catch (e) {
      report.detail = `sweep step failed: ${e instanceof Error ? e.message : String(e)}`
      console.error('[see-tickets] sweep step failed:', report.detail)
    }
    await loose.from('see_tickets_sweep_state').update({ last_stats: { ...report, at: new Date().toISOString() } }).eq('id', 1)
  }
  return {
    sweep: mode === 'off' ? undefined : report,
    fetched: rows.length,
    eligible: eligibleRows.length,
    inserted,
    updated,
    skipped,
    errors,
    durationMs: Date.now() - started,
    datePopulated: rows.filter(row => Boolean(row.event_date)).length,
    sampleDates: rows.slice(0, 10).map(row => row.event_date ?? row.raw.event_date ?? row.raw['Tickets:event_date'] ?? '').filter(Boolean),
    sampleKeys: Object.keys(rows[0]?.raw ?? {}).slice(0, 30),
  }
}

/**
 * Stamps unchanged feed rows as seen and flags rows the feed has stopped listing.
 * Live mode writes; dry mode only fills in the report. Removal is deliberately slow and guarded:
 * the feed must look complete, a row must have been missing across roughly two daily runs, stamping
 * must already have been running for a day, and each run is capped.
 */
async function sweepFeedRows(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  loose: { from: (table: string) => any },
  ctx: { mode: SweepMode; state: { max_removals_per_run?: number; stamping_since?: string | null } | null; eligibleIds: Set<string>; toStamp: string[]; errors: number; report: SeeTicketsSweepReport },
) {
  const { mode, state, eligibleIds, toStamp, report } = ctx
  const live = mode === 'live'
  const nowIso = new Date().toISOString()

  report.stamped = toStamp.length
  if (live) {
    for (let i = 0; i < toStamp.length; i += 200) {
      const { error } = await loose.from('see_tickets_catalogue_events').update({ last_seen_at: nowIso }).in('id', toStamp.slice(i, i + 200))
      if (error) throw new Error(`could not stamp seen rows: ${error.message}`)
    }
    if (!state?.stamping_since) await loose.from('see_tickets_sweep_state').update({ stamping_since: nowIso }).eq('id', 1)
  }

  // Every future catalogue row that is still flagged present, paged by id.
  type Held = { id: string; name: string; url: string | null; matched_event_id: string | null; last_seen_at: string | null }
  const held: Held[] = []
  let lastId: string | null = null
  for (;;) {
    let q = loose.from('see_tickets_catalogue_events').select('id, name, url, matched_event_id, last_seen_at').gte('event_date', nowIso.slice(0, 10)).is('gone_at', null).order('id', { ascending: true }).limit(1000)
    if (lastId) q = q.gt('id', lastId)
    const { data, error } = await q
    if (error) throw new Error(`could not read held catalogue rows: ${error.message}`)
    const page = (data ?? []) as Held[]
    held.push(...page)
    if (page.length < 1000) break
    lastId = page[page.length - 1].id
  }

  const absent = held.filter(row => !eligibleIds.has(row.id))
  report.absentFromFeed = absent.length
  report.sampleAbsent = absent.slice(0, 12).map(row => row.name.slice(0, 80))

  if (held.length > 100 && eligibleIds.size < held.length * MIN_FEED_SHARE) {
    report.detail = `feed has ${eligibleIds.size} eligible rows against ${held.length} held; looks incomplete, nothing flagged`
    return
  }
  const graceCutoff = Date.now() - REMOVAL_GRACE_MS
  const stampingForLongEnough = Boolean(state?.stamping_since) && new Date(state!.stamping_since as string).getTime() < graceCutoff
  const candidates = absent.filter(row => !row.last_seen_at || new Date(row.last_seen_at).getTime() < graceCutoff)
  report.removalCandidates = candidates.length
  if (!live) return
  if (!stampingForLongEnough) {
    report.detail = 'stamping only started on this run; removals begin once rows have been stamped for a full day'
    report.removalCandidates = 0
    return
  }

  const cap = Math.max(0, state?.max_removals_per_run ?? 300)
  for (const row of candidates.slice(0, cap)) {
    const { error } = await loose.from('see_tickets_catalogue_events').update({ gone_at: nowIso }).eq('id', row.id)
    if (error) { ctx.errors++; continue }
    report.removed++
    // Drop only the See Tickets link this catalogue row created; hand-mapped West End links are never touched.
    if (row.matched_event_id && row.url) {
      await loose.from('events').update({ see_tickets_affiliate_url: null }).eq('id', row.matched_event_id).eq('see_tickets_affiliate_url', row.url)
    }
  }
  if (candidates.length > cap) report.detail = `removal cap of ${cap} per run reached; ${candidates.length - cap} left for the next run`
}
