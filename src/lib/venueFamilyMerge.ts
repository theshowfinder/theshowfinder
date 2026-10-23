// Merges one show stored twice under two rooms / venue records of one building (Airbag, 23 Oct 2026: O2 Academy2
// Birmingham from Ticketmaster, O2 Academy Birmingham from its TicketWeb copy; council / tourism copies such as
// "Hue & Cry - Music Hall" vs Ticketmaster's "Hue and Cry" at Aberdeen Music Hall).
//
// Runs on its own cron after the imports (vercel.json: merge-duplicates), so every importer (Ticketmaster sync,
// council feeds, feed imports, Gigsberg) is covered without changing how each one creates events.
//   - Confident groups are merged: the duplicate gets merged_into = kept event (migration 090), which takes it out of
//     listings, the sitemap and matching (event_canonical_map) and 301-redirects its page. Nothing is deleted.
//   - Seller links, acts, saved events, reminders and news references move to the kept event. A seller link that
//     clashes with a different one already on the kept event is left alone and goes to event_merge_reviews.
//   - A council / tourism copy's listing page is kept as data in info_links (shown only when there is no seller).
//   - Unsure groups go to event_merge_reviews for a person; a group marked not_duplicate there is never re-raised.
import { createAdminClient } from '@/lib/supabase/admin'
import { fetchAllPages } from '@/lib/pagedFetch'
import { LIVE_EVENT_STATUSES } from '@/lib/listedEvents'
import { isExtraTitle, isPackageOrClassTitle } from '@/lib/eventTitles'
import { findDuplicateGroups, findExtraHomes, keepReason, type DuplicateGroup, type GroupEvent } from '@/lib/venueFamily'

/* eslint-disable @typescript-eslint/no-explicit-any */
type Db = any

export interface MergeEvent extends GroupEvent {
  slug: string
  status: string
  gigsberg_url: string | null
  gigsberg_inventory_status: string | null
  info_links: InfoLink[] | null
}

interface InfoLink { source: string | null; url: string; from_event_id: string }

export interface MergeRunResult {
  dryRun: boolean
  eventsScanned: number
  groups: number
  confident: number
  merged: number
  duplicatesMerged: number
  sentToReview: number
  alreadyDecided: number
  linkClashes: number
  linksMoved: number
  /** Extras (hotel bundles, camping, parking, VIP...) folded into their main show. */
  extrasMerged: number
  /** Extras with no clear main show, sent to event_merge_reviews. */
  extrasToReview: number
  examples: string[]
}

const EVENT_COLUMNS = 'id, slug, title, start_date, created_at, status, source, ticketmaster_id, tickets_url, own_ticket_url, see_tickets_affiliate_url, gigsberg_url, gigsberg_affiliate_url, gigsberg_inventory_status, viagogo_url, stubhub_url, venue_id, details, info_links'

async function loadCandidates(db: Db): Promise<{ events: MergeEvent[]; localSources: Set<string> }> {
  const now = new Date().toISOString()
  const [rows, venues, nonCanon, sources] = await Promise.all([
    fetchAllPages<any>((from, to) => db.from('events').select(EVENT_COLUMNS).gte('start_date', now).in('status', LIVE_EVENT_STATUSES).is('merged_into', null).order('id').range(from, to)),
    fetchAllPages<any>((from, to) => db.from('venues').select('id, name, city, postcode, lat, lng').order('id').range(from, to)),
    fetchAllPages<any>((from, to) => db.from('event_canonical_map').select('id').eq('is_canonical', false).order('id').range(from, to)),
    db.from('local_event_sources').select('event_source'),
  ])
  const venueById = new Map(venues.map((v: any) => [v.id, v]))
  const hidden = new Set(nonCanon.map((r: any) => r.id))
  // Packages and extras are kept here: extras are folded into their main show below; neither is grouped as a show.
  const events = rows.filter((e: any) => e.venue_id && venueById.has(e.venue_id) && !hidden.has(e.id))
  const ids = new Set(events.map((e: any) => e.id))
  const links = await fetchAllPages<any>((from, to) => db.from('event_artists').select('event_id, artist_id, is_headliner').order('event_id').order('artist_id').range(from, to))
  const mine = links.filter((r: any) => ids.has(r.event_id))
  const artistIds = [...new Set(mine.map((r: any) => r.artist_id))] as string[]
  const names = new Map<string, string>()
  for (let i = 0; i < artistIds.length; i += 300) {
    const { data } = await db.from('artists').select('id, name').in('id', artistIds.slice(i, i + 300))
    for (const a of data ?? []) names.set(a.id, a.name)
  }
  const artistsOf = new Map<string, any[]>()
  for (const r of mine) {
    const l = artistsOf.get(r.event_id) ?? []
    l.push({ id: r.artist_id, name: names.get(r.artist_id) ?? null, is_headliner: r.is_headliner })
    artistsOf.set(r.event_id, l)
  }
  return {
    events: events.map((e: any) => ({ ...e, venue: venueById.get(e.venue_id), artists: artistsOf.get(e.id) ?? [] })),
    localSources: new Set(((sources.data ?? []) as any[]).map(r => r.event_source)),
  }
}

const describe = (g: DuplicateGroup<MergeEvent>) =>
  `${g.keep.start_date.slice(0, 16)} ${g.keep.title} @ ${g.keep.venue.name} <- ${g.duplicates.map(d => `${d.title} @ ${d.venue.name} (${d.source ?? 'ticketmaster'})`).join('; ')}`

async function review(db: Db, kind: 'duplicate_group' | 'link_clash', key: string, g: DuplicateGroup<MergeEvent>, reasons: string[]) {
  await db.from('event_merge_reviews').upsert({
    kind, group_key: key, event_ids: g.events.map(e => e.id), suggested_keep_id: g.keep.id, reasons,
    summary: { keep: { id: g.keep.id, slug: g.keep.slug, why: keepReason(g.keep) }, events: g.events.map(e => ({ id: e.id, slug: e.slug, title: e.title, start: e.start_date, venue: e.venue.name, source: e.source ?? 'ticketmaster' })) },
  }, { onConflict: 'group_key', ignoreDuplicates: true })
}

/** Moves everything that belongs to the show from `dup` onto `keep`. Returns links moved and clashes found. */
async function mergeOne(db: Db, keep: MergeEvent, dup: MergeEvent, isLocal: boolean): Promise<{ moved: number; clashes: string[] }> {
  const patch: Record<string, unknown> = {}
  const clashes: string[] = []
  let moved = 0
  const take = (field: keyof MergeEvent, label: string) => {
    const mine = keep[field] as string | null, theirs = dup[field] as string | null
    if (!theirs) return 'none'
    if (!mine) { patch[field] = theirs; (keep as any)[field] = theirs; moved++; return 'moved' }
    if (mine !== theirs) { clashes.push(`${label}: kept event has ${mine}, duplicate has ${theirs}`); return 'clash' }
    return 'same'
  }
  const see = take('see_tickets_affiliate_url', 'See Tickets')
  const gig = take('gigsberg_affiliate_url', 'Gigsberg')
  if (gig === 'moved') {
    for (const f of ['gigsberg_url', 'gigsberg_inventory_status'] as const) if (!keep[f] && dup[f]) { patch[f] = dup[f]; (keep as any)[f] = dup[f] }
  }
  take('viagogo_url', 'Viagogo')
  take('stubhub_url', 'StubHub')
  if (isLocal) {
    // The council / tourism listing page is information, not a seller: kept as data, not as a button.
    if (dup.own_ticket_url) {
      const info = [...(keep.info_links ?? [])]
      if (!info.some(l => l.url === dup.own_ticket_url)) info.push({ source: dup.source, url: dup.own_ticket_url, from_event_id: dup.id })
      patch.info_links = info
      keep.info_links = info
    }
  } else {
    take('own_ticket_url', 'own tickets')
  }
  if (Object.keys(patch).length) {
    const { error } = await db.from('events').update(patch).eq('id', keep.id)
    if (error) throw new Error(`update kept event ${keep.id}: ${error.message}`)
  }

  // Catalogue rows follow the link they supplied (unless that link clashed).
  if (see === 'moved' || see === 'same') await db.from('see_tickets_catalogue_events').update({ matched_event_id: keep.id }).eq('matched_event_id', dup.id)
  if (gig === 'moved' || gig === 'same') {
    await db.from('gigsberg_catalogue_events').update({ matched_event_id: keep.id }).eq('matched_event_id', dup.id)
    const { data: kl } = await db.from('gigsberg_event_links').select('event_id').eq('event_id', keep.id).maybeSingle()
    if (!kl) await db.from('gigsberg_event_links').update({ event_id: keep.id }).eq('event_id', dup.id)
  }

  // Acts.
  const { data: acts } = await db.from('event_artists').select('artist_id, is_headliner, order').eq('event_id', dup.id)
  if (acts?.length) await db.from('event_artists').upsert(acts.map((a: any) => ({ ...a, event_id: keep.id })), { onConflict: 'event_id,artist_id', ignoreDuplicates: true })

  // Saved events and reminders: move unless the person already has the kept event.
  const { data: favs } = await db.from('user_favorites').select('user_id').eq('event_id', dup.id)
  for (const f of favs ?? []) {
    const { data: has } = await db.from('user_favorites').select('user_id').eq('event_id', keep.id).eq('user_id', f.user_id).maybeSingle()
    if (!has) await db.from('user_favorites').update({ event_id: keep.id }).eq('event_id', dup.id).eq('user_id', f.user_id)
  }
  await db.from('event_reminders').update({ event_id: keep.id }).eq('event_id', dup.id).is('sent_at', null)

  // News stories that point at the duplicate.
  const { data: stories } = await db.from('news_stories').select('id, event_ids').contains('event_ids', [dup.id])
  for (const s of stories ?? []) {
    const ids = [...new Set((s.event_ids as string[]).map(id => (id === dup.id ? keep.id : id)))]
    await db.from('news_stories').update({ event_ids: ids }).eq('id', s.id)
  }

  const { error } = await db.from('events').update({ merged_into: keep.id }).eq('id', dup.id)
  if (error) throw new Error(`mark duplicate ${dup.id}: ${error.message}`)
  return { moved, clashes }
}

export async function mergeVenueFamilyDuplicates(opts: { dryRun?: boolean; limit?: number } = {}): Promise<MergeRunResult> {
  const dryRun = opts.dryRun ?? false
  const db: Db = createAdminClient()
  const { events, localSources } = await loadCandidates(db)
  const isLocal = (s: string | null) => !!s && (localSources.has(s) || /_council$/.test(s))
  const shows = events.filter(e => !isPackageOrClassTitle(e.title) && !isExtraTitle(e.title))
  const groups = findDuplicateGroups(shows, isLocal)

  const { data: decided } = await db.from('event_merge_reviews').select('group_key, status').neq('status', 'open')
  const decidedKeys = new Map(((decided ?? []) as any[]).map(r => [r.group_key, r.status]))

  const res: MergeRunResult = { dryRun, eventsScanned: events.length, groups: groups.length, confident: 0, merged: 0, duplicatesMerged: 0, sentToReview: 0, alreadyDecided: 0, linkClashes: 0, linksMoved: 0, extrasMerged: 0, extrasToReview: 0, examples: [] }
  let done = 0
  for (const g of groups) {
    if (decidedKeys.get(g.key) === 'not_duplicate') { res.alreadyDecided++; continue }
    if (!g.confident) {
      res.sentToReview++
      if (!dryRun) await review(db, 'duplicate_group', g.key, g, g.reasons)
      continue
    }
    res.confident++
    if (opts.limit !== undefined && done >= opts.limit) continue
    done++
    if (res.examples.length < 25) res.examples.push(describe(g))
    if (dryRun) { res.merged++; res.duplicatesMerged += g.duplicates.length; continue }
    const clashes: string[] = []
    for (const d of g.duplicates) {
      const r = await mergeOne(db, g.keep, d, isLocal(d.source))
      res.linksMoved += r.moved
      clashes.push(...r.clashes)
      res.duplicatesMerged++
    }
    if (clashes.length) { res.linkClashes++; await review(db, 'link_clash', `clash:${g.key}`, g, clashes) }
    await db.from('event_merge_reviews').update({ status: 'merged', decided_at: new Date().toISOString() }).eq('group_key', g.key).eq('status', 'open')
    res.merged++
  }
  // Extras: fold each into its main show (same building, within 4 days); unclear ones go to a person.
  for (const { extra, main, why } of findExtraHomes(events.filter(e => isExtraTitle(e.title)), shows)) {
    if (!main) {
      res.extrasToReview++
      if (!dryRun) await db.from('event_merge_reviews').upsert({
        kind: 'duplicate_group', group_key: `extra:${extra.id}`, event_ids: [extra.id], suggested_keep_id: null, reasons: [`extra (hotel bundle, camping, parking, VIP...): ${why}`],
        summary: { events: [{ id: extra.id, slug: extra.slug, title: extra.title, start: extra.start_date, venue: extra.venue.name, source: extra.source ?? 'ticketmaster' }] },
      }, { onConflict: 'group_key', ignoreDuplicates: true })
      continue
    }
    if (decidedKeys.get(`extra:${extra.id}`) === 'not_duplicate') continue
    res.extrasMerged++
    if (res.examples.length < 40) res.examples.push(`extra: ${extra.title} -> ${main.title} @ ${main.venue.name}`)
    if (!dryRun) {
      const r = await mergeOne(db, main, extra, false)
      res.linksMoved += r.moved
    }
  }
  if (!dryRun && (res.merged || res.extrasMerged)) {
    const { error } = await db.rpc('refresh_event_canonical')
    if (error) throw new Error(`refresh_event_canonical: ${error.message}`)
  }
  return res
}

/**
 * A person's decision from the admin Decisions page: merge `dupIds` into `keepId`, exactly as the nightly job would
 * (seller links, acts, saved events and news move; each copy redirects to the kept event; nothing is deleted).
 */
export async function mergeEventsInto(keepId: string, dupIds: string[]): Promise<{ merged: number; clashes: string[] }> {
  const db: Db = createAdminClient()
  const ids = [keepId, ...dupIds.filter(id => id && id !== keepId)]
  const [{ data, error }, { data: srcs }] = await Promise.all([
    db.from('events').select(`${EVENT_COLUMNS}, merged_into, venue:venues(name, city, postcode, lat, lng)`).in('id', ids),
    db.from('local_event_sources').select('event_source'),
  ])
  if (error) throw new Error(error.message)
  const byId = new Map(((data ?? []) as any[]).map(e => [e.id, { ...e, artists: [] } as MergeEvent]))
  const keep = byId.get(keepId)
  if (!keep) throw new Error('The event to keep no longer exists')
  if ((keep as any).merged_into) throw new Error('The event to keep has itself been merged into another one')
  const local = new Set(((srcs ?? []) as any[]).map(r => r.event_source))
  const isLocal = (s: string | null) => !!s && (local.has(s) || /_council$/.test(s))
  let merged = 0
  const clashes: string[] = []
  for (const id of ids.slice(1)) {
    const dup = byId.get(id)
    if (!dup || (dup as any).merged_into) continue
    const r = await mergeOne(db, keep, dup, isLocal(dup.source))
    clashes.push(...r.clashes)
    merged++
  }
  if (merged) {
    const { error: refreshError } = await db.rpc('refresh_event_canonical')
    if (refreshError) throw new Error(`refresh_event_canonical: ${refreshError.message}`)
  }
  return { merged, clashes }
}
